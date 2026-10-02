//============================================================================================================================================
// 📦 Frontier/Engine/DeviceExchange/DistanceFieldGIStage.cpp — Implementation of Distance Field GI compute stage
//============================================================================================================================================
#include "DistanceFieldGIStage.h"

#include <algorithm>
#include <array>
#include <vector>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iostream>

namespace Frontier
{
namespace
{

bool AllocateBuffer(VkDevice Device, const VkPhysicalDeviceMemoryProperties& Mem, VkDeviceSize Bytes,
                    VkBufferUsageFlags Usage, uint32_t MemoryFlags, VkBuffer& OutBuffer, VkDeviceMemory& OutMemory) noexcept
{
    VkBufferCreateInfo BufferInfo{ VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO };
    BufferInfo.size = Bytes; BufferInfo.usage = Usage; BufferInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    if (vkCreateBuffer(Device, &BufferInfo, nullptr, &OutBuffer) != VK_SUCCESS) return false;

    VkMemoryRequirements Req{};
    vkGetBufferMemoryRequirements(Device, OutBuffer, &Req);

    uint32_t TypeIndex = UINT32_MAX;
    for (uint32_t i = 0u; i < Mem.memoryTypeCount; ++i)
    {
        if ((Req.memoryTypeBits & (1u << i)) && (Mem.memoryTypes[i].propertyFlags & MemoryFlags) == MemoryFlags) { TypeIndex = i; break; }
    }
    if (TypeIndex == UINT32_MAX) return false;

    VkMemoryAllocateInfo AllocInfo{ VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO };
    AllocInfo.allocationSize = Req.size; AllocInfo.memoryTypeIndex = TypeIndex;
    if (vkAllocateMemory(Device, &AllocInfo, nullptr, &OutMemory) != VK_SUCCESS) return false;
    return vkBindBufferMemory(Device, OutBuffer, OutMemory, 0) == VK_SUCCESS;
}

std::vector<char> ReadBinaryFile(const std::string& Path) noexcept
{
    std::ifstream Stream(Path, std::ios::ate | std::ios::binary);
    if (!Stream.is_open()) return {};
    const size_t Bytes = static_cast<size_t>(Stream.tellg());
    std::vector<char> Buffer(Bytes);
    Stream.seekg(0);
    Stream.read(Buffer.data(), Bytes);
    return Buffer;
}

VkShaderModule MakeModule(VkDevice Device, const std::string& Path) noexcept
{
    const std::vector<char> Spirv = ReadBinaryFile(Path);
    if (Spirv.empty() || (Spirv.size() % 4u) != 0u) return VK_NULL_HANDLE;
    VkShaderModuleCreateInfo Info{ VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO };
    Info.codeSize = Spirv.size();
    Info.pCode = reinterpret_cast<const uint32_t*>(Spirv.data());
    VkShaderModule Mod = VK_NULL_HANDLE;
    return vkCreateShaderModule(Device, &Info, nullptr, &Mod) == VK_SUCCESS ? Mod : VK_NULL_HANDLE;
}

inline VkDescriptorSetLayoutBinding StorageImage(uint32_t Binding) noexcept
{
    VkDescriptorSetLayoutBinding B{};
    B.binding = Binding;
    B.descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_IMAGE;
    B.descriptorCount = 1u;
    B.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
    return B;
}

inline VkDescriptorSetLayoutBinding StorageBuffer(uint32_t Binding) noexcept
{
    VkDescriptorSetLayoutBinding B{};
    B.binding = Binding;
    B.descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
    B.descriptorCount = 1u;
    B.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
    return B;
}

inline VkDescriptorSetLayoutBinding Sampled(uint32_t Binding, uint32_t Count) noexcept
{
    VkDescriptorSetLayoutBinding B{};
    B.binding = Binding;
    B.descriptorType = VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE;
    B.descriptorCount = Count;
    B.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
    return B;
}

} // namespace

bool DistanceFieldGIStage::Bring(const DistanceFieldStageInit& Init) noexcept
{
    Destroy();
    InitializationData = Init;
    if (!InitializationData.Device) return false;
    if (!CreateBuffers()) return false;
    if (!CreatePipelines()) return false;
    if (!WriteDescriptors()) return false;
    return true;
}

void DistanceFieldGIStage::Destroy() noexcept
{
    if (InitializationData.Device != VK_NULL_HANDLE)
    {
        if (Pipeline != VK_NULL_HANDLE)       vkDestroyPipeline(InitializationData.Device, Pipeline, nullptr);
        if (PipelineLayout != VK_NULL_HANDLE) vkDestroyPipelineLayout(InitializationData.Device, PipelineLayout, nullptr);
        if (DescriptorLayout != VK_NULL_HANDLE) vkDestroyDescriptorSetLayout(InitializationData.Device, DescriptorLayout, nullptr);
        if (DescriptorPool != VK_NULL_HANDLE) vkDestroyDescriptorPool(InitializationData.Device, DescriptorPool, nullptr);

        if (DistanceFieldBuffer != VK_NULL_HANDLE) vkDestroyBuffer(InitializationData.Device, DistanceFieldBuffer, nullptr);
        if (DistanceFieldMemory != VK_NULL_HANDLE) vkFreeMemory(InitializationData.Device, DistanceFieldMemory, nullptr);

        if (SurfaceCacheBuffer != VK_NULL_HANDLE)  vkDestroyBuffer(InitializationData.Device, SurfaceCacheBuffer, nullptr);
        if (SurfaceCacheMemory != VK_NULL_HANDLE)  vkFreeMemory(InitializationData.Device, SurfaceCacheMemory, nullptr);
    }
    Pipeline = VK_NULL_HANDLE;
    PipelineLayout = VK_NULL_HANDLE;
    DescriptorLayout = VK_NULL_HANDLE;
    DescriptorPool = VK_NULL_HANDLE;
    DistanceFieldBuffer = VK_NULL_HANDLE;
    DistanceFieldMemory = VK_NULL_HANDLE;
    SurfaceCacheBuffer = VK_NULL_HANDLE;
    SurfaceCacheMemory = VK_NULL_HANDLE;
}

bool DistanceFieldGIStage::CreateBuffers() noexcept
{
    const VkDeviceSize VoxelBytes = VkDeviceSize(InitializationData.VolumeResolution) *
                                    InitializationData.VolumeResolution *
                                    InitializationData.VolumeResolution * sizeof(float);
    const VkBufferUsageFlags Usage = VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_TRANSFER_DST_BIT;
    if (!AllocateBuffer(InitializationData.Device, InitializationData.MemoryProperties, VoxelBytes,
                        Usage, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, DistanceFieldBuffer, DistanceFieldMemory))
        return false;

    // Surface Cache Atlas buffer (512x512 cards * 64 bytes per card)
    const VkDeviceSize CacheBytes = 512ull * 512ull * 64ull;
    if (!AllocateBuffer(InitializationData.Device, InitializationData.MemoryProperties, CacheBytes,
                        Usage, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, SurfaceCacheBuffer, SurfaceCacheMemory))
        return false;

    return true;
}

bool DistanceFieldGIStage::CreatePipelines() noexcept
{
    const uint32_t Slots = InitializationData.TextureCapacity;
    std::vector<VkDescriptorSetLayoutBinding> Bindings = {
        StorageImage(0),  // OutputImage
        StorageImage(1),  // SurfaceImage
        StorageImage(2),  // NormalImage
        StorageBuffer(3), // GDF Buffer
        StorageBuffer(4), // SurfaceCache Buffer
        StorageBuffer(8), // CwbvhNodeBuffer
        StorageBuffer(9), // CwbvhLeafBuffer
        StorageBuffer(10),// TriangleBuffer
        StorageBuffer(11),// MaterialBuffer
        StorageBuffer(12),// InstanceBuffer
        StorageBuffer(13),// SlabBuffer
        StorageBuffer(14),// VertexBuffer
        StorageBuffer(15) // IndexBuffer
    };
    if (Slots > 0u)
    {
        Bindings.push_back(Sampled(16, Slots));
    }

    VkDescriptorSetLayoutCreateInfo LayoutInfo{ VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO };
    LayoutInfo.bindingCount = static_cast<uint32_t>(Bindings.size());
    LayoutInfo.pBindings = Bindings.data();
    LayoutInfo.flags = Slots > 0u ? VkDescriptorSetLayoutCreateFlags(VK_DESCRIPTOR_SET_LAYOUT_CREATE_UPDATE_AFTER_BIND_POOL_BIT) : 0u;

    if (vkCreateDescriptorSetLayout(InitializationData.Device, &LayoutInfo, nullptr, &DescriptorLayout) != VK_SUCCESS)
        return false;

    VkPushConstantRange Push{ VK_SHADER_STAGE_COMPUTE_BIT, 0u, 96u };
    VkPipelineLayoutCreateInfo PipelineLayoutInfo{ VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO };
    PipelineLayoutInfo.setLayoutCount = 1u;
    PipelineLayoutInfo.pSetLayouts = &DescriptorLayout;
    PipelineLayoutInfo.pushConstantRangeCount = 1u;
    PipelineLayoutInfo.pPushConstantRanges = &Push;

    if (vkCreatePipelineLayout(InitializationData.Device, &PipelineLayoutInfo, nullptr, &PipelineLayout) != VK_SUCCESS)
        return false;

    const std::string SpvPath = "Frontier/Engine/Shaders/DistanceFieldGIResolve.spv";
    VkShaderModule Module = MakeModule(InitializationData.Device, SpvPath);
    if (Module == VK_NULL_HANDLE)
    {
        const std::string AltPath = "Engine/Shaders/DistanceFieldGIResolve.spv";
        Module = MakeModule(InitializationData.Device, AltPath);
    }
    if (Module != VK_NULL_HANDLE)
    {
        VkPipelineShaderStageCreateInfo Stage{ VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO };
        Stage.stage = VK_SHADER_STAGE_COMPUTE_BIT; Stage.module = Module; Stage.pName = "main";
        VkComputePipelineCreateInfo CI{ VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO };
        CI.stage = Stage; CI.layout = PipelineLayout;
        const VkResult R = vkCreateComputePipelines(InitializationData.Device, VK_NULL_HANDLE, 1u, &CI, nullptr, &Pipeline);
        vkDestroyShaderModule(InitializationData.Device, Module, nullptr);
        if (R != VK_SUCCESS) return false;
    }
    return true;
}

bool DistanceFieldGIStage::WriteDescriptors() noexcept
{
    const uint32_t Slots = InitializationData.TextureCapacity;
    std::vector<VkDescriptorPoolSize> PoolSizes = {
        { VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, 3u },
        { VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, 11u }
    };
    if (Slots > 0u) PoolSizes.push_back({ VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE, Slots });

    VkDescriptorPoolCreateInfo PoolInfo{ VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO };
    PoolInfo.maxSets = 2u;
    PoolInfo.poolSizeCount = static_cast<uint32_t>(PoolSizes.size());
    PoolInfo.pPoolSizes = PoolSizes.data();
    PoolInfo.flags = Slots > 0u ? VkDescriptorPoolCreateFlags(VK_DESCRIPTOR_POOL_CREATE_UPDATE_AFTER_BIND_BIT) : 0u;

    if (vkCreateDescriptorPool(InitializationData.Device, &PoolInfo, nullptr, &DescriptorPool) != VK_SUCCESS)
        return false;

    uint32_t TableSize = Slots;
    VkDescriptorSetVariableDescriptorCountAllocateInfo VarCount{ VK_STRUCTURE_TYPE_DESCRIPTOR_SET_VARIABLE_DESCRIPTOR_COUNT_ALLOCATE_INFO };
    VarCount.descriptorSetCount = 1u; VarCount.pDescriptorCounts = &TableSize;

    VkDescriptorSetAllocateInfo AllocInfo{ VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO };
    AllocInfo.descriptorPool = DescriptorPool;
    AllocInfo.descriptorSetCount = 1u;
    AllocInfo.pSetLayouts = &DescriptorLayout;
    AllocInfo.pNext = Slots > 0u ? &VarCount : nullptr;

    if (vkAllocateDescriptorSets(InitializationData.Device, &AllocInfo, &DescriptorSet) != VK_SUCCESS)
        return false;

    // Populate all descriptor writes for images and buffers
    std::vector<VkWriteDescriptorSet> Writes;
    std::vector<VkDescriptorImageInfo> StorageImages(3);
    StorageImages[0] = { VK_NULL_HANDLE, InitializationData.OutputImageView, VK_IMAGE_LAYOUT_GENERAL };
    StorageImages[1] = { VK_NULL_HANDLE, InitializationData.SurfaceImageView, VK_IMAGE_LAYOUT_GENERAL };
    StorageImages[2] = { VK_NULL_HANDLE, InitializationData.NormalImageView, VK_IMAGE_LAYOUT_GENERAL };

    for (uint32_t i = 0u; i < 3u; ++i)
    {
        VkWriteDescriptorSet W{ VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET };
        W.dstSet = DescriptorSet;
        W.dstBinding = i;
        W.descriptorCount = 1u;
        W.descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_IMAGE;
        W.pImageInfo = &StorageImages[i];
        Writes.push_back(W);
    }

    struct BufferBinding { uint32_t Binding; VkBuffer Buffer; };
    std::vector<BufferBinding> BufferMap = {
        { 3u, DistanceFieldBuffer },
        { 4u, SurfaceCacheBuffer },
        { 8u, InitializationData.CwbvhNodeBuffer },
        { 9u, InitializationData.CwbvhLeafBuffer },
        { 10u, InitializationData.TriangleBuffer },
        { 11u, InitializationData.MaterialBuffer },
        { 12u, InitializationData.InstanceBuffer },
        { 13u, InitializationData.SlabBuffer },
        { 14u, InitializationData.VertexBuffer },
        { 15u, InitializationData.IndexBuffer }
    };

    std::vector<VkDescriptorBufferInfo> BufferInfos(BufferMap.size());
    for (size_t i = 0u; i < BufferMap.size(); ++i)
    {
        BufferInfos[i] = { BufferMap[i].Buffer, 0u, VK_WHOLE_SIZE };
        VkWriteDescriptorSet W{ VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET };
        W.dstSet = DescriptorSet;
        W.dstBinding = BufferMap[i].Binding;
        W.descriptorCount = 1u;
        W.descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
        W.pBufferInfo = &BufferInfos[i];
        Writes.push_back(W);
    }

    std::vector<VkDescriptorImageInfo> TextureInfos;
    if (Slots > 0u && InitializationData.TextureCount > 0u && InitializationData.TextureViews)
    {
        TextureInfos.resize(InitializationData.TextureCount);
        for (uint32_t i = 0u; i < InitializationData.TextureCount; ++i)
        {
            TextureInfos[i] = { InitializationData.TextureSampler, InitializationData.TextureViews[i], VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL };
        }
        VkWriteDescriptorSet W{ VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET };
        W.dstSet = DescriptorSet;
        W.dstBinding = 16u;
        W.descriptorCount = InitializationData.TextureCount;
        W.descriptorType = VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE;
        W.pImageInfo = TextureInfos.data();
        Writes.push_back(W);
    }

    vkUpdateDescriptorSets(InitializationData.Device, static_cast<uint32_t>(Writes.size()), Writes.data(), 0u, nullptr);
    return true;
}

void DistanceFieldGIStage::SynchronizeField(const std::vector<DistanceFieldSurfaceSample>& Samples,
                                           const DistanceFieldFrameParams& FrameParams) noexcept
{
    ActiveSurfaces = static_cast<uint32_t>(Samples.size());
    AccumulatedFrames++;
}

bool DistanceFieldGIStage::RecordFrame(VkCommandBuffer Command,
                                      const DistanceFieldFrameParams& FrameParams) noexcept
{
    if (Pipeline == VK_NULL_HANDLE || Command == VK_NULL_HANDLE) return false;

    vkCmdBindPipeline(Command, VK_PIPELINE_BIND_POINT_COMPUTE, Pipeline);

    if (DescriptorSet != VK_NULL_HANDLE)
    {
        vkCmdBindDescriptorSets(Command, VK_PIPELINE_BIND_POINT_COMPUTE, PipelineLayout, 0u, 1u, &DescriptorSet, 0u, nullptr);
    }

    struct PushData {
        float SunDir[3]; float SunRad;
        float SunCol[3]; float Exposure;
        float SkyAmb[3]; float Softness;
        float CamEye[3]; float GiBoost;
        uint32_t FrameIdx; uint32_t FeatFlags;
        uint32_t ReflMode; uint32_t Width; uint32_t Height;
    } Params{};
    std::memcpy(Params.SunDir, FrameParams.SunDirection, sizeof(Params.SunDir));
    Params.SunRad = FrameParams.SunRadiance;
    std::memcpy(Params.SunCol, FrameParams.SunColour, sizeof(Params.SunCol));
    Params.Exposure = FrameParams.Exposure;
    std::memcpy(Params.SkyAmb, FrameParams.SkyAmbient, sizeof(Params.SkyAmb));
    Params.Softness = FrameParams.ShadowSoftness;
    std::memcpy(Params.CamEye, FrameParams.CameraEye, sizeof(Params.CamEye));
    Params.GiBoost = FrameParams.GiBoost;
    Params.FrameIdx = FrameParams.FrameIndex;
    Params.FeatFlags = FrameParams.FeatureFlags;
    Params.ReflMode = FrameParams.ReflectionMode;
    Params.Width = FrameParams.RenderWidth;
    Params.Height = FrameParams.RenderHeight;

    vkCmdPushConstants(Command, PipelineLayout, VK_SHADER_STAGE_COMPUTE_BIT, 0u, sizeof(Params), &Params);

    const uint32_t GroupX = (FrameParams.RenderWidth + 15u) / 16u;
    const uint32_t GroupY = (FrameParams.RenderHeight + 15u) / 16u;
    vkCmdDispatch(Command, GroupX, GroupY, 1u);
    return true;
}

} // namespace Frontier
