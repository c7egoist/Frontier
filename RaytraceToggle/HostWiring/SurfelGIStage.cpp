//============================================================================================================================================
// 📦 Engine/DeviceExchange/SurfelGIStage.cpp — implementation. See SurfelGIStage.h for the contract.
//============================================================================================================================================
#include "SurfelGIStage.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iostream>

namespace Frontier
{
namespace
{
    //--------------------------------------------------------------------------------------------------------------------
    // Buffer allocation — mirrors SwapchainExchange::AllocateBuffer so the two agree on memory-type selection.
    //--------------------------------------------------------------------------------------------------------------------
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
            if ((Req.memoryTypeBits & (1u << i)) && (Mem.memoryTypes[i].propertyFlags & MemoryFlags) == MemoryFlags) { TypeIndex = i; break; }
        if (TypeIndex == UINT32_MAX) return false;

        VkMemoryAllocateInfo AllocInfo{ VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO };
        AllocInfo.allocationSize = Req.size; AllocInfo.memoryTypeIndex = TypeIndex;
        if (vkAllocateMemory(Device, &AllocInfo, nullptr, &OutMemory) != VK_SUCCESS) return false;
        return vkBindBufferMemory(Device, OutBuffer, OutMemory, 0) == VK_SUCCESS;
    }

    std::vector<uint32_t> LoadSpirv(const std::string& Path) noexcept
    {
        std::ifstream File(Path, std::ios::binary | std::ios::ate);
        if (!File.is_open()) { std::cerr << "[SurfelGIStage] cannot open SPIR-V: " << Path << "\n"; return {}; }
        const std::streamsize Bytes = File.tellg();
        if (Bytes < 4 || (Bytes % 4) != 0) { std::cerr << "[SurfelGIStage] malformed SPIR-V: " << Path << "\n"; return {}; }
        std::vector<uint32_t> Spirv(static_cast<size_t>(Bytes) / 4u);
        File.seekg(0); File.read(reinterpret_cast<char*>(Spirv.data()), Bytes);
        return Spirv;
    }

    VkShaderModule MakeModule(VkDevice Device, const std::string& Path) noexcept
    {
        const std::vector<uint32_t> Spirv = LoadSpirv(Path);
        if (Spirv.empty()) return VK_NULL_HANDLE;
        VkShaderModuleCreateInfo Info{ VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO };
        Info.codeSize = Spirv.size() * 4u; Info.pCode = Spirv.data();
        VkShaderModule Module = VK_NULL_HANDLE;
        (void)vkCreateShaderModule(Device, &Info, nullptr, &Module);
        return Module;
    }

    VkDescriptorSetLayoutBinding StorageBuffer(uint32_t b) noexcept
    { return { b, VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, 1u, VK_SHADER_STAGE_COMPUTE_BIT, nullptr }; }
    VkDescriptorSetLayoutBinding StorageImage(uint32_t b) noexcept
    { return { b, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, 1u, VK_SHADER_STAGE_COMPUTE_BIT, nullptr }; }
    VkDescriptorSetLayoutBinding SampledImage(uint32_t b) noexcept
    { return { b, VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, 1u, VK_SHADER_STAGE_COMPUTE_BIT, nullptr }; }

    // Matches CellHash() in SurfelIrradianceUpdate.slang / SurfelGIResolve.slang exactly.
    inline uint32_t CellHash(int cx, int cy, int cz, uint32_t hashSize) noexcept
    {
        const uint32_t h = static_cast<uint32_t>(cx + 1024) * 73856093u
                         ^ static_cast<uint32_t>(cy + 1024) * 19349663u
                         ^ static_cast<uint32_t>(cz + 1024) * 83492791u;
        return h % hashSize;
    }
}

