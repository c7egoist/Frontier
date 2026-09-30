//============================================================================================================================================
//  RayQueryAccel.h — host build of the hardware acceleration structure + descriptor for the RayQuery ReSTIR path (#31)
//============================================================================================================================================
//  Companion to Engine/Shaders/ReSTIRTraversal_RayQuery.slang. Builds a BLAS per resident instance (object space) and a
//  TLAS over them, writes the TLAS into its own descriptor set (set 1, binding 0), and exposes the device-creation
//  additions the RayQuery tier needs. Everything here is GATED on the resolved RayTracingTierCategory: on a Software
//  tier none of it is created and the kernel keeps its compute CWBVH walk.
//
//  The build recipe is the standard VK_KHR_acceleration_structure one (see RayQueryHardwarePath.md for the prose):
//    1. per instance → VkAccelerationStructureGeometryKHR (triangles: vertex buffer device address + stride, index
//       buffer device address, VK_GEOMETRY_OPAQUE_BIT so RayQuery needs no candidate handling)
//    2. vkGetAccelerationStructureBuildSizesKHR → allocate AS buffer + scratch → vkCmdBuildAccelerationStructuresKHR
//    3. one VkAccelerationStructureInstanceKHR per instance: transform = GpuInstance.World (row-major 3x4),
//       instanceCustomIndex = the TOP-LEVEL ROW (so the shader's InstanceCustomIndex == TraversalResult.instance),
//       accelerationStructureReference = BLAS device address
//    4. build the TLAS the same way over that instance array
//    5. VK_DESCRIPTOR_TYPE_ACCELERATION_STRUCTURE_KHR write via VkWriteDescriptorSetAccelerationStructureKHR
//============================================================================================================================================
#pragma once

#include <vulkan/vulkan.h>
#include <cstdint>
#include <vector>
#include "DeviceExchange/RayTracingCapabilitySet.h"   // RayTracingTierCategory

namespace Frontier {

// Mirrors the engine's GpuInstance fields this build needs (SwapchainExchange.h). Passed in so this module does not
//    depend on the full scene record header.
struct RayQueryInstanceDesc
{
    float    World[12];        // row-major 3x4 object->world (top 3 rows of GpuInstance.World)
    uint32_t VertexOffset;     // first vertex of this instance in the shared Vertices[] buffer
    uint32_t FirstIndex;       // first index of this instance in the shared Indices[] buffer
    uint32_t TriangleCount;    // triangles = index count / 3
    uint32_t TopLevelRow;      // becomes instanceCustomIndex → TraversalResult.instance
};

struct RayQueryAccel
{
    // ── device-creation additions (call while building VkDeviceCreateInfo) ────────────────────────────────────────
    // Appends VK_KHR_acceleration_structure / VK_KHR_ray_query / VK_KHR_deferred_host_operations to `extensions` and
    //    chains the required feature structs (accelerationStructure, rayQuery, bufferDeviceAddress) onto `pNextChain`.
    //    No-op unless tier >= RayQuery. The feature structs are owned by the caller-provided storage so they outlive
    //    vkCreateDevice.
    struct FeatureStorage
    {
        VkPhysicalDeviceAccelerationStructureFeaturesKHR accel{};
        VkPhysicalDeviceRayQueryFeaturesKHR             query{};
        VkPhysicalDeviceBufferDeviceAddressFeatures     bda{};
    };
    static void AppendDeviceRequirements(RayTracingTierCategory tier,
                                         std::vector<const char*>& extensions,
                                         FeatureStorage& storage,
                                         void** pNextChain);

    // ── build / rebuild ───────────────────────────────────────────────────────────────────────────────────────────
    // vertexBuffer/indexBuffer are the SAME device-address-enabled buffers the raster + CWBVH paths already use
    //    (Vertices[] binding 11, Indices[] binding 12). vertexStride is sizeof(GpuVertex) = 64. Builds all BLASes and
    //    the TLAS on `cmd` (caller submits + waits or barriers before first trace). Safe to call per resident scene.
    bool Build(VkDevice device, VkPhysicalDevice phys, VkCommandBuffer cmd,
               VkBuffer vertexBuffer, VkDeviceSize vertexStride,
               VkBuffer indexBuffer,
               const std::vector<RayQueryInstanceDesc>& instances);

    // ── descriptor (set 1, binding 0) ─────────────────────────────────────────────────────────────────────────────
    VkDescriptorSetLayout CreateSetLayout(VkDevice device);                 // one binding: ACCELERATION_STRUCTURE_KHR, COMPUTE
    void WriteDescriptor(VkDevice device, VkDescriptorSet set, uint32_t binding = 0) const;  // points binding at the TLAS

    VkAccelerationStructureKHR Tlas() const { return tlas_; }
    void Destroy(VkDevice device);

private:
    struct Buf { VkBuffer buffer = VK_NULL_HANDLE; VkDeviceMemory memory = VK_NULL_HANDLE; VkDeviceAddress address = 0; };
    std::vector<VkAccelerationStructureKHR> blas_;
    std::vector<Buf>                        blasBufs_;
    VkAccelerationStructureKHR              tlas_ = VK_NULL_HANDLE;
    Buf                                     tlasBuf_{};
    Buf                                     instanceBuf_{};   // VkAccelerationStructureInstanceKHR array
    Buf                                     scratch_{};
};

} // namespace Frontier
