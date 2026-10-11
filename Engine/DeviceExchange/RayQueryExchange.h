//============================================================================================================================================
//                                                           RAYQUERYEXCHANGE.H
//============================================================================================================================================
// 📦 Owns Vulkan triangle acceleration and queue-ordered placement refits for inline hardware ray queries.

#pragma once

#include <vulkan/vulkan.h>
#include <vector>

namespace Frontier {
class SceneStructure;
struct InstanceRecord;
struct VertexRecord;

class RayQueryExchange
{
public:
    bool Construct(VkDevice Device, VkPhysicalDevice PhysicalDevice, VkQueue Queue, uint32_t QueueFamily);
    bool ConstructScene(const SceneStructure& Scene);
    bool RefreshPlacements(const InstanceRecord* Placements, uint32_t Count);
    /// 📦 Rewrites the resident vertex extent in place after a topology-preserving deformation and marks the bottom
    ///    levels for an update build. The bottom levels themselves are rebuilt by the next RecordRefit, in queue
    ///    order, so no recording that is still reading them can observe a half-written vehicle.
    /// in    Points   [vertices] the deformed vertex records, in construction order
    /// in    Count    [vertices] how many records Points holds; must equal the resident count
    /// err   returns false when no scene is resident, the bottom levels were built without the update flag, the
    ///       vertex extent is not host mapped, or Count exceeds it — the caller must then fall back to a rebuild
    /// cost  🚩
    /// tag   api, nonallocating, nonthrowing
    bool RefreshVertices(const VertexRecord* Points, uint32_t Count);
    void RecordRefit(VkCommandBuffer Command);
    void Retire();
    [[nodiscard]] bool Ready() const noexcept { return SceneReady; }
    [[nodiscard]] VkDescriptorSetLayout DescriptorLayout() const noexcept { return Layout; }
    [[nodiscard]] VkDescriptorSet Descriptors() const noexcept { return Descriptor; }

private:
    struct Extent
    {
        VkBuffer Buffer = VK_NULL_HANDLE;
        VkDeviceMemory Memory = VK_NULL_HANDLE;
        VkDeviceAddress Address = 0u;
        VkDeviceSize Bytes = 0u;
    };
    bool Allocate(Extent& Storage, VkDeviceSize Bytes, VkBufferUsageFlags Usage, const void* Source = nullptr);
    void Reclaim(Extent& Storage);
    void RetireScene();
    VkAccelerationStructureGeometryKHR PlacementGeometry() const;
    void RecordTopLevel(VkCommandBuffer Command, bool Refit);

    VkDevice Device = VK_NULL_HANDLE;
    VkPhysicalDevice PhysicalDevice = VK_NULL_HANDLE;
    VkQueue Queue = VK_NULL_HANDLE;
    VkCommandPool Commands = VK_NULL_HANDLE;
    VkDescriptorSetLayout Layout = VK_NULL_HANDLE;
    VkDescriptorPool DescriptorPool = VK_NULL_HANDLE;
    VkDescriptorSet Descriptor = VK_NULL_HANDLE;
    VkAccelerationStructureKHR TopLevel = VK_NULL_HANDLE;
    std::vector<VkAccelerationStructureKHR> BottomLevels;
    std::vector<Extent> BottomStorage;
    Extent Vertices, Indices, Placements, TopStorage, Scratch;
    std::vector<VkAccelerationStructureInstanceKHR> PendingPlacements;
    // 📝 Retained from ConstructScene so RecordRefit can rebuild the per-instance build record for an update.
    //    Build.pGeometries points INTO BottomGeometry, which is why this cannot be a local that outlives the call.
    std::vector<VkAccelerationStructureGeometryKHR>       BottomGeometry;
    std::vector<VkAccelerationStructureBuildRangeInfoKHR> BottomSpans;
    void*       VertexMapping    = nullptr;   // [-]      persistent host mapping of Vertices, rewritten on deformation
    bool        VerticesPending  = false;     // [-]      a deformation arrived since the last refit
    bool        BottomRefittable = false;     // [-]      bottom levels carry ALLOW_UPDATE, so MODE_UPDATE is legal
    VkDeviceSize ScratchAlignment = 256u;
    VkDeviceAddress ScratchAddress = 0u;
    bool SceneReady = false;
    bool PlacementsPending = false;
    PFN_vkGetAccelerationStructureBuildSizesKHR BuildSizes = nullptr;
    PFN_vkCreateAccelerationStructureKHR CreateAcceleration = nullptr;
    PFN_vkDestroyAccelerationStructureKHR DestroyAcceleration = nullptr;
    PFN_vkCmdBuildAccelerationStructuresKHR BuildAcceleration = nullptr;
    PFN_vkGetAccelerationStructureDeviceAddressKHR AccelerationAddress = nullptr;
};
}