//========================================================================================================================
// Bring-up / teardown
//========================================================================================================================
bool SurfelGIStage::Bring(const SurfelStageInit& Init) noexcept
{
    I = Init;
    HostSurfels.reserve(I.MaxSurfels);
    HostGridHead.assign(I.GridHashSize, 0);
    HostGridNext.assign(I.MaxSurfels, 0);
    if (!CreateBuffers())   { std::cerr << "[SurfelGIStage] buffer allocation failed\n";  return false; }
    if (!CreatePipelines()) { std::cerr << "[SurfelGIStage] pipeline creation failed\n"; return false; }
    if (!WriteDescriptors()){ std::cerr << "[SurfelGIStage] descriptor write failed\n";  return false; }
    std::cerr << "[SurfelGIStage] up: max=" << I.MaxSurfels << " grid=" << I.GridHashSize
              << " cell=" << I.GridCellSize << " m\n";
    return true;
}

bool SurfelGIStage::CreateBuffers() noexcept
{
    const VkDeviceSize SurfelBytes = VkDeviceSize(I.MaxSurfels) * sizeof(GpuSurfel);
    const VkDeviceSize HeadBytes   = VkDeviceSize(I.GridHashSize) * sizeof(int32_t);
    const VkDeviceSize NextBytes   = VkDeviceSize(I.MaxSurfels) * sizeof(int32_t);
    const uint32_t DeviceLocal = VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT;
    const uint32_t HostVisible = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
    const VkBufferUsageFlags Ssbo = VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_TRANSFER_DST_BIT;
    const VkBufferUsageFlags Src  = VK_BUFFER_USAGE_TRANSFER_SRC_BIT;

    return AllocateBuffer(I.Device, I.MemoryProperties, SurfelBytes, Ssbo, DeviceLocal, SurfelBuffer, SurfelMem)
        && AllocateBuffer(I.Device, I.MemoryProperties, HeadBytes,   Ssbo, DeviceLocal, HeadBuffer,   HeadMem)
        && AllocateBuffer(I.Device, I.MemoryProperties, NextBytes,   Ssbo, DeviceLocal, NextBuffer,   NextMem)
        && AllocateBuffer(I.Device, I.MemoryProperties, SurfelBytes, Src,  HostVisible, SurfelStage,  SurfelStageMem)
        && AllocateBuffer(I.Device, I.MemoryProperties, HeadBytes,   Src,  HostVisible, HeadStage,    HeadStageMem)
        && AllocateBuffer(I.Device, I.MemoryProperties, NextBytes,   Src,  HostVisible, NextStage,    NextStageMem);
}

