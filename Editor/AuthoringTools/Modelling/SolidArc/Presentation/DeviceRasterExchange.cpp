//============================================================================================================================================
//                              EDITOR/AUTHORINGTOOLS/MODELLING/SOLIDARC/PRESENTATION/DEVICERASTEREXCHANGE.CPP
//============================================================================================================================================
// 📦 Vulkan implementation of RasterExchange: pipelines per verb, one render pass per target, synchronous readback for the console
//    and the host

#include "DeviceRasterExchange.h"

#include <vulkan/vulkan.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <vector>

namespace Frontier
{

namespace
{

// 📝 Linear light and blendable; the display curve is applied once on readback.
constexpr VkFormat    ColourFormat       = VK_FORMAT_R16G16B16A16_SFLOAT;
constexpr VkFormat    PickFormat         = VK_FORMAT_R32_UINT;
constexpr VkFormat    DepthFormat        = VK_FORMAT_D32_SFLOAT;
constexpr uint32_t    ViewSlotCount      = 8;                               // [-] BindView calls per target
constexpr uint32_t    DrawSlotCount      = 4096;                            // [-] draw verbs per target
constexpr VkDeviceSize ViewRecordBytes   = 272;                             // [B] ViewRecord in ShadingRecords.slang: 3 matrices + 5 float4
constexpr VkDeviceSize DrawRecordBytes   = 112;                             // [B] DrawRecord: 1 matrix + 3 float4
constexpr VkDeviceSize StreamRingBytes   = 16ull * 1024ull * 1024ull;       // [B] vertex + index ring per target
constexpr double       LogIntervalSeconds = 5.0;                            // [s] throttle for the steady-state raster line

enum class Verb : uint32_t { Surface = 0, Line = 1, Point = 2, Lattice = 3, Count = 4 };

// A pipeline differs by: whether depth is written, whether the pick plane is written, and whether it is in the overlay segment.
constexpr uint32_t VariantCount = 6;
constexpr uint32_t VariantOf(bool Overlay, bool WriteDepth, bool WritePick) noexcept
{
    return Overlay ? (WritePick ? 4u : 5u) : ((WriteDepth ? 0u : 2u) + (WritePick ? 0u : 1u));
}

const char* VerbStem(Verb V) noexcept
{
    constexpr const char* Stems[] = { "DeviceSurface", "DeviceLine", "DevicePoint", "DeviceLattice" };
    return Stems[static_cast<uint32_t>(V)];
}

VkDeviceSize AlignUp(VkDeviceSize Value, VkDeviceSize Alignment) noexcept
{
    return Alignment == 0 ? Value : (Value + Alignment - 1) / Alignment * Alignment;
}

float HalfToFloat(uint16_t H) noexcept
{
    const uint32_t Sign = (H >> 15) & 1u, Exponent = (H >> 10) & 0x1Fu, Mantissa = H & 0x3FFu;
    float Value;
    if (Exponent == 0)       Value = std::ldexp(static_cast<float>(Mantissa), -24);
    else if (Exponent == 31) Value = Mantissa ? NAN : INFINITY;
    else                     Value = std::ldexp(static_cast<float>(Mantissa | 0x400u), static_cast<int>(Exponent) - 25);
    return Sign ? -Value : Value;
}

float Saturate(float V) noexcept { return V < 0.0f ? 0.0f : (V > 1.0f ? 1.0f : V); }

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                  DETAIL
//------------------------------------------------------------------------------------------------------------------------

struct DeviceRasterExchange::Detail
{
    struct Buffer
    {
        VkBuffer       Handle = VK_NULL_HANDLE;
        VkDeviceMemory Memory = VK_NULL_HANDLE;
        void*          Mapped = nullptr;
        VkDeviceSize   Size   = 0;
    };
    struct Image
    {
        VkImage        Handle = VK_NULL_HANDLE;
        VkDeviceMemory Memory = VK_NULL_HANDLE;
        VkImageView    View   = VK_NULL_HANDLE;
    };

    // Device
    VkInstance                       Instance        = VK_NULL_HANDLE;              // headless only
    VkPhysicalDevice                 Physical        = VK_NULL_HANDLE;
    VkDevice                         Device          = VK_NULL_HANDLE;
    VkQueue                          Queue           = VK_NULL_HANDLE;
    uint32_t                         QueueFamily     = 0;
    VkPipelineCache                  Cache           = VK_NULL_HANDLE;
    bool                             OwnsDevice      = false;
    std::string                      SpirvDirectory;
    std::string                      DeviceName;
    VkPhysicalDeviceMemoryProperties Memory{};
    VkDeviceSize                     UniformAlignment = 256;
    float                            TimestampPeriod  = 0.0f;                       // [ns] per tick, 0 = unsupported
    bool                             Faulted          = false;

    // Frame objects
    VkCommandPool        Pool         = VK_NULL_HANDLE;
    VkCommandBuffer      Commands     = VK_NULL_HANDLE;
    VkFence              Fence        = VK_NULL_HANDLE;
    VkQueryPool          Queries      = VK_NULL_HANDLE;
    VkRenderPass         Pass         = VK_NULL_HANDLE;
    VkDescriptorSetLayout SetLayout   = VK_NULL_HANDLE;
    VkDescriptorPool     SetPool      = VK_NULL_HANDLE;
    VkDescriptorSet      Set          = VK_NULL_HANDLE;
    VkPipelineLayout     Layout       = VK_NULL_HANDLE;
    VkShaderModule       Modules[static_cast<uint32_t>(Verb::Count)][2] = {};       // [verb][0 vertex, 1 fragment]
    VkPipeline           Pipelines[static_cast<uint32_t>(Verb::Count)][VariantCount] = {};

    // Per-size objects
    uint32_t    OutW = 0, OutH = 0, Samples = 2, W = 0, H = 0;
    Image       Colour, Pick, Depth;
    VkFramebuffer Framebuffer = VK_NULL_HANDLE;
    Buffer      ReadColour, ReadPick, ReadDepth;
    Buffer      Uniforms, Stream;
    VkDeviceSize DrawBase = 0, ViewStride = 0, DrawStride = 0;

    // Target state
    bool         Recording = false, Overlay = false;
    uint32_t     ViewCount = 0, DrawCount = 0;
    uint32_t     ViewOffset = 0;
    bool         ViewBound = false;
    VkDeviceSize StreamCursor = 0;
    uint32_t     Overflowed = 0;
    VkPipeline   BoundPipeline = VK_NULL_HANDLE;
    std::chrono::steady_clock::time_point TargetStart{}, LastLog{};
    float        TargetMilliseconds = 0.0f, GpuMilliseconds = 0.0f;
    uint32_t     TargetsSinceLog = 0;
    float        MillisecondsSinceLog = 0.0f;
    uint32_t     LoggedW = 0, LoggedH = 0;
    Tally        Count{};

    // Readback products (valid after EndTarget)
    std::vector<uint8_t>  Image8;
    std::vector<uint32_t> PickPlane;
    std::vector<float>    DepthPlane;

