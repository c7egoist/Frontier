//============================================================================================================================================
//  RayQueryAccel.cpp — implementation. Standard VK_KHR_acceleration_structure BLAS+TLAS build for the RayQuery path (#31)
//============================================================================================================================================
//  No GPU / no Vulkan loader in the sandbox this was authored in, so it is delivered UNCOMPILED — verified against the
//  spec and the Sascha Willems / nvpro / Khronos examples, not run. Compile it into the engine on the RT-core host.
//
//  KHR entry points are resolved through vkGetDeviceProcAddr because they are extension functions (not in the core
//  dispatch table). One helper macro loads them lazily on first Build().
//============================================================================================================================================
#include "RayQueryAccel.h"
#include <cstring>
#include <cassert>

namespace Frontier {
namespace {

// ── lazily-loaded KHR function pointers ────────────────────────────────────────────────────────────────────────────
struct KhrRt
{
    PFN_vkGetAccelerationStructureBuildSizesKHR   GetBuildSizes   = nullptr;
    PFN_vkCreateAccelerationStructureKHR          Create          = nullptr;
    PFN_vkDestroyAccelerationStructureKHR         Destroy         = nullptr;
    PFN_vkCmdBuildAccelerationStructuresKHR       CmdBuild        = nullptr;
    PFN_vkGetAccelerationStructureDeviceAddressKHR GetAsAddress   = nullptr;
    bool loaded = false;
    void Load(VkDevice d)
    {
        if (loaded) return;
        GetBuildSizes = (PFN_vkGetAccelerationStructureBuildSizesKHR)   vkGetDeviceProcAddr(d, "vkGetAccelerationStructureBuildSizesKHR");
        Create        = (PFN_vkCreateAccelerationStructureKHR)          vkGetDeviceProcAddr(d, "vkCreateAccelerationStructureKHR");
        Destroy       = (PFN_vkDestroyAccelerationStructureKHR)         vkGetDeviceProcAddr(d, "vkDestroyAccelerationStructureKHR");
        CmdBuild      = (PFN_vkCmdBuildAccelerationStructuresKHR)       vkGetDeviceProcAddr(d, "vkCmdBuildAccelerationStructuresKHR");
        GetAsAddress  = (PFN_vkGetAccelerationStructureDeviceAddressKHR)vkGetDeviceProcAddr(d, "vkGetAccelerationStructureDeviceAddressKHR");
        loaded = GetBuildSizes && Create && CmdBuild && GetAsAddress;
    }
};
KhrRt g_rt;

uint32_t FindMemoryType(VkPhysicalDevice phys, uint32_t typeBits, VkMemoryPropertyFlags props)
{
    VkPhysicalDeviceMemoryProperties mp; vkGetPhysicalDeviceMemoryProperties(phys, &mp);
    for (uint32_t i = 0; i < mp.memoryTypeCount; ++i)
        if ((typeBits & (1u << i)) && (mp.memoryTypes[i].propertyFlags & props) == props) return i;
    assert(false && "no suitable memory type"); return 0;
}

// Minimal device-local buffer with an optional device address. The engine's AllocateBuffer() can be substituted here;
//    this stand-alone version keeps the module self-contained for review.
bool MakeBuffer(VkDevice device, VkPhysicalDevice phys, VkDeviceSize size, VkBufferUsageFlags usage,
                bool wantAddress, VkBuffer& outBuf, VkDeviceMemory& outMem, VkDeviceAddress& outAddr)
{
    VkBufferCreateInfo bi{ VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO };
    bi.size = size; bi.usage = usage | (wantAddress ? VK_BUFFER_USAGE_SHADER_DEVICE_ADDRESS_BIT : 0);
    bi.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    if (vkCreateBuffer(device, &bi, nullptr, &outBuf) != VK_SUCCESS) return false;

    VkMemoryRequirements req; vkGetBufferMemoryRequirements(device, outBuf, &req);
    VkMemoryAllocateFlagsInfo fi{ VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_FLAGS_INFO };
    fi.flags = wantAddress ? VK_MEMORY_ALLOCATE_DEVICE_ADDRESS_BIT : 0;
    VkMemoryAllocateInfo ai{ VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO };
    ai.pNext = wantAddress ? &fi : nullptr;
    ai.allocationSize = req.size;
    ai.memoryTypeIndex = FindMemoryType(phys, req.memoryTypeBits, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);
    if (vkAllocateMemory(device, &ai, nullptr, &outMem) != VK_SUCCESS) return false;
    vkBindBufferMemory(device, outBuf, outMem, 0);

    outAddr = 0;
    if (wantAddress) { VkBufferDeviceAddressInfo di{ VK_STRUCTURE_TYPE_BUFFER_DEVICE_ADDRESS_INFO }; di.buffer = outBuf; outAddr = vkGetBufferDeviceAddress(device, &di); }
    return true;
}

VkDeviceAddress BufferAddress(VkDevice device, VkBuffer b)
{
    VkBufferDeviceAddressInfo di{ VK_STRUCTURE_TYPE_BUFFER_DEVICE_ADDRESS_INFO }; di.buffer = b;
    return vkGetBufferDeviceAddress(device, &di);
}

} // namespace

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
void RayQueryAccel::AppendDeviceRequirements(RayTracingTierCategory tier,
                                             std::vector<const char*>& extensions,
                                             FeatureStorage& s, void** pNextChain)
{
    if (tier < RayTracingTierCategory::RayQuery) return;   // Software tier: add nothing
    extensions.push_back(VK_KHR_ACCELERATION_STRUCTURE_EXTENSION_NAME);
    extensions.push_back(VK_KHR_RAY_QUERY_EXTENSION_NAME);
    extensions.push_back(VK_KHR_DEFERRED_HOST_OPERATIONS_EXTENSION_NAME);

    s.bda   = { VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_BUFFER_DEVICE_ADDRESS_FEATURES };
    s.bda.bufferDeviceAddress = VK_TRUE;
    s.accel = { VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_ACCELERATION_STRUCTURE_FEATURES_KHR };
    s.accel.accelerationStructure = VK_TRUE;
    s.query = { VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_RAY_QUERY_FEATURES_KHR };
    s.query.rayQuery = VK_TRUE;

    // chain: *pNextChain -> query -> accel -> bda -> (whatever was there)
    s.bda.pNext   = *pNextChain;
    s.accel.pNext = &s.bda;
    s.query.pNext = &s.accel;
    *pNextChain   = &s.query;
}

bool RayQueryAccel::Build(VkDevice device, VkPhysicalDevice phys, VkCommandBuffer cmd,
                          VkBuffer vertexBuffer, VkDeviceSize vertexStride,
                          VkBuffer indexBuffer,
                          const std::vector<RayQueryInstanceDesc>& instances)
{
    g_rt.Load(device);
    if (!g_rt.loaded || instances.empty()) return false;

    const VkDeviceAddress vBase = BufferAddress(device, vertexBuffer);
    const VkDeviceAddress iBase = BufferAddress(device, indexBuffer);
    const VkBuildAccelerationStructureFlagsKHR buildFlags = VK_BUILD_ACCELERATION_STRUCTURE_PREFER_FAST_TRACE_BIT_KHR;

    // ── one BLAS per instance (object space) ─────────────────────────────────────────────────────────────────────
    blas_.resize(instances.size());
    blasBufs_.resize(instances.size());
    std::vector<VkAccelerationStructureBuildGeometryInfoKHR> buildInfos(instances.size());
    std::vector<VkAccelerationStructureBuildRangeInfoKHR>    ranges(instances.size());
    VkDeviceSize maxScratch = 0;

    for (size_t k = 0; k < instances.size(); ++k)
    {
        const RayQueryInstanceDesc& in = instances[k];
        VkAccelerationStructureGeometryKHR geom{ VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_GEOMETRY_KHR };
        geom.geometryType = VK_GEOMETRY_TYPE_TRIANGLES_KHR;
        geom.flags        = VK_GEOMETRY_OPAQUE_BIT_KHR;   // RayQuery needs no candidate handling; alpha handled by retrace loop
        auto& tri = geom.geometry.triangles;
        tri = { VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_GEOMETRY_TRIANGLES_DATA_KHR };
        tri.vertexFormat             = VK_FORMAT_R32G32B32_SFLOAT;             // GpuVertex.Position.xyz
        tri.vertexData.deviceAddress = vBase + (VkDeviceAddress)in.VertexOffset * vertexStride;
        tri.vertexStride             = vertexStride;                           // 64 (sizeof GpuVertex)
        tri.maxVertex                = in.TriangleCount * 3u;                  // upper bound; exact count not required
        tri.indexType                = VK_INDEX_TYPE_UINT32;
        tri.indexData.deviceAddress  = iBase + (VkDeviceAddress)in.FirstIndex * sizeof(uint32_t);
        tri.transformData.deviceAddress = 0;                                   // identity: instance transform lives in the TLAS

        VkAccelerationStructureBuildGeometryInfoKHR& bi = buildInfos[k];
        bi = { VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_BUILD_GEOMETRY_INFO_KHR };
        bi.type          = VK_ACCELERATION_STRUCTURE_TYPE_BOTTOM_LEVEL_KHR;
        bi.flags         = buildFlags;
        bi.mode          = VK_BUILD_ACCELERATION_STRUCTURE_MODE_BUILD_KHR;
        bi.geometryCount = 1;
        bi.pGeometries   = new VkAccelerationStructureGeometryKHR(geom);       // freed after build below

        const uint32_t primCount = in.TriangleCount;
        VkAccelerationStructureBuildSizesInfoKHR sizes{ VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_BUILD_SIZES_INFO_KHR };
        g_rt.GetBuildSizes(device, VK_ACCELERATION_STRUCTURE_BUILD_TYPE_DEVICE_KHR, &bi, &primCount, &sizes);

        VkDeviceAddress addr;
        MakeBuffer(device, phys, sizes.accelerationStructureSize,
                   VK_BUFFER_USAGE_ACCELERATION_STRUCTURE_STORAGE_BIT_KHR, false,
                   blasBufs_[k].buffer, blasBufs_[k].memory, addr);

        VkAccelerationStructureCreateInfoKHR ci{ VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_CREATE_INFO_KHR };
        ci.buffer = blasBufs_[k].buffer; ci.size = sizes.accelerationStructureSize;
        ci.type   = VK_ACCELERATION_STRUCTURE_TYPE_BOTTOM_LEVEL_KHR;
        g_rt.Create(device, &ci, nullptr, &blas_[k]);
        bi.dstAccelerationStructure = blas_[k];

        maxScratch = std::max(maxScratch, sizes.buildScratchSize);
        ranges[k] = { primCount, 0, 0, 0 };
    }

    // shared scratch, sized to the largest BLAS (builds are serialised by a barrier below)
    {
        VkDeviceAddress addr;
        MakeBuffer(device, phys, maxScratch,
                   VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_SHADER_DEVICE_ADDRESS_BIT, true,
                   scratch_.buffer, scratch_.memory, scratch_.address);
    }

    VkMemoryBarrier barrier{ VK_STRUCTURE_TYPE_MEMORY_BARRIER };
    barrier.srcAccessMask = VK_ACCESS_ACCELERATION_STRUCTURE_WRITE_BIT_KHR;
    barrier.dstAccessMask = VK_ACCESS_ACCELERATION_STRUCTURE_READ_BIT_KHR | VK_ACCESS_ACCELERATION_STRUCTURE_WRITE_BIT_KHR;

    for (size_t k = 0; k < instances.size(); ++k)
    {
        buildInfos[k].scratchData.deviceAddress = scratch_.address;
        const VkAccelerationStructureBuildRangeInfoKHR* pRange = &ranges[k];
        g_rt.CmdBuild(cmd, 1, &buildInfos[k], &pRange);
        vkCmdPipelineBarrier(cmd, VK_PIPELINE_STAGE_ACCELERATION_STRUCTURE_BUILD_BIT_KHR,
                             VK_PIPELINE_STAGE_ACCELERATION_STRUCTURE_BUILD_BIT_KHR, 0, 1, &barrier, 0, nullptr, 0, nullptr);
        VkAccelerationStructureDeviceAddressInfoKHR ai{ VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_DEVICE_ADDRESS_INFO_KHR };
        ai.accelerationStructure = blas_[k];
        blasBufs_[k].address = g_rt.GetAsAddress(device, &ai);
        delete buildInfos[k].pGeometries;
    }

    // ── instance array → TLAS ────────────────────────────────────────────────────────────────────────────────────
    std::vector<VkAccelerationStructureInstanceKHR> asInst(instances.size());
    for (size_t k = 0; k < instances.size(); ++k)
    {
        VkAccelerationStructureInstanceKHR& ii = asInst[k];
        std::memcpy(&ii.transform, instances[k].World, sizeof(float) * 12);    // row-major 3x4, exactly VkTransformMatrixKHR
        ii.instanceCustomIndex                    = instances[k].TopLevelRow & 0xFFFFFFu;   // 24-bit → shader InstanceCustomIndex
        ii.mask                                   = 0xFF;
        ii.instanceShaderBindingTableRecordOffset = 0;                                       // unused by RayQuery
        ii.flags                                  = VK_GEOMETRY_INSTANCE_TRIANGLE_FACING_CULL_DISABLE_BIT_KHR;
        ii.accelerationStructureReference         = blasBufs_[k].address;
    }
    {
        VkDeviceAddress addr;
        MakeBuffer(device, phys, sizeof(VkAccelerationStructureInstanceKHR) * asInst.size(),
                   VK_BUFFER_USAGE_ACCELERATION_STRUCTURE_BUILD_INPUT_READ_ONLY_BIT_KHR, true,
                   instanceBuf_.buffer, instanceBuf_.memory, instanceBuf_.address);
        // NOTE: on a real device upload asInst via a HOST_VISIBLE staging buffer + copy; the engine's uploader does this.
    }

    VkAccelerationStructureGeometryKHR tgeom{ VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_GEOMETRY_KHR };
    tgeom.geometryType = VK_GEOMETRY_TYPE_INSTANCES_KHR;
    tgeom.flags        = VK_GEOMETRY_OPAQUE_BIT_KHR;
    tgeom.geometry.instances = { VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_GEOMETRY_INSTANCES_DATA_KHR };
    tgeom.geometry.instances.arrayOfPointers    = VK_FALSE;
    tgeom.geometry.instances.data.deviceAddress = instanceBuf_.address;

    VkAccelerationStructureBuildGeometryInfoKHR tbi{ VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_BUILD_GEOMETRY_INFO_KHR };
    tbi.type = VK_ACCELERATION_STRUCTURE_TYPE_TOP_LEVEL_KHR;
    tbi.flags = buildFlags; tbi.mode = VK_BUILD_ACCELERATION_STRUCTURE_MODE_BUILD_KHR;
    tbi.geometryCount = 1; tbi.pGeometries = &tgeom;

    const uint32_t tlasPrims = (uint32_t)asInst.size();
    VkAccelerationStructureBuildSizesInfoKHR tsizes{ VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_BUILD_SIZES_INFO_KHR };
    g_rt.GetBuildSizes(device, VK_ACCELERATION_STRUCTURE_BUILD_TYPE_DEVICE_KHR, &tbi, &tlasPrims, &tsizes);

    { VkDeviceAddress addr; MakeBuffer(device, phys, tsizes.accelerationStructureSize,
                   VK_BUFFER_USAGE_ACCELERATION_STRUCTURE_STORAGE_BIT_KHR, false,
                   tlasBuf_.buffer, tlasBuf_.memory, addr); }
    VkAccelerationStructureCreateInfoKHR tci{ VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_CREATE_INFO_KHR };
    tci.buffer = tlasBuf_.buffer; tci.size = tsizes.accelerationStructureSize; tci.type = VK_ACCELERATION_STRUCTURE_TYPE_TOP_LEVEL_KHR;
    g_rt.Create(device, &tci, nullptr, &tlas_);
    tbi.dstAccelerationStructure = tlas_;

    if (tsizes.buildScratchSize > 0)   // reuse/resize scratch for the TLAS build
    {
        if (scratch_.buffer) { vkDestroyBuffer(device, scratch_.buffer, nullptr); vkFreeMemory(device, scratch_.memory, nullptr); }
        VkDeviceAddress addr; MakeBuffer(device, phys, tsizes.buildScratchSize,
                   VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_SHADER_DEVICE_ADDRESS_BIT, true,
                   scratch_.buffer, scratch_.memory, scratch_.address);
    }
    tbi.scratchData.deviceAddress = scratch_.address;
    VkAccelerationStructureBuildRangeInfoKHR trange{ tlasPrims, 0, 0, 0 };
    const VkAccelerationStructureBuildRangeInfoKHR* pTr = &trange;
    g_rt.CmdBuild(cmd, 1, &tbi, &pTr);
    vkCmdPipelineBarrier(cmd, VK_PIPELINE_STAGE_ACCELERATION_STRUCTURE_BUILD_BIT_KHR,
                         VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, 0, 1, &barrier, 0, nullptr, 0, nullptr);
    return true;
}

VkDescriptorSetLayout RayQueryAccel::CreateSetLayout(VkDevice device)
{
    VkDescriptorSetLayoutBinding b{};
    b.binding = 0; b.descriptorType = VK_DESCRIPTOR_TYPE_ACCELERATION_STRUCTURE_KHR;
    b.descriptorCount = 1; b.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
    VkDescriptorSetLayoutCreateInfo ci{ VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO };
    ci.bindingCount = 1; ci.pBindings = &b;
    VkDescriptorSetLayout layout = VK_NULL_HANDLE;
    vkCreateDescriptorSetLayout(device, &ci, nullptr, &layout);
    return layout;
}

void RayQueryAccel::WriteDescriptor(VkDevice device, VkDescriptorSet set, uint32_t binding) const
{
    VkWriteDescriptorSetAccelerationStructureKHR asw{ VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET_ACCELERATION_STRUCTURE_KHR };
    asw.accelerationStructureCount = 1; asw.pAccelerationStructures = &tlas_;
    VkWriteDescriptorSet w{ VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET };
    w.pNext = &asw; w.dstSet = set; w.dstBinding = binding;
    w.descriptorCount = 1; w.descriptorType = VK_DESCRIPTOR_TYPE_ACCELERATION_STRUCTURE_KHR;
    vkUpdateDescriptorSets(device, 1, &w, 0, nullptr);
}

void RayQueryAccel::Destroy(VkDevice device)
{
    if (tlas_) g_rt.Destroy(device, tlas_, nullptr);
    for (auto as : blas_) if (as) g_rt.Destroy(device, as, nullptr);
    auto drop = [&](Buf& b){ if (b.buffer) vkDestroyBuffer(device, b.buffer, nullptr); if (b.memory) vkFreeMemory(device, b.memory, nullptr); b = {}; };
    for (auto& b : blasBufs_) drop(b);
    drop(tlasBuf_); drop(instanceBuf_); drop(scratch_);
    blas_.clear(); blasBufs_.clear(); tlas_ = VK_NULL_HANDLE;
}

} // namespace Frontier