bool SurfelGIStage::CreatePipelines() noexcept
{
    auto BuildLayout = [&](const std::vector<VkDescriptorSetLayoutBinding>& Bindings,
                           uint32_t PushBytes, VkDescriptorSetLayout& SetLayout, VkPipelineLayout& PipeLayout)
    {
        VkDescriptorSetLayoutCreateInfo LI{ VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO };
        LI.bindingCount = static_cast<uint32_t>(Bindings.size()); LI.pBindings = Bindings.data();
        if (vkCreateDescriptorSetLayout(I.Device, &LI, nullptr, &SetLayout) != VK_SUCCESS) return false;
        VkPushConstantRange Push{ VK_SHADER_STAGE_COMPUTE_BIT, 0u, PushBytes };
        VkPipelineLayoutCreateInfo PI{ VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO };
        PI.setLayoutCount = 1u; PI.pSetLayouts = &SetLayout; PI.pushConstantRangeCount = 1u; PI.pPushConstantRanges = &Push;
        return vkCreatePipelineLayout(I.Device, &PI, nullptr, &PipeLayout) == VK_SUCCESS;
    };
    auto BuildPipeline = [&](const std::string& Spv, VkPipelineLayout PipeLayout, VkPipeline& Out)
    {
        VkShaderModule Module = MakeModule(I.Device, I.SpirvDirectory + "/" + Spv);
        if (Module == VK_NULL_HANDLE) return false;
        VkPipelineShaderStageCreateInfo Stage{ VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO };
        Stage.stage = VK_SHADER_STAGE_COMPUTE_BIT; Stage.module = Module; Stage.pName = "main";
        VkComputePipelineCreateInfo CI{ VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO };
        CI.stage = Stage; CI.layout = PipeLayout;
        const VkResult R = vkCreateComputePipelines(I.Device, VK_NULL_HANDLE, 1u, &CI, nullptr, &Out);
        vkDestroyShaderModule(I.Device, Module, nullptr);
        return R == VK_SUCCESS;
    };

    // push blocks: update/resolve = 6×vec4/uvec4 = 96 B; commit = one uvec4 = 16 B (see the shaders).
    if (!BuildLayout({ StorageBuffer(0), StorageBuffer(1), StorageBuffer(2), StorageBuffer(8), StorageBuffer(9) },
                     96u, UpdateLayout, UpdatePipeLayout)) return false;
    if (!BuildLayout({ StorageBuffer(0) }, 16u, CommitLayout, CommitPipeLayout)) return false;
    if (!BuildLayout({ StorageImage(0), StorageImage(1), StorageImage(2), StorageImage(3), StorageImage(4),
                       SampledImage(5), StorageBuffer(8), StorageBuffer(9),
                       StorageBuffer(10), StorageBuffer(11), StorageBuffer(12) },
                     96u, ResolveLayout, ResolvePipeLayout)) return false;

    return BuildPipeline("SurfelIrradianceUpdate.spv", UpdatePipeLayout,  UpdatePipeline)
        && BuildPipeline("SurfelCommit.spv",           CommitPipeLayout,  CommitPipeline)
        && BuildPipeline("SurfelGIResolve.spv",        ResolvePipeLayout, ResolvePipeline);
}

bool SurfelGIStage::WriteDescriptors() noexcept
{
    std::array<VkDescriptorSetLayout, 3> Layouts{ UpdateLayout, CommitLayout, ResolveLayout };
    std::array<VkDescriptorSet*, 3>      Sets{ &UpdateSet, &CommitSet, &ResolveSet };
    for (size_t i = 0; i < 3; ++i)
    {
        VkDescriptorSetAllocateInfo AI{ VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO };
        AI.descriptorPool = I.DescriptorPool; AI.descriptorSetCount = 1u; AI.pSetLayouts = &Layouts[i];
        if (vkAllocateDescriptorSets(I.Device, &AI, Sets[i]) != VK_SUCCESS) return false;
    }

    auto Buf = [](VkBuffer b){ return VkDescriptorBufferInfo{ b, 0u, VK_WHOLE_SIZE }; };
    auto Img = [](VkImageView v){ return VkDescriptorImageInfo{ VK_NULL_HANDLE, v, VK_IMAGE_LAYOUT_GENERAL }; };
    const VkDescriptorBufferInfo Surfel = Buf(SurfelBuffer), Head = Buf(HeadBuffer), Next = Buf(NextBuffer);
    const VkDescriptorBufferInfo Nodes  = Buf(I.CwbvhNodeBuffer), Tris = Buf(I.CwbvhLeafBuffer);
    const VkDescriptorImageInfo  Out = Img(I.OutputImageView), Surf = Img(I.SurfaceImageView), Norm = Img(I.NormalImageView);
    const VkDescriptorImageInfo  Alb = Img(I.AlbedoImageView), Aux = Img(I.MaterialAuxView);
    const VkDescriptorImageInfo  Sky{ I.SkyCubeSampler, I.SkyCubeView, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL };

    std::vector<VkWriteDescriptorSet> W;
    auto WB = [&](VkDescriptorSet s, uint32_t b, const VkDescriptorBufferInfo* i)
    { W.push_back({ VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET, nullptr, s, b, 0u, 1u, VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, nullptr, i, nullptr }); };
    auto WI = [&](VkDescriptorSet s, uint32_t b, const VkDescriptorImageInfo* i)
    { W.push_back({ VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET, nullptr, s, b, 0u, 1u, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, i, nullptr, nullptr }); };
    auto WS = [&](VkDescriptorSet s, uint32_t b, const VkDescriptorImageInfo* i)
    { W.push_back({ VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET, nullptr, s, b, 0u, 1u, VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, i, nullptr, nullptr }); };

    // Update: b0 Surfels, b1 Head, b2 Next, b8 Nodes, b9 Tris
    WB(UpdateSet, 0, &Surfel); WB(UpdateSet, 1, &Head); WB(UpdateSet, 2, &Next); WB(UpdateSet, 8, &Nodes); WB(UpdateSet, 9, &Tris);
    // Commit: b0 Surfels
    WB(CommitSet, 0, &Surfel);
    // Resolve: images 0-4, sky 5, nodes/tris 8/9, surfels 10, head 11, next 12
    WI(ResolveSet, 0, &Out); WI(ResolveSet, 1, &Surf); WI(ResolveSet, 2, &Norm); WI(ResolveSet, 3, &Alb); WI(ResolveSet, 4, &Aux);
    WS(ResolveSet, 5, &Sky); WB(ResolveSet, 8, &Nodes); WB(ResolveSet, 9, &Tris);
    WB(ResolveSet, 10, &Surfel); WB(ResolveSet, 11, &Head); WB(ResolveSet, 12, &Next);

    vkUpdateDescriptorSets(I.Device, static_cast<uint32_t>(W.size()), W.data(), 0u, nullptr);
    return true;
}

