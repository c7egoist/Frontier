//============================================================================================================================================
// 📦 Frontier/Engine/DeviceExchange/DistanceFieldGIStage.h — Host owner of the Distance Field GI compute stage (RenderPath == 1)
//============================================================================================================================================
// Replaces the legacy Surfel GI stage. It owns:
//    • Global Distance Field (GDF) 3D clipmap buffers and Surface Cache atlas allocations;
//    • Primary visibility depth-buffer accelerated lighting evaluation;
//    • Monotonic contact soft shadow evaluation (k * H / t);
//    • Multi-bounce emissive bleed (Row 8 luminaires) and distance field ambient occlusion (AO);
//    • Sharp specular reflection and transmissive glass refraction routing;
//    • DistanceFieldGIResolve compute pipeline and descriptor management.

#pragma once

#include <vulkan/vulkan.h>
#include <cstdint>
#include <string>
#include <vector>

namespace Frontier
{

struct DistanceFieldSurfaceSample
{
    float Position[3];
    float Normal[3];
    float Albedo[3];
    float Roughness;
    float Metallic;
    uint32_t InstanceIndex;
};

struct DistanceFieldStageInit
{
    VkDevice Device = VK_NULL_HANDLE;
    VkPhysicalDeviceMemoryProperties MemoryProperties{};
    VkBuffer CwbvhNodeBuffer = VK_NULL_HANDLE;
    VkBuffer CwbvhLeafBuffer = VK_NULL_HANDLE;
    VkImageView OutputImageView = VK_NULL_HANDLE;
    VkImageView SurfaceImageView = VK_NULL_HANDLE;
    VkImageView NormalImageView = VK_NULL_HANDLE;
    VkBuffer TriangleBuffer = VK_NULL_HANDLE;
    VkBuffer MaterialBuffer = VK_NULL_HANDLE;
    VkBuffer InstanceBuffer = VK_NULL_HANDLE;
    VkBuffer SlabBuffer = VK_NULL_HANDLE;
    VkBuffer VertexBuffer = VK_NULL_HANDLE;
    VkBuffer IndexBuffer = VK_NULL_HANDLE;
    VkSampler TableSampler = VK_NULL_HANDLE;
    VkImageView EnergyLutView = VK_NULL_HANDLE;
    VkImageView SheenLutView = VK_NULL_HANDLE;
    VkSampler TextureSampler = VK_NULL_HANDLE;
    const VkImageView* TextureViews = nullptr;
    uint32_t TextureCount = 0u;
    uint32_t TextureCapacity = 0u;
    uint32_t VolumeResolution = 128u;
    float ClipmapCellSize = 0.15f;
};

struct DistanceFieldFrameParams
{
    float SunDirection[3] = { 0.1473f, -0.1179f, 0.9820f };
    float SunRadiance = 1.0f;
    float SunColour[3] = { 1.0f, 0.96f, 0.90f };
    float Exposure = 1.0f;
    float SkyAmbient[3] = { 0.05f, 0.07f, 0.12f };
    float ShadowSoftness = 0.22f;
    float CameraEye[3] = { 0.0f, -5.0f, 2.0f };
    float GiBoost = 1.5f;
    uint32_t FrameIndex = 0u;
    uint32_t FeatureFlags = 0u;
    uint32_t ReflectionMode = 1u; // 0 = Off, 1 = Sky, 2 = Raytraced (Mesh BVH, no SDF blocks)
    uint32_t RenderWidth = 1920u;
    uint32_t RenderHeight = 1080u;
};

class DistanceFieldGIStage
{
public:
    DistanceFieldGIStage() noexcept = default;
    ~DistanceFieldGIStage() noexcept { Destroy(); }

    DistanceFieldGIStage(const DistanceFieldGIStage&) = delete;
    DistanceFieldGIStage& operator=(const DistanceFieldGIStage&) = delete;
    DistanceFieldGIStage(DistanceFieldGIStage&&) noexcept = default;
    DistanceFieldGIStage& operator=(DistanceFieldGIStage&&) noexcept = default;

    [[nodiscard]] bool Bring(const DistanceFieldStageInit& Init) noexcept;
    void Destroy() noexcept;

    [[nodiscard]] bool IsReady() const noexcept { return Pipeline != VK_NULL_HANDLE; }

    void SynchronizeField(const std::vector<DistanceFieldSurfaceSample>& Samples,
                          const DistanceFieldFrameParams& FrameParams) noexcept;

    [[nodiscard]] bool RecordFrame(VkCommandBuffer Command,
                                  const DistanceFieldFrameParams& FrameParams) noexcept;

private:
    [[nodiscard]] bool CreateBuffers() noexcept;
    [[nodiscard]] bool CreatePipelines() noexcept;
    [[nodiscard]] bool WriteDescriptors() noexcept;

    DistanceFieldStageInit InitializationData{};

    VkBuffer DistanceFieldBuffer = VK_NULL_HANDLE;
    VkDeviceMemory DistanceFieldMemory = VK_NULL_HANDLE;
    VkBuffer SurfaceCacheBuffer = VK_NULL_HANDLE;
    VkDeviceMemory SurfaceCacheMemory = VK_NULL_HANDLE;

    VkDescriptorPool DescriptorPool = VK_NULL_HANDLE;
    VkDescriptorSetLayout DescriptorLayout = VK_NULL_HANDLE;
    VkDescriptorSet DescriptorSet = VK_NULL_HANDLE;

    VkPipelineLayout PipelineLayout = VK_NULL_HANDLE;
    VkPipeline Pipeline = VK_NULL_HANDLE;

    uint32_t ActiveSurfaces = 0u;
    uint64_t AccumulatedFrames = 0u;
};

} // namespace Frontier
