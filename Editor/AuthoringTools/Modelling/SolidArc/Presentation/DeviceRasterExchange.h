//============================================================================================================================================
//                               EDITOR/AUTHORINGTOOLS/MODELLING/SOLIDARC/PRESENTATION/DEVICERASTEREXCHANGE.H
//============================================================================================================================================
// 📦 GPU implementation of RasterExchange: the SolidArc Device*.slang pipelines on a Vulkan device, shared with or beside Frontier.exe

// The verbs are the ones SoftwareRaster implements, so ScenePresentation, the gizmo and the console are unchanged. Each target is one render
//    pass with a colour, a pick (R32_UINT) and a depth attachment; it is recorded, submitted and waited on inside EndTarget, then read back.
//    The header names no Vulkan type, so SolidArc stays buildable without the Vulkan headers; handles cross as 64-bit integers.
#pragma once

#include "RasterExchange.h"
#include <memory>
#include <string>

namespace Frontier
{

// A device the host already owns (Frontier.exe) — or all zeros, which asks the raster to open its own headless one.
struct DeviceRasterBinding
{
    uint64_t    PhysicalDevice = 0;                                                     // [-] VkPhysicalDevice
    uint64_t    Device         = 0;                                                     // [-] VkDevice
    uint64_t    Queue          = 0;                                                     // [-] VkQueue, graphics-capable
    uint64_t    PipelineCache  = 0;                                                     // [-] VkPipelineCache, 0 = none
    uint32_t    QueueFamily    = 0;                                                     // [-]
    // [-] folder holding Device*.spv (see Presentation/Shaders)
    std::string SpirvDirectory;
};

class DeviceRasterExchange final : public RasterExchange
{
public:
    // Returns null and fills Refusal when the device, a shader or a pipeline is unavailable. The caller keeps its software raster then.
    [[nodiscard]] static std::unique_ptr<DeviceRasterExchange> Create(uint32_t Width, uint32_t Height, const DeviceRasterBinding& Binding,
                                                                      std::string& Refusal) noexcept;
    ~DeviceRasterExchange() override;

    void     Resize(uint32_t Width, uint32_t Height) noexcept override;
    uint32_t Width() const noexcept override;
    uint32_t Height() const noexcept override;

    void BeginTarget(const float ClearColour[4]) noexcept override;
    void BindView(const ViewRecord& View) noexcept override;
    void DrawLattice() noexcept override;
    void DrawSurface(const SurfaceStream& Stream, const DrawRecord& Draw) noexcept override;
    void DrawSegments(const SegmentStream& Stream, const DrawRecord& Draw) noexcept override;
    void DrawPoints(const PointStream& Stream, const DrawRecord& Draw) noexcept override;
    void BeginOverlay() noexcept override;
    void EndTarget() noexcept override;

    void     AssignSamples(uint32_t Samples) noexcept override;
    uint32_t QuerySamples() const noexcept override;
    const char* QueryBackend() const noexcept override;
    float    QueryTargetMilliseconds() const noexcept override;

    RasterImage Readback() const noexcept override;
    uint32_t    Pick(uint32_t X, uint32_t Y) const noexcept override;
    float       Depth(uint32_t X, uint32_t Y) const noexcept override;
    Tally       QueryTally() const noexcept override;

private:
    DeviceRasterExchange() noexcept;
    struct Detail;
    std::unique_ptr<Detail> Self;
};

} // namespace Frontier