//========================================================================================================================
// Host-side field maintenance + hash-grid build
//========================================================================================================================
void SurfelGIStage::UpdateField(const std::vector<SurfaceSample>& Samples, const SurfelFrameParams& Params) noexcept
{
    ++FrameCounter;
    const float cell = I.GridCellSize;

    // 1) age the live field; recycle slots that have not been re-seen for a long time (simple staleness recycle).
    for (auto& s : HostSurfels)
        if (s.Albedo[3] > 0.5f) s.NormalAge[3] += 1.0f;

    // 2) spawn: for each supplied surface sample, if no live surfel already covers it (within its radius on the
    //    tangent plane) allocate one — reusing a dead slot when available, else growing the pool up to MaxSurfels.
    uint32_t spawned = 0u, recycled = 0u;
    auto radiusAt = [&](const float* /*p*/) { return cell; };   // one surfel per cell; caller scales cell to the scene
    for (const SurfaceSample& q : Samples)
    {
        const int cx = int(std::floor((q.Position[0] - Params.GridOrigin[0]) / cell));
        const int cy = int(std::floor((q.Position[1] - Params.GridOrigin[1]) / cell));
        const int cz = int(std::floor((q.Position[2] - Params.GridOrigin[2]) / cell));
        // covered? scan the cell chain we built last frame (cheap; empty on frame 0)
        bool covered = false;
        if (!HostGridHead.empty())
        {
            int idx = HostGridHead[CellHash(cx, cy, cz, I.GridHashSize)] - 1;
            for (int guard = 0; idx >= 0 && guard < 256; ++guard)
            {
                const GpuSurfel& s = HostSurfels[idx];
                const float d[3]{ q.Position[0]-s.PositionRadius[0], q.Position[1]-s.PositionRadius[1], q.Position[2]-s.PositionRadius[2] };
                const float dist = std::sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
                if (s.Albedo[3] > 0.5f && dist < s.PositionRadius[3]) { covered = true; break; }
                idx = HostGridNext[idx] - 1;
            }
        }
        if (covered) continue;

        GpuSurfel s{};
        const float r = radiusAt(q.Position);
        s.PositionRadius[0]=q.Position[0]; s.PositionRadius[1]=q.Position[1]; s.PositionRadius[2]=q.Position[2]; s.PositionRadius[3]=r;
        s.NormalAge[0]=q.Normal[0]; s.NormalAge[1]=q.Normal[1]; s.NormalAge[2]=q.Normal[2]; s.NormalAge[3]=0.0f;
        s.Albedo[0]=q.Albedo[0]; s.Albedo[1]=q.Albedo[1]; s.Albedo[2]=q.Albedo[2]; s.Albedo[3]=1.0f;   // alive

        // reuse a dead slot if one exists, else append
        bool placed = false;
        for (uint32_t k = 0; k < HostSurfels.size(); ++k)
            if (HostSurfels[k].Albedo[3] < 0.5f) { HostSurfels[k] = s; ++recycled; placed = true; break; }
        if (!placed && HostSurfels.size() < I.MaxSurfels) { HostSurfels.push_back(s); ++spawned; }
    }

    // 3) build the hash grid on the host: clear heads, then prepend each live surfel to its cell chain (+1 encoding).
    LiveCount = 0u;
    std::fill(HostGridHead.begin(), HostGridHead.end(), 0);
    if (HostGridNext.size() < HostSurfels.size()) HostGridNext.resize(HostSurfels.size(), 0);
    for (uint32_t i = 0; i < HostSurfels.size(); ++i)
    {
        const GpuSurfel& s = HostSurfels[i];
        if (s.Albedo[3] < 0.5f) { HostGridNext[i] = 0; continue; }
        ++LiveCount;
        const int cx = int(std::floor((s.PositionRadius[0] - Params.GridOrigin[0]) / cell));
        const int cy = int(std::floor((s.PositionRadius[1] - Params.GridOrigin[1]) / cell));
        const int cz = int(std::floor((s.PositionRadius[2] - Params.GridOrigin[2]) / cell));
        const uint32_t h = CellHash(cx, cy, cz, I.GridHashSize);
        HostGridNext[i]  = HostGridHead[h];        // previous head becomes our next (+1-encoded; 0 = end)
        HostGridHead[h]  = int32_t(i) + 1;         // we are the new head (+1-encoded)
    }

    UploadBuffers();

    // 4) log (task requirement). Throttle to once a second at 60 fps so the console is readable.
    if (FrameCounter <= 3 || (FrameCounter % 60u) == 0u)
    {
        const float coverage = I.GridHashSize ? float(LiveCount) / float(I.GridHashSize) : 0.0f;
        std::cerr << "[SurfelGI] frame " << FrameCounter
                  << "  live=" << LiveCount << "/" << I.MaxSurfels
                  << "  spawned=" << spawned << "  recycled=" << recycled
                  << "  coverage=" << coverage << " surfels/cell"
                  << "  rays=" << Params.RayCount << "\n";
    }
}

