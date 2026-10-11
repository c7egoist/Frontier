//============================================================================================================================================
//                                                             RENDERMETRICS.H
//============================================================================================================================================
// 📦 Per-pass GPU timers, AMD buffer markers, VK_EXT_device_fault capture and five-second frame windows for the Vulkan renderer.

#pragma once
#include <vulkan/vulkan.h>
#include <chrono>
#include <cstdint>
#include <string>
#include <vector>

namespace Frontier
{
/// 📦 Everything the renderer reports about its own cost and its own failures, in one place so the log lines stay uniform.
///
///    Timers  A timestamp pool with one stripe per frame slot. `OpenFrame` harvests the stripe written `SlotCount` frames ago, so no fence
///            is added and nothing stalls. A pass is the span between the previous `ClosePass` and this one, so it includes the barrier
///            bubble in front of it; that is the cost the next pass actually waits for.
///    Markers VK_AMD_buffer_marker writes land in host-visible memory, so they survive a device loss. Every pass writes "entered" when the
///            command processor reaches it and "completed" when all earlier work has retired; after VK_ERROR_DEVICE_LOST the gap between
///            the two names the pass that was executing.
///    Fault   VK_EXT_device_fault is queried once after a device loss and printed verbatim (address ranges, vendor info).
class RenderMetrics
{
public:
    static constexpr uint32_t QueriesPerSlot  = 64u;   // [cnt] one frame stamp plus up to 63 passes
    static constexpr uint32_t MarkersPerSlot  = 4u;    // [cnt] serial, entered, completed, spare
    static constexpr uint32_t MaximumSlots    = 4u;    // [cnt] frame slots one metrics object can stripe over
    static constexpr double   WindowSeconds   = 5.0;   // [s]   length of one frame-time report window

    struct Capability
    {
        bool Timestamps = false;   // [-] the queue family supports timestamps and the pool was created
        bool Markers    = false;   // [-] VK_AMD_buffer_marker is enabled on the device and the marker buffer exists
        bool Fault      = false;   // [-] VK_EXT_device_fault is enabled on the device
    };

    /// 📦 Device-level wishes the renderer must add to vkCreateDevice before `Bring`.
    struct DeviceWish
    {
        bool MarkerExtension = false;   // [-] the physical device offers VK_AMD_buffer_marker
        bool FaultExtension  = false;   // [-] the physical device offers VK_EXT_device_fault
        bool FaultFeature    = false;   // [-] deviceFault is supported (VkPhysicalDeviceFaultFeaturesEXT)
    };
    /// 📦 Inspects the physical device and logs which diagnostics it can offer.
    static DeviceWish QueryDeviceWish(VkPhysicalDevice Device) noexcept;

    /// 📦 Creates the timestamp pool and the marker buffer on an existing device.
    /// err   returns false when nothing could be created; the renderer then runs unmetered
    bool Bring(VkPhysicalDevice PhysicalDevice, VkDevice Device, uint32_t SlotCount, const DeviceWish& Enabled) noexcept;
    void Retire() noexcept;

    /// 📦 Harvests the stripe of `Slot`, resets it and stamps the start of the new frame. Call first in the command buffer.
    void OpenFrame(VkCommandBuffer Command, uint32_t Slot, uint64_t FrameSerial) noexcept;
    /// 📦 Names a pass and writes its "entered" marker. `Name` must outlive the renderer (a string literal).
    void OpenPass(VkCommandBuffer Command, const char* Name) noexcept;
    /// 📦 Stamps the end of the open pass and writes its "completed" marker.
    void ClosePass(VkCommandBuffer Command) noexcept;

    /// 📦 Accumulates one presented frame and, once a window has elapsed, prints the [FrameTime] and [GpuPass] lines.
    /// prm   PipelineName   [-]  route that rendered the window ("HardwareRayQuery", "SoftwareBvh", "RasterSdf", ...)
    /// prm   PresentMode    [-]  VK_PRESENT_MODE name the swapchain currently uses
    void CloseFrame(const char* PipelineName, const char* PresentMode) noexcept;

    /// 📦 Reads the markers and VK_EXT_device_fault and prints them. Safe to call more than once; only the first call prints the fault.
    void InspectLoss(const char* Operation, int32_t Result) noexcept;

    [[nodiscard]] const Capability& QueryCapability() const noexcept
    {
        return Enabled;
    }
    [[nodiscard]] double QueryLastGpuMilliseconds() const noexcept
    {
        return LastGpuMilliseconds;
    }

private:
    struct PassTotal
    {
        const char* Name    = nullptr;   // [-]  literal passed to OpenPass
        double      Sum     = 0.0;       // [ms] accumulated over the window
        double      Maximum = 0.0;       // [ms] worst single frame in the window
        uint32_t    Count   = 0u;        // [cnt] frames that contributed
    };

    void Harvest(uint32_t Slot) noexcept;
    void Mark(VkCommandBuffer Command, VkPipelineStageFlagBits Stage, uint32_t Word, uint32_t Value) noexcept;

    VkDevice             Device          = VK_NULL_HANDLE;
    VkQueryPool          Pool            = VK_NULL_HANDLE;
    VkBuffer             MarkerBuffer    = VK_NULL_HANDLE;
    VkDeviceMemory       MarkerMemory    = VK_NULL_HANDLE;
    volatile uint32_t*   MarkerWords     = nullptr;
    PFN_vkCmdWriteBufferMarkerAMD WriteMarker = nullptr;
    PFN_vkGetDeviceFaultInfoEXT   ReadFault   = nullptr;
    float                TimestampPeriod = 1.0f;     // [ns/tick]
    uint32_t             SlotCount       = 0u;
    uint32_t             Slot            = 0u;       // [-]  stripe being recorded
    uint32_t             PassCount[MaximumSlots]{};             // [cnt] passes closed per slot in the current recording
    bool                 Recorded[MaximumSlots]{};              // [-]  the slot holds stamps nobody has harvested yet
    const char*          Names[MaximumSlots][QueriesPerSlot]{};
    const char*          OpenName        = nullptr;
    uint64_t             Serial          = 0u;
    Capability           Enabled;
    std::vector<PassTotal> Totals;
    double               WindowGpu       = 0.0;      // [ms] GPU time summed over the window
    uint32_t             WindowGpuFrames = 0u;       // [cnt] frames whose GPU time was harvested in the window
    double               LastGpuMilliseconds = 0.0;  // [ms] GPU time of the most recently harvested frame
    uint32_t             WindowFrames    = 0u;
    std::vector<double>  WindowIntervals;            // [ms] frame-to-frame intervals of the window
    std::chrono::steady_clock::time_point WindowStart{};
    std::chrono::steady_clock::time_point PreviousFrame{};
    bool                 LossPrinted     = false;
};
}