    bool  Fail(const char* Where, VkResult Result) noexcept;
    bool  Open(const DeviceRasterBinding& Binding, std::string& Refusal) noexcept;
    bool  OpenHeadless(std::string& Refusal) noexcept;
    void  Close() noexcept;
    bool  FindMemory(uint32_t Bits, VkMemoryPropertyFlags Wanted, VkMemoryPropertyFlags Fallback, uint32_t& Index) const noexcept;
    bool  AllocateBuffer(Buffer& Out, VkDeviceSize Size, VkBufferUsageFlags Usage, bool Cached) noexcept;
    void  ReleaseBuffer(Buffer& B) noexcept;
    bool  AllocateImage(Image& Out, VkFormat Format, VkImageUsageFlags Usage, VkImageAspectFlags Aspect) noexcept;
    void  ReleaseImage(Image& I) noexcept;
    bool  CreateFixed() noexcept;
    bool  CreateTargets() noexcept;
    void  ReleaseTargets() noexcept;
    bool  CreateModules(std::string& Refusal) noexcept;
    VkPipeline BuildPipeline(Verb V, uint32_t Variant) noexcept;
    VkPipeline PipelineFor(Verb V, bool WriteDepth, bool WritePick) noexcept;
    bool  ReserveDraw(const DrawRecord& Draw, uint32_t& DrawOffset) noexcept;
    bool  ReserveStream(VkDeviceSize Bytes, VkDeviceSize& Offset) noexcept;
    void  PackDraw(const DrawRecord& Draw, float* Out) const noexcept;
    void  BindForDraw(VkPipeline Pipeline, uint32_t DrawOffset) noexcept;
    void  Finish() noexcept;
    void  LogTarget() noexcept;
};

bool DeviceRasterExchange::Detail::Fail(const char* Where, VkResult Result) noexcept
{
    std::fprintf(stderr, "[SolidArcRaster] FAULT %s failed (VkResult %d) — the device raster is disabled for this session\n", Where,
                 static_cast<int>(Result));
    Faulted = true;
    return false;
}

bool DeviceRasterExchange::Detail::FindMemory(uint32_t Bits, VkMemoryPropertyFlags Wanted, VkMemoryPropertyFlags Fallback,
                                              uint32_t& Index) const noexcept
{
    for (const VkMemoryPropertyFlags Flags : { Wanted, Fallback })
        for (uint32_t I = 0; I < Memory.memoryTypeCount; ++I)
            if ((Bits & (1u << I)) && (Memory.memoryTypes[I].propertyFlags & Flags) == Flags) { Index = I; return true; }
    return false;
}

bool DeviceRasterExchange::Detail::AllocateBuffer(Buffer& Out, VkDeviceSize Size, VkBufferUsageFlags Usage, bool Cached) noexcept
{
    VkBufferCreateInfo Info{ VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO };
    Info.size = Size; Info.usage = Usage; Info.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    VkResult R = vkCreateBuffer(Device, &Info, nullptr, &Out.Handle);
    if (R != VK_SUCCESS) return Fail("vkCreateBuffer", R);
    VkMemoryRequirements Need{};
    vkGetBufferMemoryRequirements(Device, Out.Handle, &Need);
    constexpr VkMemoryPropertyFlags Coherent = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
    uint32_t Type = 0;
    if (!FindMemory(Need.memoryTypeBits, Cached ? (Coherent | VK_MEMORY_PROPERTY_HOST_CACHED_BIT) : Coherent, Coherent, Type))
        return Fail("FindMemory(host visible)", VK_ERROR_FEATURE_NOT_PRESENT);
    VkMemoryAllocateInfo Alloc{ VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO };
    Alloc.allocationSize = Need.size; Alloc.memoryTypeIndex = Type;
    R = vkAllocateMemory(Device, &Alloc, nullptr, &Out.Memory);
    if (R != VK_SUCCESS) return Fail("vkAllocateMemory(buffer)", R);
    R = vkBindBufferMemory(Device, Out.Handle, Out.Memory, 0);
    if (R != VK_SUCCESS) return Fail("vkBindBufferMemory", R);
    R = vkMapMemory(Device, Out.Memory, 0, VK_WHOLE_SIZE, 0, &Out.Mapped);
    if (R != VK_SUCCESS) return Fail("vkMapMemory", R);
    Out.Size = Size;
    return true;
}

void DeviceRasterExchange::Detail::ReleaseBuffer(Buffer& B) noexcept
{
    if (B.Mapped) vkUnmapMemory(Device, B.Memory);
    if (B.Handle) vkDestroyBuffer(Device, B.Handle, nullptr);
    if (B.Memory) vkFreeMemory(Device, B.Memory, nullptr);
    B = {};
}

bool DeviceRasterExchange::Detail::AllocateImage(Image& Out, VkFormat Format, VkImageUsageFlags Usage, VkImageAspectFlags Aspect) noexcept
{
    VkImageCreateInfo Info{ VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO };
    Info.imageType = VK_IMAGE_TYPE_2D; Info.format = Format; Info.extent = { W, H, 1 }; Info.mipLevels = 1; Info.arrayLayers = 1;
    Info.samples = VK_SAMPLE_COUNT_1_BIT; Info.tiling = VK_IMAGE_TILING_OPTIMAL; Info.usage = Usage;
    Info.sharingMode = VK_SHARING_MODE_EXCLUSIVE; Info.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    VkResult R = vkCreateImage(Device, &Info, nullptr, &Out.Handle);
    if (R != VK_SUCCESS) return Fail("vkCreateImage", R);
    VkMemoryRequirements Need{};
    vkGetImageMemoryRequirements(Device, Out.Handle, &Need);
    uint32_t Type = 0;
    if (!FindMemory(Need.memoryTypeBits, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, 0, Type))
        return Fail("FindMemory(device local)", VK_ERROR_FEATURE_NOT_PRESENT);
    VkMemoryAllocateInfo Alloc{ VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO };
    Alloc.allocationSize = Need.size; Alloc.memoryTypeIndex = Type;
    R = vkAllocateMemory(Device, &Alloc, nullptr, &Out.Memory);
    if (R != VK_SUCCESS) return Fail("vkAllocateMemory(image)", R);
    R = vkBindImageMemory(Device, Out.Handle, Out.Memory, 0);
    if (R != VK_SUCCESS) return Fail("vkBindImageMemory", R);
    VkImageViewCreateInfo View{ VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO };
    View.image = Out.Handle; View.viewType = VK_IMAGE_VIEW_TYPE_2D; View.format = Format;
    View.subresourceRange = { Aspect, 0, 1, 0, 1 };
    R = vkCreateImageView(Device, &View, nullptr, &Out.View);
    if (R != VK_SUCCESS) return Fail("vkCreateImageView", R);
    return true;
}

void DeviceRasterExchange::Detail::ReleaseImage(Image& I) noexcept
{
    if (I.View) vkDestroyImageView(Device, I.View, nullptr);
    if (I.Handle) vkDestroyImage(Device, I.Handle, nullptr);
    if (I.Memory) vkFreeMemory(Device, I.Memory, nullptr);
    I = {};
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  DEVICE
//------------------------------------------------------------------------------------------------------------------------

bool DeviceRasterExchange::Detail::OpenHeadless(std::string& Refusal) noexcept
{
    VkApplicationInfo App{ VK_STRUCTURE_TYPE_APPLICATION_INFO };
    App.pApplicationName = "SolidArc"; App.apiVersion = VK_API_VERSION_1_1;
    VkInstanceCreateInfo Info{ VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO };
    Info.pApplicationInfo = &App;
    VkResult R = vkCreateInstance(&Info, nullptr, &Instance);
    if (R != VK_SUCCESS)
    {
        Refusal = "vkCreateInstance failed (" + std::to_string(static_cast<int>(R)) + ") — no Vulkan loader or driver";
        return false;
    }
    uint32_t Count = 0;
    vkEnumeratePhysicalDevices(Instance, &Count, nullptr);
    std::vector<VkPhysicalDevice> Devices(Count);
    if (Count) vkEnumeratePhysicalDevices(Instance, &Count, Devices.data());
    // Discrete first, then integrated; a CPU implementation (llvmpipe, WARP-class) is taken only when nothing else exists.
    int BestRank = -1;
    for (VkPhysicalDevice Candidate : Devices)
    {
        VkPhysicalDeviceProperties Props{};
        vkGetPhysicalDeviceProperties(Candidate, &Props);
        const int Rank = Props.deviceType == VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU   ? 3
                       : Props.deviceType == VK_PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU ? 2
                       : Props.deviceType == VK_PHYSICAL_DEVICE_TYPE_CPU            ? 0 : 1;
        uint32_t Families = 0;
        vkGetPhysicalDeviceQueueFamilyProperties(Candidate, &Families, nullptr);
        std::vector<VkQueueFamilyProperties> Properties(Families);
        if (Families) vkGetPhysicalDeviceQueueFamilyProperties(Candidate, &Families, Properties.data());
        for (uint32_t F = 0; F < Families; ++F)
            if ((Properties[F].queueFlags & VK_QUEUE_GRAPHICS_BIT) && Rank > BestRank)
            {
                BestRank = Rank; Physical = Candidate; QueueFamily = F;
            }
    }
    if (Physical == VK_NULL_HANDLE) { Refusal = "no Vulkan physical device with a graphics queue"; return false; }
    const float Priority = 1.0f;
    VkDeviceQueueCreateInfo Queue1{ VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO };
    Queue1.queueFamilyIndex = QueueFamily; Queue1.queueCount = 1; Queue1.pQueuePriorities = &Priority;
    VkDeviceCreateInfo Create{ VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO };
    Create.queueCreateInfoCount = 1; Create.pQueueCreateInfos = &Queue1;
    R = vkCreateDevice(Physical, &Create, nullptr, &Device);
    if (R != VK_SUCCESS) { Refusal = "vkCreateDevice failed (" + std::to_string(static_cast<int>(R)) + ")"; return false; }
    vkGetDeviceQueue(Device, QueueFamily, 0, &Queue);
    OwnsDevice = true;
    return true;
}

bool DeviceRasterExchange::Detail::Open(const DeviceRasterBinding& Binding, std::string& Refusal) noexcept
{
    SpirvDirectory = Binding.SpirvDirectory;
    if (Binding.Device != 0 && Binding.PhysicalDevice != 0 && Binding.Queue != 0)
    {
        Physical    = reinterpret_cast<VkPhysicalDevice>(static_cast<uintptr_t>(Binding.PhysicalDevice));
        Device      = reinterpret_cast<VkDevice>(static_cast<uintptr_t>(Binding.Device));
        Queue       = reinterpret_cast<VkQueue>(static_cast<uintptr_t>(Binding.Queue));
        Cache       = reinterpret_cast<VkPipelineCache>(static_cast<uintptr_t>(Binding.PipelineCache));
        QueueFamily = Binding.QueueFamily;
    }
    else if (!OpenHeadless(Refusal)) return false;
    VkPhysicalDeviceProperties Props{};
    vkGetPhysicalDeviceProperties(Physical, &Props);
    vkGetPhysicalDeviceMemoryProperties(Physical, &Memory);
    DeviceName       = Props.deviceName;
    UniformAlignment = Props.limits.minUniformBufferOffsetAlignment;
    uint32_t Families = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(Physical, &Families, nullptr);
    std::vector<VkQueueFamilyProperties> Properties(Families);
    if (Families) vkGetPhysicalDeviceQueueFamilyProperties(Physical, &Families, Properties.data());
    if (QueueFamily < Families && Properties[QueueFamily].timestampValidBits >= 64 && Props.limits.timestampPeriod > 0.0f)
        TimestampPeriod = Props.limits.timestampPeriod;
    if (ViewRecordBytes > Props.limits.maxUniformBufferRange) { Refusal = "maxUniformBufferRange below the view record"; return false; }
    if (!CreateModules(Refusal)) return false;
    if (!CreateFixed()) { Refusal = "fixed Vulkan objects could not be created"; return false; }
    if (!CreateTargets()) { Refusal = "render targets could not be created"; return false; }
    for (uint32_t V = 0; V < static_cast<uint32_t>(Verb::Count); ++V)
        if (!PipelineFor(static_cast<Verb>(V), true, true))
        {
            Refusal = std::string("pipeline ") + VerbStem(static_cast<Verb>(V)) + " could not be built";
            return false;
        }
    return true;
}

void DeviceRasterExchange::Detail::Close() noexcept
{
    if (Device == VK_NULL_HANDLE) return;
    vkDeviceWaitIdle(Device);
    ReleaseTargets();
    for (auto& Row : Pipelines) for (VkPipeline& P : Row) if (P) vkDestroyPipeline(Device, P, nullptr);
    for (auto& Row : Modules) for (VkShaderModule& M : Row) if (M) vkDestroyShaderModule(Device, M, nullptr);
    if (Layout) vkDestroyPipelineLayout(Device, Layout, nullptr);
    if (SetPool) vkDestroyDescriptorPool(Device, SetPool, nullptr);
    if (SetLayout) vkDestroyDescriptorSetLayout(Device, SetLayout, nullptr);
    if (Pass) vkDestroyRenderPass(Device, Pass, nullptr);
    if (Queries) vkDestroyQueryPool(Device, Queries, nullptr);
    if (Fence) vkDestroyFence(Device, Fence, nullptr);
    if (Pool) vkDestroyCommandPool(Device, Pool, nullptr);
    if (OwnsDevice) vkDestroyDevice(Device, nullptr);
    if (Instance) vkDestroyInstance(Instance, nullptr);
    Device = VK_NULL_HANDLE;
}

bool DeviceRasterExchange::Detail::CreateModules(std::string& Refusal) noexcept
{
    for (uint32_t V = 0; V < static_cast<uint32_t>(Verb::Count); ++V)
        for (uint32_t Stage = 0; Stage < 2; ++Stage)
        {
            const std::string Path = SpirvDirectory + "/" + VerbStem(static_cast<Verb>(V)) + (Stage == 0 ? ".vert.spv" : ".frag.spv");
            std::ifstream File(Path, std::ios::binary | std::ios::ate);
            if (!File) { Refusal = "missing shader " + Path; return false; }
            const std::streamsize Bytes = File.tellg();
            if (Bytes <= 0 || (Bytes % 4) != 0) { Refusal = "malformed SPIR-V " + Path; return false; }
            std::vector<uint32_t> Words(static_cast<size_t>(Bytes) / 4);
            File.seekg(0);
            File.read(reinterpret_cast<char*>(Words.data()), Bytes);
            VkShaderModuleCreateInfo Info{ VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO };
            Info.codeSize = static_cast<size_t>(Bytes); Info.pCode = Words.data();
            const VkResult R = vkCreateShaderModule(Device, &Info, nullptr, &Modules[V][Stage]);
            if (R != VK_SUCCESS) { Refusal = "vkCreateShaderModule rejected " + Path; return false; }
        }
    return true;
}

bool DeviceRasterExchange::Detail::CreateFixed() noexcept
{
    VkResult R;
    VkCommandPoolCreateInfo PoolInfo{ VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO };
    PoolInfo.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT; PoolInfo.queueFamilyIndex = QueueFamily;
    if ((R = vkCreateCommandPool(Device, &PoolInfo, nullptr, &Pool)) != VK_SUCCESS) return Fail("vkCreateCommandPool", R);
    VkCommandBufferAllocateInfo Alloc{ VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO };
    Alloc.commandPool = Pool; Alloc.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY; Alloc.commandBufferCount = 1;
    if ((R = vkAllocateCommandBuffers(Device, &Alloc, &Commands)) != VK_SUCCESS) return Fail("vkAllocateCommandBuffers", R);
    VkFenceCreateInfo FenceInfo{ VK_STRUCTURE_TYPE_FENCE_CREATE_INFO };
    if ((R = vkCreateFence(Device, &FenceInfo, nullptr, &Fence)) != VK_SUCCESS) return Fail("vkCreateFence", R);
    if (TimestampPeriod > 0.0f)
    {
        VkQueryPoolCreateInfo Query{ VK_STRUCTURE_TYPE_QUERY_POOL_CREATE_INFO };
        Query.queryType = VK_QUERY_TYPE_TIMESTAMP; Query.queryCount = 2;
        if ((R = vkCreateQueryPool(Device, &Query, nullptr, &Queries)) != VK_SUCCESS) return Fail("vkCreateQueryPool", R);
    }

    // One pass: colour and pick are cleared and left readable by transfers; depth likewise (copied out for Depth()).
    VkAttachmentDescription Attachments[3]{};
    const VkFormat Formats[3] = { ColourFormat, PickFormat, DepthFormat };
    for (int I = 0; I < 3; ++I)
    {
        Attachments[I].format = Formats[I]; Attachments[I].samples = VK_SAMPLE_COUNT_1_BIT;
        Attachments[I].loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR; Attachments[I].storeOp = VK_ATTACHMENT_STORE_OP_STORE;
        Attachments[I].stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE; Attachments[I].stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
        Attachments[I].initialLayout = VK_IMAGE_LAYOUT_UNDEFINED; Attachments[I].finalLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;
    }
    const VkAttachmentReference ColourRefs[2] = { { 0, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL },
                                                  { 1, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL } };
    const VkAttachmentReference DepthRef = { 2, VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL };
    VkSubpassDescription Subpass{};
    Subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS; Subpass.colorAttachmentCount = 2;
    Subpass.pColorAttachments = ColourRefs; Subpass.pDepthStencilAttachment = &DepthRef;
    VkSubpassDependency Dependencies[2]{};
    Dependencies[0].srcSubpass = VK_SUBPASS_EXTERNAL; Dependencies[0].dstSubpass = 0;
    constexpr VkPipelineStageFlags TargetStages = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT | VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT
                                                | VK_PIPELINE_STAGE_LATE_FRAGMENT_TESTS_BIT;
    Dependencies[0].srcStageMask = TargetStages | VK_PIPELINE_STAGE_TRANSFER_BIT;
    Dependencies[0].dstStageMask = TargetStages;
    Dependencies[0].srcAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
    Dependencies[0].dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT | VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
    Dependencies[1].srcSubpass = 0; Dependencies[1].dstSubpass = VK_SUBPASS_EXTERNAL;
    Dependencies[1].srcStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT | VK_PIPELINE_STAGE_LATE_FRAGMENT_TESTS_BIT;
    Dependencies[1].dstStageMask = VK_PIPELINE_STAGE_TRANSFER_BIT;
    Dependencies[1].srcAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT | VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
    Dependencies[1].dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
    VkRenderPassCreateInfo PassInfo{ VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO };
    PassInfo.attachmentCount = 3; PassInfo.pAttachments = Attachments; PassInfo.subpassCount = 1; PassInfo.pSubpasses = &Subpass;
    PassInfo.dependencyCount = 2; PassInfo.pDependencies = Dependencies;
    if ((R = vkCreateRenderPass(Device, &PassInfo, nullptr, &Pass)) != VK_SUCCESS) return Fail("vkCreateRenderPass", R);

    VkDescriptorSetLayoutBinding Bindings[2]{};
    for (uint32_t I = 0; I < 2; ++I)
    {
        Bindings[I].binding = I; Bindings[I].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC; Bindings[I].descriptorCount = 1;
        Bindings[I].stageFlags = VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT;
    }
    VkDescriptorSetLayoutCreateInfo SetInfo{ VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO };
    SetInfo.bindingCount = 2; SetInfo.pBindings = Bindings;
    if ((R = vkCreateDescriptorSetLayout(Device, &SetInfo, nullptr, &SetLayout)) != VK_SUCCESS) return Fail("vkCreateDescriptorSetLayout", R);
    const VkDescriptorPoolSize PoolSize{ VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC, 2 };
    VkDescriptorPoolCreateInfo DescriptorPool{ VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO };
    DescriptorPool.maxSets = 1; DescriptorPool.poolSizeCount = 1; DescriptorPool.pPoolSizes = &PoolSize;
    if ((R = vkCreateDescriptorPool(Device, &DescriptorPool, nullptr, &SetPool)) != VK_SUCCESS) return Fail("vkCreateDescriptorPool", R);
    VkDescriptorSetAllocateInfo SetAlloc{ VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO };
    SetAlloc.descriptorPool = SetPool; SetAlloc.descriptorSetCount = 1; SetAlloc.pSetLayouts = &SetLayout;
    if ((R = vkAllocateDescriptorSets(Device, &SetAlloc, &Set)) != VK_SUCCESS) return Fail("vkAllocateDescriptorSets", R);
    VkPipelineLayoutCreateInfo LayoutInfo{ VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO };
    LayoutInfo.setLayoutCount = 1; LayoutInfo.pSetLayouts = &SetLayout;
    if ((R = vkCreatePipelineLayout(Device, &LayoutInfo, nullptr, &Layout)) != VK_SUCCESS) return Fail("vkCreatePipelineLayout", R);

    ViewStride = AlignUp(ViewRecordBytes, UniformAlignment);
    DrawStride = AlignUp(DrawRecordBytes, UniformAlignment);
    DrawBase   = AlignUp(ViewStride * ViewSlotCount, UniformAlignment);
    return true;
}

bool DeviceRasterExchange::Detail::CreateTargets() noexcept
{
    OutW = std::max(OutW, 1u); OutH = std::max(OutH, 1u);
    W = OutW * Samples; H = OutH * Samples;
    const VkDeviceSize PixelCount = static_cast<VkDeviceSize>(W) * H;
    constexpr VkImageUsageFlags ReadableTarget = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT;
    if (!AllocateImage(Colour, ColourFormat, ReadableTarget, VK_IMAGE_ASPECT_COLOR_BIT)) return false;
    if (!AllocateImage(Pick,   PickFormat,   ReadableTarget, VK_IMAGE_ASPECT_COLOR_BIT)) return false;
    if (!AllocateImage(Depth,  DepthFormat,  VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT,
                       VK_IMAGE_ASPECT_DEPTH_BIT)) return false;
    const VkImageView Views[3] = { Colour.View, Pick.View, Depth.View };
    VkFramebufferCreateInfo Info{ VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO };
    Info.renderPass = Pass; Info.attachmentCount = 3; Info.pAttachments = Views; Info.width = W; Info.height = H; Info.layers = 1;
    const VkResult R = vkCreateFramebuffer(Device, &Info, nullptr, &Framebuffer);
    if (R != VK_SUCCESS) return Fail("vkCreateFramebuffer", R);
    if (!AllocateBuffer(ReadColour, PixelCount * 8, VK_BUFFER_USAGE_TRANSFER_DST_BIT, true)) return false;
    if (!AllocateBuffer(ReadPick,   PixelCount * 4, VK_BUFFER_USAGE_TRANSFER_DST_BIT, true)) return false;
    if (!AllocateBuffer(ReadDepth,  PixelCount * 4, VK_BUFFER_USAGE_TRANSFER_DST_BIT, true)) return false;
    if (!AllocateBuffer(Uniforms, DrawBase + DrawStride * DrawSlotCount, VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT, false)) return false;
    if (!AllocateBuffer(Stream, StreamRingBytes, VK_BUFFER_USAGE_VERTEX_BUFFER_BIT | VK_BUFFER_USAGE_INDEX_BUFFER_BIT, false)) return false;
    const VkDescriptorBufferInfo Ranges[2] = { { Uniforms.Handle, 0, ViewRecordBytes }, { Uniforms.Handle, DrawBase, DrawRecordBytes } };
    VkWriteDescriptorSet Writes[2]{};
    for (uint32_t I = 0; I < 2; ++I)
    {
        Writes[I].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET; Writes[I].dstSet = Set; Writes[I].dstBinding = I;
        Writes[I].descriptorCount = 1;
        Writes[I].descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC;
        Writes[I].pBufferInfo = &Ranges[I];
    }
    vkUpdateDescriptorSets(Device, 2, Writes, 0, nullptr);
    Image8.assign(static_cast<size_t>(OutW) * OutH * 4, 0);
    PickPlane.assign(PixelCount, 0u);
    DepthPlane.assign(PixelCount, 1.0f);
    return true;
}

void DeviceRasterExchange::Detail::ReleaseTargets() noexcept
{
    if (Framebuffer) vkDestroyFramebuffer(Device, Framebuffer, nullptr);
    Framebuffer = VK_NULL_HANDLE;
    ReleaseImage(Colour); ReleaseImage(Pick); ReleaseImage(Depth);
    ReleaseBuffer(ReadColour); ReleaseBuffer(ReadPick); ReleaseBuffer(ReadDepth);
    ReleaseBuffer(Uniforms); ReleaseBuffer(Stream);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  PIPELINES
//------------------------------------------------------------------------------------------------------------------------

VkPipeline DeviceRasterExchange::Detail::BuildPipeline(Verb V, uint32_t Variant) noexcept
{
    const bool Overlay = Variant >= 4;
    const bool WritePick = Overlay ? (Variant == 4) : ((Variant & 1u) == 0);
    const bool WriteDepth = !Overlay && Variant < 2;

    VkPipelineShaderStageCreateInfo Stages[2]{};
    Stages[0] = { VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO, nullptr, 0, VK_SHADER_STAGE_VERTEX_BIT,
                  Modules[static_cast<uint32_t>(V)][0], "main", nullptr };
    Stages[1] = { VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO, nullptr, 0, VK_SHADER_STAGE_FRAGMENT_BIT,
                  Modules[static_cast<uint32_t>(V)][1], "main", nullptr };

    // Vertex layouts mirror the Device*.vert.slang inputs: surfaces interleave pos3 + normal3 + uv2 per vertex, lines and points
    //    step per instance.
    VkVertexInputBindingDescription   Binding{ 0, 0, VK_VERTEX_INPUT_RATE_VERTEX };
    VkVertexInputAttributeDescription Attributes[3]{};
    uint32_t AttributeCount = 0;
    VkPrimitiveTopology Topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    switch (V)
    {
    case Verb::Surface:
        Binding.stride = 32;
        Attributes[0] = { 0, 0, VK_FORMAT_R32G32B32_SFLOAT, 0 };
        Attributes[1] = { 1, 0, VK_FORMAT_R32G32B32_SFLOAT, 12 };
        Attributes[2] = { 2, 0, VK_FORMAT_R32G32_SFLOAT, 24 };
        AttributeCount = 3;
        break;
    case Verb::Line:
        Binding.stride = 24; Binding.inputRate = VK_VERTEX_INPUT_RATE_INSTANCE; Topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP;
        Attributes[0] = { 0, 0, VK_FORMAT_R32G32B32_SFLOAT, 0 };
        Attributes[1] = { 1, 0, VK_FORMAT_R32G32B32_SFLOAT, 12 };
        AttributeCount = 2;
        break;
    case Verb::Point:
        Binding.stride = 16; Binding.inputRate = VK_VERTEX_INPUT_RATE_INSTANCE; Topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP;
        Attributes[0] = { 0, 0, VK_FORMAT_R32G32B32_SFLOAT, 0 };
        Attributes[1] = { 1, 0, VK_FORMAT_R32_SFLOAT, 12 };
        AttributeCount = 2;
        break;
    default: break;                                                                 // Lattice: no vertex input
    }
    VkPipelineVertexInputStateCreateInfo Input{ VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO };
    if (AttributeCount)
    {
        Input.vertexBindingDescriptionCount = 1; Input.pVertexBindingDescriptions = &Binding;
        Input.vertexAttributeDescriptionCount = AttributeCount; Input.pVertexAttributeDescriptions = Attributes;
    }
    VkPipelineInputAssemblyStateCreateInfo Assembly{ VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO };
    Assembly.topology = Topology;
    VkPipelineViewportStateCreateInfo ViewportState{ VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO };
    ViewportState.viewportCount = 1; ViewportState.scissorCount = 1;
    VkPipelineRasterizationStateCreateInfo Raster{ VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO };
    Raster.polygonMode = VK_POLYGON_MODE_FILL;
    Raster.cullMode = VK_CULL_MODE_NONE;                                            // back faces are tinted, never dropped
    Raster.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE; Raster.lineWidth = 1.0f;
    VkPipelineMultisampleStateCreateInfo Multisample{ VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO };
    Multisample.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;
    VkPipelineDepthStencilStateCreateInfo DepthState{ VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO };
    DepthState.depthTestEnable = (Overlay || V == Verb::Lattice) ? VK_FALSE : VK_TRUE;
    DepthState.depthWriteEnable = WriteDepth ? VK_TRUE : VK_FALSE;
    DepthState.depthCompareOp = VK_COMPARE_OP_LESS_OR_EQUAL;                        // clear 1.0, +Y down, depth 0..1 like the software raster

    VkPipelineColorBlendAttachmentState Blend[2]{};
    Blend[0].blendEnable = VK_TRUE;
    Blend[0].srcColorBlendFactor = VK_BLEND_FACTOR_SRC_ALPHA;
    Blend[0].dstColorBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;
    Blend[0].colorBlendOp = VK_BLEND_OP_ADD;
    Blend[0].srcAlphaBlendFactor = VK_BLEND_FACTOR_ONE;
    Blend[0].dstAlphaBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;
    Blend[0].alphaBlendOp = VK_BLEND_OP_ADD;
    Blend[0].colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT | VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
    Blend[1].blendEnable = VK_FALSE;                                                // an integer target cannot blend
    // 📝 A zero write mask is how a draw declines to pick.
    Blend[1].colorWriteMask = (WritePick && V != Verb::Lattice) ? VK_COLOR_COMPONENT_R_BIT : 0;
    VkPipelineColorBlendStateCreateInfo BlendState{ VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO };
    BlendState.attachmentCount = 2; BlendState.pAttachments = Blend;
    const VkDynamicState Dynamics[2] = { VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR };
    VkPipelineDynamicStateCreateInfo DynamicState{ VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO };
    DynamicState.dynamicStateCount = 2; DynamicState.pDynamicStates = Dynamics;

    VkGraphicsPipelineCreateInfo Info{ VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO };
    Info.stageCount = 2; Info.pStages = Stages; Info.pVertexInputState = &Input; Info.pInputAssemblyState = &Assembly;
    Info.pViewportState = &ViewportState; Info.pRasterizationState = &Raster; Info.pMultisampleState = &Multisample;
    Info.pDepthStencilState = &DepthState; Info.pColorBlendState = &BlendState; Info.pDynamicState = &DynamicState;
    Info.layout = Layout; Info.renderPass = Pass; Info.subpass = 0;
    VkPipeline Pipeline = VK_NULL_HANDLE;
    const VkResult R = vkCreateGraphicsPipelines(Device, Cache, 1, &Info, nullptr, &Pipeline);
    if (R != VK_SUCCESS) { Fail("vkCreateGraphicsPipelines", R); return VK_NULL_HANDLE; }
    return Pipeline;
}

VkPipeline DeviceRasterExchange::Detail::PipelineFor(Verb V, bool WriteDepth, bool WritePick) noexcept
{
    const uint32_t Variant = V == Verb::Lattice ? VariantOf(false, false, false) : VariantOf(Overlay, WriteDepth, WritePick);
    VkPipeline& Slot = Pipelines[static_cast<uint32_t>(V)][Variant];
    if (Slot == VK_NULL_HANDLE) Slot = BuildPipeline(V, Variant);
    return Slot;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  RECORDING HELPERS
//------------------------------------------------------------------------------------------------------------------------

void DeviceRasterExchange::Detail::PackDraw(const DrawRecord& Draw, float* Out) const noexcept
{
    // Mirrors DrawRecord in ShadingRecords.slang: LocalWorld, Tint, Selection (state, pick bits, width, size), Surface (matcap,
    //    shading, emissive, dashed).
    std::memcpy(Out, Draw.LocalWorld, sizeof(float) * 16);
    std::memcpy(Out + 16, Draw.Tint, sizeof(float) * 4);
    const float Scale = static_cast<float>(Samples);                               // lengths in pixels are counted in working pixels
    Out[20] = Draw.Highlight;
    std::memcpy(Out + 21, &Draw.PickIdentity, sizeof(uint32_t));
    Out[22] = Draw.LineWidth * Scale;
    Out[23] = Draw.PointSize * Scale;
    Out[24] = static_cast<float>(Draw.Matcap);
    Out[25] = static_cast<float>(Draw.Shading);
    Out[26] = Draw.Emissive;
    Out[27] = Draw.Dashed ? 1.0f : 0.0f;
}

bool DeviceRasterExchange::Detail::ReserveDraw(const DrawRecord& Draw, uint32_t& DrawOffset) noexcept
{
    if (!Recording || Faulted || !ViewBound) return false;
    if (DrawCount >= DrawSlotCount) { ++Overflowed; return false; }
    DrawOffset = static_cast<uint32_t>(DrawBase + DrawStride * DrawCount);
    float Packed[28];
    PackDraw(Draw, Packed);
    std::memcpy(static_cast<uint8_t*>(Uniforms.Mapped) + DrawOffset, Packed, sizeof(Packed));
    ++DrawCount;
    return true;
}

bool DeviceRasterExchange::Detail::ReserveStream(VkDeviceSize Bytes, VkDeviceSize& Offset) noexcept
{
    const VkDeviceSize Start = AlignUp(StreamCursor, 16);
    if (Start + Bytes > Stream.Size) { ++Overflowed; return false; }
    Offset = Start;
    StreamCursor = Start + Bytes;
    return true;
}

void DeviceRasterExchange::Detail::BindForDraw(VkPipeline Pipeline, uint32_t DrawOffset) noexcept
{
    if (Pipeline != BoundPipeline) { vkCmdBindPipeline(Commands, VK_PIPELINE_BIND_POINT_GRAPHICS, Pipeline); BoundPipeline = Pipeline; }
    const uint32_t Offsets[2] = { ViewOffset, DrawOffset - static_cast<uint32_t>(DrawBase) };
    vkCmdBindDescriptorSets(Commands, VK_PIPELINE_BIND_POINT_GRAPHICS, Layout, 0, 1, &Set, 2, Offsets);
}

void DeviceRasterExchange::Detail::LogTarget() noexcept
{
    const auto Now = std::chrono::steady_clock::now();
    ++TargetsSinceLog;
    MillisecondsSinceLog += TargetMilliseconds;
    const bool Resized = (LoggedW != OutW || LoggedH != OutH);
    const bool Quiet = LastLog.time_since_epoch().count() != 0 && std::chrono::duration<double>(Now - LastLog).count() < LogIntervalSeconds;
    if (!Resized && Quiet) return;
    const float MeanMilliseconds = MillisecondsSinceLog / static_cast<float>(std::max(1u, TargetsSinceLog));
    std::fprintf(stderr, "[SolidArcDevice] device=\"%s\" %ux%u x%u samples (%ux%u internal) targets=%u mean=%.2f ms "
                         "last=%.2f ms gpu=%.2f ms triangles=%u segments=%u points=%u draws=%u%s\n",
                 DeviceName.c_str(), OutW, OutH, Samples, W, H, TargetsSinceLog, MeanMilliseconds, TargetMilliseconds, GpuMilliseconds,
                 Count.Triangles, Count.Segments, Count.Points, DrawCount,
                 Overflowed ? " OVERFLOW (draws dropped — raise StreamRingBytes / DrawSlotCount)" : "");
    LastLog = Now; LoggedW = OutW; LoggedH = OutH; TargetsSinceLog = 0; MillisecondsSinceLog = 0.0f;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  PUBLIC
//------------------------------------------------------------------------------------------------------------------------

DeviceRasterExchange::DeviceRasterExchange() noexcept : Self(std::make_unique<Detail>()) {}

DeviceRasterExchange::~DeviceRasterExchange()
{
    if (Self) Self->Close();
}

std::unique_ptr<DeviceRasterExchange> DeviceRasterExchange::Create(uint32_t Width, uint32_t Height, const DeviceRasterBinding& Binding,
                                                                   std::string& Refusal) noexcept
{
    std::unique_ptr<DeviceRasterExchange> Raster(new (std::nothrow) DeviceRasterExchange());
    if (!Raster) { Refusal = "out of memory"; return nullptr; }
    Raster->Self->OutW = Width; Raster->Self->OutH = Height;
    if (!Raster->Self->Open(Binding, Refusal))
    {
        if (Refusal.empty()) Refusal = "Vulkan setup failed (see FAULT line above)";
        Raster->Self->Close();
        return nullptr;
    }
    std::fprintf(stderr, "[SolidArcRaster] Vulkan device raster ready on \"%s\" (%s device), shaders from %s\n",
                 Raster->Self->DeviceName.c_str(), Raster->Self->OwnsDevice ? "own headless" : "host-shared",
                 Raster->Self->SpirvDirectory.c_str());
    return Raster;
}

void DeviceRasterExchange::Resize(uint32_t Width, uint32_t Height) noexcept
{
    Detail& D = *Self;
    if (D.Device == VK_NULL_HANDLE || D.Faulted) return;
    if (Width == D.OutW && Height == D.OutH && D.Framebuffer) return;
    vkDeviceWaitIdle(D.Device);
    D.ReleaseTargets();
    D.OutW = Width; D.OutH = Height;
    D.Recording = false;
    D.CreateTargets();
}

uint32_t DeviceRasterExchange::Width() const noexcept { return Self->OutW; }
uint32_t DeviceRasterExchange::Height() const noexcept { return Self->OutH; }

void DeviceRasterExchange::AssignSamples(uint32_t Samples) noexcept
{
    const uint32_t Clamped = std::clamp<uint32_t>(Samples, 1u, 4u);
    if (Clamped == Self->Samples) return;
    Self->Samples = Clamped;
    vkDeviceWaitIdle(Self->Device);
    Self->ReleaseTargets();
    Self->Recording = false;
    Self->CreateTargets();
}

uint32_t DeviceRasterExchange::QuerySamples() const noexcept { return Self->Samples; }
const char* DeviceRasterExchange::QueryBackend() const noexcept { return Self->Faulted ? "vulkan (faulted)" : "vulkan"; }
float DeviceRasterExchange::QueryTargetMilliseconds() const noexcept { return Self->TargetMilliseconds; }

void DeviceRasterExchange::BeginTarget(const float ClearColour[4]) noexcept
{
    Detail& D = *Self;
    if (D.Faulted || D.Device == VK_NULL_HANDLE || D.Recording) return;
    D.TargetStart = std::chrono::steady_clock::now();
    D.Count = {}; D.ViewCount = 0; D.DrawCount = 0; D.StreamCursor = 0; D.Overflowed = 0;
    D.Overlay = false; D.ViewBound = false; D.BoundPipeline = VK_NULL_HANDLE;
    vkResetFences(D.Device, 1, &D.Fence);
    vkResetCommandBuffer(D.Commands, 0);
    VkCommandBufferBeginInfo Begin{ VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO };
    Begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    if (vkBeginCommandBuffer(D.Commands, &Begin) != VK_SUCCESS) { D.Fail("vkBeginCommandBuffer", VK_ERROR_UNKNOWN); return; }
    if (D.Queries)
    {
        vkCmdResetQueryPool(D.Commands, D.Queries, 0, 2);
        vkCmdWriteTimestamp(D.Commands, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, D.Queries, 0);
    }
    VkClearValue Clears[3]{};
    Clears[0].color.float32[0] = ClearColour[0]; Clears[0].color.float32[1] = ClearColour[1];
    Clears[0].color.float32[2] = ClearColour[2]; Clears[0].color.float32[3] = 1.0f;
    Clears[1].color.uint32[0] = 0u;
    Clears[2].depthStencil = { 1.0f, 0 };
    VkRenderPassBeginInfo Pass{ VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO };
    Pass.renderPass = D.Pass; Pass.framebuffer = D.Framebuffer; Pass.renderArea = { { 0, 0 }, { D.W, D.H } };
    Pass.clearValueCount = 3; Pass.pClearValues = Clears;
    vkCmdBeginRenderPass(D.Commands, &Pass, VK_SUBPASS_CONTENTS_INLINE);
    const VkViewport Viewport{ 0.0f, 0.0f, static_cast<float>(D.W), static_cast<float>(D.H), 0.0f, 1.0f };
    const VkRect2D   Scissor{ { 0, 0 }, { D.W, D.H } };
    vkCmdSetViewport(D.Commands, 0, 1, &Viewport);
    vkCmdSetScissor(D.Commands, 0, 1, &Scissor);
    D.Recording = true;
}

void DeviceRasterExchange::BindView(const ViewRecord& View) noexcept
{
    Detail& D = *Self;
    if (!D.Recording || D.Faulted) return;
    if (D.ViewCount >= ViewSlotCount) { ++D.Overflowed; return; }
    // The shader record is the first 68 floats of the C++ record; PixelAngle / PixelWorld ride in the reserved DepthPolicy lanes y and z.
    // Everything the shaders read in pixels is counted in working pixels, exactly as SoftwareRaster::BindView does.
    const float Scale = static_cast<float>(D.Samples);
    float Packed[68];
    std::memcpy(Packed, &View, sizeof(float) * 68);
    constexpr int Eye = 48, Viewport = 52, Lattice = 56, DepthPolicy = 64;          // [-] float offsets inside the shader record
    Packed[Viewport + 0] = View.Viewport[0] * Scale; Packed[Viewport + 1] = View.Viewport[1] * Scale;
    Packed[Viewport + 2] = View.Viewport[2] / Scale; Packed[Viewport + 3] = View.Viewport[3] / Scale;
    Packed[Lattice + 3]     = View.LatticeStyle[3] * Scale;
    Packed[DepthPolicy + 1] = View.PixelAngle / Scale;
    Packed[DepthPolicy + 2] = View.PixelWorld / Scale;
    static_assert(Eye + 4 == Viewport && Viewport + 4 == Lattice && Lattice + 8 == DepthPolicy, "ViewRecord lane layout");
    D.ViewOffset = static_cast<uint32_t>(D.ViewStride * D.ViewCount);
    std::memcpy(static_cast<uint8_t*>(D.Uniforms.Mapped) + D.ViewOffset, Packed, sizeof(Packed));
    ++D.ViewCount;
    D.ViewBound = true;
}

void DeviceRasterExchange::BeginOverlay() noexcept { Self->Overlay = true; }

void DeviceRasterExchange::DrawLattice() noexcept
{
    Detail& D = *Self;
    const DrawRecord Draw{};
    uint32_t Offset = 0;
    if (!D.ReserveDraw(Draw, Offset)) return;
    const VkPipeline Pipeline = D.PipelineFor(Verb::Lattice, false, false);
    if (!Pipeline) return;
    D.BindForDraw(Pipeline, Offset);
    vkCmdDraw(D.Commands, 3, 1, 0, 0);
}

void DeviceRasterExchange::DrawSurface(const SurfaceStream& Stream, const DrawRecord& Draw) noexcept
{
    Detail& D = *Self;
    const uint32_t Vertices = Stream.VertexCount();
    const uint32_t Indices  = static_cast<uint32_t>(Stream.Triangles.size() / 3 * 3);
    if (Vertices == 0 || Indices == 0) return;
    VkDeviceSize VertexOffset = 0, IndexOffset = 0;
    uint32_t DrawOffset = 0;
    if (!D.Recording || D.Faulted || !D.ViewBound) return;
    const VkDeviceSize VertexBytes = static_cast<VkDeviceSize>(Vertices) * 32, IndexBytes = static_cast<VkDeviceSize>(Indices) * 4;
    if (D.StreamCursor + VertexBytes + IndexBytes + 32 > D.Stream.Size) { ++D.Overflowed; return; }
    if (!D.ReserveDraw(Draw, DrawOffset)) return;
    D.ReserveStream(VertexBytes, VertexOffset);
    D.ReserveStream(IndexBytes, IndexOffset);
    float* Out = reinterpret_cast<float*>(static_cast<uint8_t*>(D.Stream.Mapped) + VertexOffset);
    const bool HasNormals = Stream.Normals.size() >= static_cast<size_t>(Vertices) * 3;
    const bool HasParameters = Stream.Parameters.size() >= static_cast<size_t>(Vertices) * 2;
    for (uint32_t V = 0; V < Vertices; ++V)
    {
        float* Vertex = Out + static_cast<size_t>(V) * 8;
        for (int C = 0; C < 3; ++C) Vertex[C] = Stream.Positions[static_cast<size_t>(V) * 3 + C];
        for (int C = 0; C < 3; ++C) Vertex[3 + C] = HasNormals ? Stream.Normals[static_cast<size_t>(V) * 3 + C] : (C == 2 ? 1.0f : 0.0f);
        for (int C = 0; C < 2; ++C) Vertex[6 + C] = HasParameters ? Stream.Parameters[static_cast<size_t>(V) * 2 + C] : 0.0f;
    }
    // A stray index past the vertex count would read beyond the interleaved range, so clamp rather than trust the caller.
    uint32_t* Index = reinterpret_cast<uint32_t*>(static_cast<uint8_t*>(D.Stream.Mapped) + IndexOffset);
    for (uint32_t I = 0; I < Indices; ++I) Index[I] = std::min(Stream.Triangles[I], Vertices - 1u);
    const bool Opaque = Draw.Tint[3] > 0.5f;
    const bool Picks = Draw.PickIdentity != 0;
    const VkPipeline Pipeline = D.PipelineFor(Verb::Surface, Opaque, Picks);
    if (!Pipeline) return;
    D.BindForDraw(Pipeline, DrawOffset);
    vkCmdBindVertexBuffers(D.Commands, 0, 1, &D.Stream.Handle, &VertexOffset);
    vkCmdBindIndexBuffer(D.Commands, D.Stream.Handle, IndexOffset, VK_INDEX_TYPE_UINT32);
    vkCmdDrawIndexed(D.Commands, Indices, 1, 0, 0, 0);
    D.Count.Triangles += Indices / 3;
}

void DeviceRasterExchange::DrawSegments(const SegmentStream& Stream, const DrawRecord& Draw) noexcept
{
    Detail& D = *Self;
    const uint32_t Segments = Stream.SegmentCount();
    if (Segments == 0 || !D.Recording || D.Faulted || !D.ViewBound) return;
    VkDeviceSize Offset = 0;
    uint32_t DrawOffset = 0;
    const VkDeviceSize Bytes = static_cast<VkDeviceSize>(Segments) * 24;
    if (D.StreamCursor + Bytes + 16 > D.Stream.Size) { ++D.Overflowed; return; }
    if (!D.ReserveDraw(Draw, DrawOffset)) return;
    D.ReserveStream(Bytes, Offset);
    std::memcpy(static_cast<uint8_t*>(D.Stream.Mapped) + Offset, Stream.Endpoints.data(), static_cast<size_t>(Bytes));
    const VkPipeline Pipeline = D.PipelineFor(Verb::Line, true, Draw.PickIdentity != 0);
    if (!Pipeline) return;
    D.BindForDraw(Pipeline, DrawOffset);
    vkCmdBindVertexBuffers(D.Commands, 0, 1, &D.Stream.Handle, &Offset);
    vkCmdDraw(D.Commands, 4, Segments, 0, 0);
    D.Count.Segments += Segments;
}

void DeviceRasterExchange::DrawPoints(const PointStream& Stream, const DrawRecord& Draw) noexcept
{
    Detail& D = *Self;
    const uint32_t Points = Stream.PointCount();
    if (Points == 0 || !D.Recording || D.Faulted || !D.ViewBound) return;
    VkDeviceSize Offset = 0;
    uint32_t DrawOffset = 0;
    const VkDeviceSize Bytes = static_cast<VkDeviceSize>(Points) * 16;
    if (D.StreamCursor + Bytes + 16 > D.Stream.Size) { ++D.Overflowed; return; }
    if (!D.ReserveDraw(Draw, DrawOffset)) return;
    D.ReserveStream(Bytes, Offset);
    std::memcpy(static_cast<uint8_t*>(D.Stream.Mapped) + Offset, Stream.Points.data(), static_cast<size_t>(Bytes));
    const VkPipeline Pipeline = D.PipelineFor(Verb::Point, true, Draw.PickIdentity != 0);
    if (!Pipeline) return;
    D.BindForDraw(Pipeline, DrawOffset);
    vkCmdBindVertexBuffers(D.Commands, 0, 1, &D.Stream.Handle, &Offset);
    vkCmdDraw(D.Commands, 4, Points, 0, 0);
    D.Count.Points += Points;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  END + READBACK
//------------------------------------------------------------------------------------------------------------------------

void DeviceRasterExchange::EndTarget() noexcept
{
    Detail& D = *Self;
    if (!D.Recording) return;
    D.Recording = false; D.Overlay = false;
    vkCmdEndRenderPass(D.Commands);
    if (D.Queries) vkCmdWriteTimestamp(D.Commands, VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT, D.Queries, 1);
    const VkBufferImageCopy ColourCopy{ 0, 0, 0, { VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1 }, { 0, 0, 0 }, { D.W, D.H, 1 } };
    const VkBufferImageCopy DepthCopy { 0, 0, 0, { VK_IMAGE_ASPECT_DEPTH_BIT, 0, 0, 1 }, { 0, 0, 0 }, { D.W, D.H, 1 } };
    vkCmdCopyImageToBuffer(D.Commands, D.Colour.Handle, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, D.ReadColour.Handle, 1, &ColourCopy);
    vkCmdCopyImageToBuffer(D.Commands, D.Pick.Handle,   VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, D.ReadPick.Handle,   1, &ColourCopy);
    vkCmdCopyImageToBuffer(D.Commands, D.Depth.Handle,  VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, D.ReadDepth.Handle,  1, &DepthCopy);
    VkMemoryBarrier Host{ VK_STRUCTURE_TYPE_MEMORY_BARRIER };
    Host.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT; Host.dstAccessMask = VK_ACCESS_HOST_READ_BIT;
    vkCmdPipelineBarrier(D.Commands, VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_HOST_BIT, 0, 1, &Host, 0, nullptr, 0, nullptr);
    VkResult R = vkEndCommandBuffer(D.Commands);
    if (R != VK_SUCCESS) { D.Fail("vkEndCommandBuffer", R); return; }
    VkSubmitInfo Submit{ VK_STRUCTURE_TYPE_SUBMIT_INFO };
    Submit.commandBufferCount = 1; Submit.pCommandBuffers = &D.Commands;
    R = vkQueueSubmit(D.Queue, 1, &Submit, D.Fence);
    if (R != VK_SUCCESS) { D.Fail("vkQueueSubmit", R); return; }
    // 📝 Deliberately synchronous: the console and the picker read the target straight after EndTarget. The wait is bounded so a hung GPU
    //    surfaces as a logged fault, never a frozen tool.
    R = vkWaitForFences(D.Device, 1, &D.Fence, VK_TRUE, 5'000'000'000ull);
    if (R != VK_SUCCESS) { D.Fail("vkWaitForFences (5 s)", R); return; }
    if (D.Queries)
    {
        uint64_t Stamps[2] = {};
        if (vkGetQueryPoolResults(D.Device, D.Queries, 0, 2, sizeof(Stamps), Stamps, sizeof(uint64_t), VK_QUERY_RESULT_64_BIT) == VK_SUCCESS)
            D.GpuMilliseconds = static_cast<float>(static_cast<double>(Stamps[1] - Stamps[0]) * D.TimestampPeriod * 1e-6);
    }

    // Downsample the linear half-float plane with a box filter, then apply the display curve once — the same order
    //    SoftwareRaster::Readback uses.
    const uint16_t* Source = static_cast<const uint16_t*>(D.ReadColour.Mapped);
    const uint32_t N = D.Samples;
    const float Share = 1.0f / static_cast<float>(N * N);
    for (uint32_t Y = 0; Y < D.OutH; ++Y)
        for (uint32_t X = 0; X < D.OutW; ++X)
        {
            float Sum[4] = { 0.0f, 0.0f, 0.0f, 0.0f };
            for (uint32_t Row = 0; Row < N; ++Row)
                for (uint32_t Column = 0; Column < N; ++Column)
                {
                    const uint16_t* Texel = Source + (static_cast<size_t>(Y * N + Row) * D.W + (X * N + Column)) * 4;
                    for (int C = 0; C < 4; ++C) Sum[C] += Saturate(HalfToFloat(Texel[C]));
                }
            uint8_t* Destination = &D.Image8[(static_cast<size_t>(Y) * D.OutW + X) * 4];
            for (int C = 0; C < 4; ++C)
            {
                float V = Sum[C] * Share;
                if (C != 3) V = std::pow(Saturate(V), 1.0f / 2.2f);
                Destination[C] = static_cast<uint8_t>(std::lround(Saturate(V) * 255.0f));
            }
        }
    std::memcpy(D.PickPlane.data(), D.ReadPick.Mapped, D.PickPlane.size() * sizeof(uint32_t));
    std::memcpy(D.DepthPlane.data(), D.ReadDepth.Mapped, D.DepthPlane.size() * sizeof(float));
    D.TargetMilliseconds = std::chrono::duration<float, std::milli>(std::chrono::steady_clock::now() - D.TargetStart).count();
    D.LogTarget();
}

RasterImage DeviceRasterExchange::Readback() const noexcept
{
    RasterImage Image;
    Image.Width = Self->OutW; Image.Height = Self->OutH; Image.Pixels = Self->Image8;
    return Image;
}

uint32_t DeviceRasterExchange::Pick(uint32_t X, uint32_t Y) const noexcept
{
    const Detail& D = *Self;
    if (X >= D.OutW || Y >= D.OutH || D.PickPlane.empty()) return 0;
    const uint32_t Centre = D.Samples / 2u;
    return D.PickPlane[static_cast<size_t>(Y * D.Samples + Centre) * D.W + (X * D.Samples + Centre)];
}

float DeviceRasterExchange::Depth(uint32_t X, uint32_t Y) const noexcept
{
    const Detail& D = *Self;
    if (X >= D.OutW || Y >= D.OutH || D.DepthPlane.empty()) return 1.0f;
    const uint32_t Centre = D.Samples / 2u;
    return D.DepthPlane[static_cast<size_t>(Y * D.Samples + Centre) * D.W + (X * D.Samples + Centre)];
}

RasterExchange::Tally DeviceRasterExchange::QueryTally() const noexcept { return Self->Count; }

} // namespace Frontier