void SurfelGIStage::UploadBuffers() noexcept
{
    auto Copy = [&](VkDeviceMemory Mem, const void* Src, VkDeviceSize Bytes)
    {
        if (Bytes == 0) return;
        void* Mapped = nullptr;
        if (vkMapMemory(I.Device, Mem, 0, Bytes, 0, &Mapped) == VK_SUCCESS)
        {
            std::memcpy(Mapped, Src, static_cast<size_t>(Bytes));
            vkUnmapMemory(I.Device, Mem);
        }
    };
    Copy(SurfelStageMem, HostSurfels.data(),  VkDeviceSize(HostSurfels.size()) * sizeof(GpuSurfel));
    Copy(HeadStageMem,   HostGridHead.data(), VkDeviceSize(HostGridHead.size()) * sizeof(int32_t));
    Copy(NextStageMem,   HostGridNext.data(), VkDeviceSize(HostSurfels.size()) * sizeof(int32_t));
    // NOTE: the staging→device transfers are recorded at the top of RecordFrame() so they land inside the frame's
    //       command buffer (one queue, correct ordering). See RecordFrame().
}

//========================================================================================================================
// Per-frame recording: (upload) → update → commit → resolve
//========================================================================================================================
void SurfelGIStage::RecordFrame(VkCommandBuffer Command, const SurfelFrameParams& Params) noexcept
{
    if (LiveCount == 0u) return;   // nothing to shade this frame; caller falls back to raster fill

    // 0) copy the CPU mirror into the device SSBOs, then barrier transfer→compute.
    auto CopyBuf = [&](VkBuffer Stage, VkBuffer Dst, VkDeviceSize Bytes)
    { VkBufferCopy R{ 0, 0, Bytes }; vkCmdCopyBuffer(Command, Stage, Dst, 1u, &R); };
    CopyBuf(SurfelStage, SurfelBuffer, VkDeviceSize(HostSurfels.size()) * sizeof(GpuSurfel));
    CopyBuf(HeadStage,   HeadBuffer,   VkDeviceSize(HostGridHead.size()) * sizeof(int32_t));
    CopyBuf(NextStage,   NextBuffer,   VkDeviceSize(HostSurfels.size()) * sizeof(int32_t));

    VkMemoryBarrier ToCompute{ VK_STRUCTURE_TYPE_MEMORY_BARRIER };
    ToCompute.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
    ToCompute.dstAccessMask = VK_ACCESS_SHADER_READ_BIT | VK_ACCESS_SHADER_WRITE_BIT;
    vkCmdPipelineBarrier(Command, VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT,
                         0u, 1u, &ToCompute, 0u, nullptr, 0u, nullptr);

    VkMemoryBarrier ComputeRW{ VK_STRUCTURE_TYPE_MEMORY_BARRIER };
    ComputeRW.srcAccessMask = VK_ACCESS_SHADER_WRITE_BIT;
    ComputeRW.dstAccessMask = VK_ACCESS_SHADER_READ_BIT | VK_ACCESS_SHADER_WRITE_BIT;
    auto ComputeBarrier = [&]{
        vkCmdPipelineBarrier(Command, VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT,
                             0u, 1u, &ComputeRW, 0u, nullptr, 0u, nullptr);
    };

    const uint32_t Groups1D = (LiveCount + 63u) / 64u;

    // 1) SurfelIrradianceUpdate — one thread per surfel; writes IrradianceNew (Jacobi target).
    struct UpdatePush { float Sun[4], SunCol[4], Sky[4], Grid[4]; uint32_t Counts[4]; float Tuning[4]; } up{};
    up.Sun[0]=Params.SunDirection[0]; up.Sun[1]=Params.SunDirection[1]; up.Sun[2]=Params.SunDirection[2]; up.Sun[3]=Params.SunRadiance;
    up.SunCol[0]=Params.SunColour[0]; up.SunCol[1]=Params.SunColour[1]; up.SunCol[2]=Params.SunColour[2];
    up.Sky[0]=Params.SkyAmbient[0]; up.Sky[1]=Params.SkyAmbient[1]; up.Sky[2]=Params.SkyAmbient[2];
    up.Grid[0]=Params.GridOrigin[0]; up.Grid[1]=Params.GridOrigin[1]; up.Grid[2]=Params.GridOrigin[2]; up.Grid[3]=I.GridCellSize;
    up.Counts[0]=LiveCount; up.Counts[1]=Params.FrameIndex; up.Counts[2]=Params.RayCount; up.Counts[3]=I.GridHashSize;
    up.Tuning[0]=Params.FireflyClamp; up.Tuning[1]=Params.AgeCap;
    vkCmdBindPipeline(Command, VK_PIPELINE_BIND_POINT_COMPUTE, UpdatePipeline);
    vkCmdBindDescriptorSets(Command, VK_PIPELINE_BIND_POINT_COMPUTE, UpdatePipeLayout, 0u, 1u, &UpdateSet, 0u, nullptr);
    vkCmdPushConstants(Command, UpdatePipeLayout, VK_SHADER_STAGE_COMPUTE_BIT, 0u, sizeof(up), &up);
    vkCmdDispatch(Command, Groups1D, 1u, 1u);
    ComputeBarrier();

    // 1.5) SurfelCommit — Irradiance = IrradianceNew (deferred Jacobi swap).
    uint32_t commit[4]{ LiveCount, 0u, 0u, 0u };
    vkCmdBindPipeline(Command, VK_PIPELINE_BIND_POINT_COMPUTE, CommitPipeline);
    vkCmdBindDescriptorSets(Command, VK_PIPELINE_BIND_POINT_COMPUTE, CommitPipeLayout, 0u, 1u, &CommitSet, 0u, nullptr);
    vkCmdPushConstants(Command, CommitPipeLayout, VK_SHADER_STAGE_COMPUTE_BIT, 0u, sizeof(commit), commit);
    vkCmdDispatch(Command, Groups1D, 1u, 1u);
    ComputeBarrier();

    // 2) SurfelGIResolve — per-pixel; reads the G-buffer + surfel field, writes the presentation image.
    struct ResolvePush { float Sun[4], SunCol[4], Sky[4], Grid[4], Eye[4]; uint32_t Counts[4]; } rp{};
    std::memcpy(rp.Sun,  up.Sun,  sizeof(rp.Sun));
    std::memcpy(rp.SunCol, up.SunCol, sizeof(rp.SunCol));
    std::memcpy(rp.Grid, up.Grid, sizeof(rp.Grid));
    rp.Sky[0]=Params.SkyAmbient[0]; rp.Sky[1]=Params.SkyAmbient[1]; rp.Sky[2]=Params.SkyAmbient[2]; rp.Sky[3]=Params.Exposure;
    rp.Eye[0]=Params.CameraEye[0]; rp.Eye[1]=Params.CameraEye[1]; rp.Eye[2]=Params.CameraEye[2];
    rp.Counts[0]=LiveCount; rp.Counts[1]=I.GridHashSize; rp.Counts[2]=Params.FeatureFlags; rp.Counts[3]=Params.ReflectionMode;
    const uint32_t Gx = (Params.RenderWidth  + 15u) / 16u;
    const uint32_t Gy = (Params.RenderHeight + 15u) / 16u;
    vkCmdBindPipeline(Command, VK_PIPELINE_BIND_POINT_COMPUTE, ResolvePipeline);
    vkCmdBindDescriptorSets(Command, VK_PIPELINE_BIND_POINT_COMPUTE, ResolvePipeLayout, 0u, 1u, &ResolveSet, 0u, nullptr);
    vkCmdPushConstants(Command, ResolvePipeLayout, VK_SHADER_STAGE_COMPUTE_BIT, 0u, sizeof(rp), &rp);
    vkCmdDispatch(Command, Gx, Gy, 1u);
}

