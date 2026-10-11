//============================================================================================================================================
//                                                            RENDERMETRICS.CPP
//============================================================================================================================================
// 📦 Timestamp stripes, buffer markers, device-fault capture and frame-time windows.

#include "RenderMetrics.h"
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <iostream>

namespace Frontier
{
//------------------------------------------------------------------------------------------------------------------------
//                                                     DEVICE WISH
//------------------------------------------------------------------------------------------------------------------------

RenderMetrics::DeviceWish RenderMetrics::QueryDeviceWish(VkPhysicalDevice PhysicalDevice) noexcept
{
    DeviceWish Wish;
    uint32_t Count = 0u;
    vkEnumerateDeviceExtensionProperties(PhysicalDevice, nullptr, &Count, nullptr);
    std::vector<VkExtensionProperties> Extensions(Count);
    if (Count) vkEnumerateDeviceExtensionProperties(PhysicalDevice, nullptr, &Count, Extensions.data());
    for (const VkExtensionProperties& Extension : Extensions)
    {
        Wish.MarkerExtension = Wish.MarkerExtension || std::strcmp(Extension.extensionName, VK_AMD_BUFFER_MARKER_EXTENSION_NAME) == 0;
        Wish.FaultExtension  = Wish.FaultExtension  || std::strcmp(Extension.extensionName, VK_EXT_DEVICE_FAULT_EXTENSION_NAME) == 0;
    }
    if (Wish.FaultExtension)
    {
        VkPhysicalDeviceFaultFeaturesEXT Fault{ VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FAULT_FEATURES_EXT };
        VkPhysicalDeviceFeatures2        Features{ VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2, &Fault };
        vkGetPhysicalDeviceFeatures2(PhysicalDevice, &Features);
        Wish.FaultFeature = Fault.deviceFault == VK_TRUE;
    }
    std::cerr << "[RenderMetrics] device offers: VK_AMD_buffer_marker=" << Wish.MarkerExtension << " VK_EXT_device_fault="
              << Wish.FaultExtension << " deviceFault=" << Wish.FaultFeature << "\n";
    return Wish;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      LIFECYCLE
//------------------------------------------------------------------------------------------------------------------------

bool RenderMetrics::Bring(VkPhysicalDevice PhysicalDevice, VkDevice Target, uint32_t Slots, const DeviceWish& Wanted) noexcept
{
    Retire();
    if (!Target || !PhysicalDevice || Slots == 0u || Slots > MaximumSlots) return false;
    Device    = Target;
    SlotCount = Slots;

    VkPhysicalDeviceProperties Properties{};
    vkGetPhysicalDeviceProperties(PhysicalDevice, &Properties);
    TimestampPeriod = Properties.limits.timestampPeriod;
    VkQueryPoolCreateInfo Query{ VK_STRUCTURE_TYPE_QUERY_POOL_CREATE_INFO };
    Query.queryType  = VK_QUERY_TYPE_TIMESTAMP;
    Query.queryCount = Slots * QueriesPerSlot;
    Enabled.Timestamps = Properties.limits.timestampComputeAndGraphics == VK_TRUE
                      && vkCreateQueryPool(Device, &Query, nullptr, &Pool) == VK_SUCCESS;

    if (Wanted.MarkerExtension)
    {
        WriteMarker = reinterpret_cast<PFN_vkCmdWriteBufferMarkerAMD>(vkGetDeviceProcAddr(Device, "vkCmdWriteBufferMarkerAMD"));
        VkBufferCreateInfo Buffer{ VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO };
        Buffer.size  = sizeof(uint32_t) * Slots * MarkersPerSlot;
        Buffer.usage = VK_BUFFER_USAGE_TRANSFER_DST_BIT;
        VkMemoryRequirements Requirements{};
        VkPhysicalDeviceMemoryProperties Memory{};
        vkGetPhysicalDeviceMemoryProperties(PhysicalDevice, &Memory);
        // 📝 Host-visible and coherent system memory: device-local memory is lost with the device, this is not.
        const VkMemoryPropertyFlags Required = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
        if (WriteMarker && vkCreateBuffer(Device, &Buffer, nullptr, &MarkerBuffer) == VK_SUCCESS)
        {
            vkGetBufferMemoryRequirements(Device, MarkerBuffer, &Requirements);
            uint32_t Type = Memory.memoryTypeCount;
            for (uint32_t Index = 0u; Index < Memory.memoryTypeCount && Type == Memory.memoryTypeCount; ++Index)
                if ((Requirements.memoryTypeBits & (1u << Index)) && (Memory.memoryTypes[Index].propertyFlags & Required) == Required
                    && !(Memory.memoryTypes[Index].propertyFlags & VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT)) Type = Index;
            VkMemoryAllocateInfo Allocation{ VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO };
            Allocation.allocationSize  = Requirements.size;
            Allocation.memoryTypeIndex = Type;
            void* Mapped = nullptr;
            if (Type != Memory.memoryTypeCount && vkAllocateMemory(Device, &Allocation, nullptr, &MarkerMemory) == VK_SUCCESS
                && vkBindBufferMemory(Device, MarkerBuffer, MarkerMemory, 0u) == VK_SUCCESS
                && vkMapMemory(Device, MarkerMemory, 0u, VK_WHOLE_SIZE, 0u, &Mapped) == VK_SUCCESS && Mapped)
            {
                MarkerWords = static_cast<volatile uint32_t*>(Mapped);
                for (uint32_t Word = 0u; Word < Slots * MarkersPerSlot; ++Word) MarkerWords[Word] = 0u;
                Enabled.Markers = true;
            }
        }
    }
    if (Wanted.FaultExtension && Wanted.FaultFeature)
    {
        ReadFault     = reinterpret_cast<PFN_vkGetDeviceFaultInfoEXT>(vkGetDeviceProcAddr(Device, "vkGetDeviceFaultInfoEXT"));
        Enabled.Fault = ReadFault != nullptr;
    }
    WindowStart   = std::chrono::steady_clock::now();
    PreviousFrame = WindowStart;
    std::cerr << "[RenderMetrics] timestamps=" << Enabled.Timestamps << " (" << TimestampPeriod << " ns/tick) markers=" << Enabled.Markers
              << " deviceFault=" << Enabled.Fault << "\n";
    return Enabled.Timestamps || Enabled.Markers || Enabled.Fault;
}

void RenderMetrics::Retire() noexcept
{
    if (Device)
    {
        if (Pool)         vkDestroyQueryPool(Device, Pool, nullptr);
        if (MarkerMemory) vkUnmapMemory(Device, MarkerMemory);
        if (MarkerBuffer) vkDestroyBuffer(Device, MarkerBuffer, nullptr);
        if (MarkerMemory) vkFreeMemory(Device, MarkerMemory, nullptr);
    }
    *this = RenderMetrics{};
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      RECORDING
//------------------------------------------------------------------------------------------------------------------------

void RenderMetrics::Mark(VkCommandBuffer Command, VkPipelineStageFlagBits Stage, uint32_t Word, uint32_t Value) noexcept
{
    if (!Enabled.Markers) return;
    WriteMarker(Command, Stage, MarkerBuffer, sizeof(uint32_t) * (Slot * MarkersPerSlot + Word), Value);
}

void RenderMetrics::OpenFrame(VkCommandBuffer Command, uint32_t Target, uint64_t FrameSerial) noexcept
{
    if (!Device || Target >= SlotCount) return;
    Slot   = Target;
    Serial = FrameSerial;
    Harvest(Slot);
    PassCount[Slot] = 0u;
    OpenName        = nullptr;
    if (Enabled.Timestamps)
    {
        vkCmdResetQueryPool(Command, Pool, Slot * QueriesPerSlot, QueriesPerSlot);
        vkCmdWriteTimestamp(Command, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, Pool, Slot * QueriesPerSlot);
        Recorded[Slot] = true;
    }
    Mark(Command, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, 0u, static_cast<uint32_t>(FrameSerial));
    Mark(Command, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, 1u, 0u);
    Mark(Command, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, 2u, 0u);
}

void RenderMetrics::OpenPass(VkCommandBuffer Command, const char* Name) noexcept
{
    if (!Device || PassCount[Slot] + 1u >= QueriesPerSlot) return;
    OpenName                      = Name;
    Names[Slot][PassCount[Slot]]  = Name;   // 📝 stored before the pass runs, so a hang inside it still has a name to report
    Mark(Command, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, 1u, PassCount[Slot] + 1u);
}

void RenderMetrics::ClosePass(VkCommandBuffer Command) noexcept
{
    if (!Device || !OpenName) return;
    const uint32_t Index = PassCount[Slot]++;
    OpenName             = nullptr;
    if (Enabled.Timestamps)
        vkCmdWriteTimestamp(Command, VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT, Pool, Slot * QueriesPerSlot + 1u + Index);
    Mark(Command, VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT, 2u, Index + 1u);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  HARVEST AND REPORT
//------------------------------------------------------------------------------------------------------------------------

void RenderMetrics::Harvest(uint32_t Target) noexcept
{
    if (!Enabled.Timestamps || !Recorded[Target] || PassCount[Target] == 0u) return;
    Recorded[Target] = false;
    uint64_t Stamps[QueriesPerSlot]{};
    const uint32_t Count = PassCount[Target] + 1u;
    // 📝 Without WAIT or AVAILABILITY the call returns VK_NOT_READY unless every query finished. That is the normal answer for a slot the
    //    GPU has not retired, and the stripe is simply skipped; the frame fence wait that precedes recording makes it rare.
    if (vkGetQueryPoolResults(Device, Pool, Target * QueriesPerSlot, Count, sizeof(Stamps), Stamps, sizeof(uint64_t),
                              VK_QUERY_RESULT_64_BIT) != VK_SUCCESS) return;
    double Total = 0.0;
    for (uint32_t Index = 0u; Index + 1u < Count; ++Index)
    {
        const double Milliseconds = static_cast<double>(Stamps[Index + 1u] - Stamps[Index]) * TimestampPeriod * 1e-6;
        const char*  Name         = Names[Target][Index] ? Names[Target][Index] : "unnamed";
        auto Found = std::find_if(Totals.begin(), Totals.end(), [&](const PassTotal& Row) { return std::strcmp(Row.Name, Name) == 0; });
        if (Found == Totals.end()) { Totals.push_back(PassTotal{ Name, 0.0, 0.0, 0u }); Found = Totals.end() - 1; }
        Found->Sum    += Milliseconds;
        Found->Maximum = std::max(Found->Maximum, Milliseconds);
        ++Found->Count;
        Total += Milliseconds;
    }
    LastGpuMilliseconds = Total;
    WindowGpu          += Total;
    ++WindowGpuFrames;
}

void RenderMetrics::CloseFrame(const char* PipelineName, const char* PresentMode) noexcept
{
    const auto Now = std::chrono::steady_clock::now();
    WindowIntervals.push_back(std::chrono::duration<double, std::milli>(Now - PreviousFrame).count());
    PreviousFrame = Now;
    ++WindowFrames;
    const double Elapsed = std::chrono::duration<double>(Now - WindowStart).count();
    if (Elapsed < WindowSeconds) return;

    std::sort(WindowIntervals.begin(), WindowIntervals.end());
    double Sum = 0.0;
    for (double Interval : WindowIntervals) Sum += Interval;
    const double Average = WindowFrames ? Sum / WindowFrames : 0.0;
    const double Percentile = WindowIntervals.empty() ? 0.0 : WindowIntervals[std::min<size_t>(WindowIntervals.size() - 1u, WindowIntervals.size() * 95u / 100u)];
    const double Gpu = WindowGpuFrames ? WindowGpu / WindowGpuFrames : 0.0;
    // 📝 With a FIFO present mode the interval is the display period, not the cost of a frame. `gpu_bound_fps` is what the GPU alone could
    //    sustain, which is the uncapped number to compare tiers by; it is only shown when timers produced data.
    char Line[512];
    std::snprintf(Line, sizeof(Line),
                  "[FrameTime] window=%.1fs frames=%u fps=%.1f avg_ms=%.2f p95_ms=%.2f max_ms=%.2f gpu_ms=%.2f gpu_bound_fps=%.1f pipeline=%s present=%s",
                  Elapsed, WindowFrames, Elapsed > 0.0 ? WindowFrames / Elapsed : 0.0, Average, Percentile,
                  WindowIntervals.empty() ? 0.0 : WindowIntervals.back(), Gpu, Gpu > 0.0 ? 1000.0 / Gpu : 0.0,
                  PipelineName ? PipelineName : "unknown", PresentMode ? PresentMode : "unknown");
    std::cerr << Line << "\n";
    for (const PassTotal& Row : Totals)
    {
        if (!Row.Count) continue;
        std::snprintf(Line, sizeof(Line), "[GpuPass] %-28s avg_ms=%7.3f max_ms=%7.3f share=%5.1f%% frames=%u", Row.Name, Row.Sum / Row.Count,
                      Row.Maximum, WindowGpu > 0.0 ? 100.0 * Row.Sum / WindowGpu : 0.0, Row.Count);
        std::cerr << Line << "\n";
    }
    Totals.clear();
    WindowIntervals.clear();
    WindowFrames    = 0u;
    WindowGpuFrames = 0u;
    WindowGpu       = 0.0;
    WindowStart     = Now;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                     DEVICE LOSS
//------------------------------------------------------------------------------------------------------------------------

void RenderMetrics::InspectLoss(const char* Operation, int32_t Result) noexcept
{
    if (!Device || LossPrinted) return;
    LossPrinted = true;
    std::cerr << "[DeviceLoss] " << (Operation ? Operation : "unknown") << " returned VkResult " << Result << " at frame serial " << Serial << "\n";
    if (Enabled.Markers)
    {
        for (uint32_t Target = 0u; Target < SlotCount; ++Target)
        {
            const uint32_t Serial32 = MarkerWords[Target * MarkersPerSlot], Entered = MarkerWords[Target * MarkersPerSlot + 1u],
                           Completed = MarkerWords[Target * MarkersPerSlot + 2u];
            const char* EnteredName   = Entered   && Entered   <= QueriesPerSlot ? Names[Target][Entered - 1u]   : nullptr;
            const char* CompletedName = Completed && Completed <= QueriesPerSlot ? Names[Target][Completed - 1u] : nullptr;
            std::cerr << "[DeviceLoss] slot " << Target << ": frame " << Serial32 << " entered='" << (EnteredName ? EnteredName : "-")
                      << "' completed='" << (CompletedName ? CompletedName : "-") << "'"
                      << (Entered != Completed ? "  <- the GPU was inside the entered pass" : "") << "\n";
        }
    }
    else std::cerr << "[DeviceLoss] no VK_AMD_buffer_marker, so the pass that hung cannot be named\n";
    if (!Enabled.Fault)
    {
        std::cerr << "[DeviceLoss] no VK_EXT_device_fault on this driver\n";
        return;
    }
    VkDeviceFaultCountsEXT Counts{ VK_STRUCTURE_TYPE_DEVICE_FAULT_COUNTS_EXT };
    if (ReadFault(Device, &Counts, nullptr) != VK_SUCCESS)
    {
        std::cerr << "[DeviceFault] vkGetDeviceFaultInfoEXT refused the count query\n";
        return;
    }
    std::vector<VkDeviceFaultAddressInfoEXT> Addresses(Counts.addressInfoCount);
    std::vector<VkDeviceFaultVendorInfoEXT>  Vendors(Counts.vendorInfoCount);
    VkDeviceFaultInfoEXT Info{ VK_STRUCTURE_TYPE_DEVICE_FAULT_INFO_EXT };
    Info.pAddressInfos = Addresses.empty() ? nullptr : Addresses.data();
    Info.pVendorInfos  = Vendors.empty() ? nullptr : Vendors.data();
    if (ReadFault(Device, &Counts, &Info) != VK_SUCCESS)
    {
        std::cerr << "[DeviceFault] vkGetDeviceFaultInfoEXT refused the info query\n";
        return;
    }
    std::cerr << "[DeviceFault] " << Info.description << "\n";
    for (const VkDeviceFaultAddressInfoEXT& Address : Addresses)
        std::cerr << "[DeviceFault] address type=" << static_cast<int>(Address.addressType) << " reported=0x" << std::hex << Address.reportedAddress
                  << " precision=0x" << Address.addressPrecision << std::dec << "\n";
    for (const VkDeviceFaultVendorInfoEXT& Vendor : Vendors)
        std::cerr << "[DeviceFault] vendor '" << Vendor.description << "' code=" << Vendor.vendorFaultCode << " data=" << Vendor.vendorFaultData << "\n";
}
}