//========================================================================================================================
// Teardown
//========================================================================================================================
void SurfelGIStage::Destroy() noexcept
{
    if (I.Device == VK_NULL_HANDLE) return;
    auto DB = [&](VkBuffer& b, VkDeviceMemory& m){ if (b) vkDestroyBuffer(I.Device, b, nullptr); if (m) vkFreeMemory(I.Device, m, nullptr); b=VK_NULL_HANDLE; m=VK_NULL_HANDLE; };
    DB(SurfelBuffer, SurfelMem); DB(HeadBuffer, HeadMem); DB(NextBuffer, NextMem);
    DB(SurfelStage, SurfelStageMem); DB(HeadStage, HeadStageMem); DB(NextStage, NextStageMem);
    auto DP = [&](VkPipeline& p){ if (p) vkDestroyPipeline(I.Device, p, nullptr); p=VK_NULL_HANDLE; };
    DP(UpdatePipeline); DP(CommitPipeline); DP(ResolvePipeline);
    auto DPL = [&](VkPipelineLayout& l){ if (l) vkDestroyPipelineLayout(I.Device, l, nullptr); l=VK_NULL_HANDLE; };
    DPL(UpdatePipeLayout); DPL(CommitPipeLayout); DPL(ResolvePipeLayout);
    auto DSL = [&](VkDescriptorSetLayout& l){ if (l) vkDestroyDescriptorSetLayout(I.Device, l, nullptr); l=VK_NULL_HANDLE; };
    DSL(UpdateLayout); DSL(CommitLayout); DSL(ResolveLayout);
}
}
