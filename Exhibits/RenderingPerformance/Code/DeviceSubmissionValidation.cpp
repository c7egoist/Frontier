/*==========================================================================================================================================
                                                    DEVICESUBMISSIONVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 Exercises Vulkan writes, command ordering and upload-plus-copy submission cost.

#include "DeviceExchange/DeviceExchange.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cstdio>
#include <string>
#include <vector>
using namespace Frontier;
namespace
{
int Failures = 0;
void Check(bool Condition, const char* Label)
{
    std::printf("[%s] %s\n", Condition ? "PASS" : "FAIL", Label);
    if (!Condition) ++Failures;
}
bool ReadMatches(DeviceExchange& Exchange, const std::shared_ptr<DeviceRegion>& Region, const std::vector<uint8_t>& Expected)
{
    std::vector<uint8_t> Actual;
    return Exchange.ReadRegion(Region, 0, Expected.size(), Actual) && Actual == Expected;
}
void Validate(DeviceExchange& Exchange, bool ExpectBatched, bool Large)
{
    std::string Diagnostic;
    std::vector<uint8_t> Expected(64, 0x11);
    auto Source = Exchange.ConstructRegionFrom(Expected.data(), Expected.size(), "Submission source");
    auto Target = Exchange.ConstructRegion(Expected.size(), "Submission target");
    if (!Source || !Target) { Check(false, "regions constructed"); return; }
    auto Sequence = Exchange.BeginSequence();
    Sequence.CopyRegion(Source, 0, Target, 0, Expected.size());
    std::vector<uint8_t> First(24, 0x22), Second(24, 0x33);
    Exchange.WriteRegion(Source, 16, First.data(), First.size());
    Exchange.WriteRegion(Source, 32, Second.data(), Second.size());
    std::copy(First.begin(), First.end(), Expected.begin() + 16);
    std::copy(Second.begin(), Second.end(), Expected.begin() + 32);
    uint64_t Before = Exchange.CompletedSubmissions();
    Check(Exchange.Submit(Sequence, &Diagnostic), "submit overlapping and disjoint writes");
    uint64_t Count = Exchange.CompletedSubmissions() - Before;
    std::printf("  upload plus command submissions: %llu\n", static_cast<unsigned long long>(Count));
    if (ExpectBatched) Check(Count == 1, "uploads and commands use one submission");
    Check(ReadMatches(Exchange, Target, Expected), "copy observes the last overlapping write");

    TextureSpecification Specification;
    Specification.Label = "Layered transfer validation";
    Specification.Width = 4; Specification.Height = 4; Specification.DepthOrLayers = 2;
    Specification.Format = TextureFormat::Rgba8Unorm;
    Specification.Usage = TextureUsage::Sampled | TextureUsage::CopySource | TextureUsage::CopyTarget;
    auto Texture = Exchange.ConstructTexture(Specification);
    if (!Texture) { Check(false, "layered texture constructed"); return; }
    std::vector<uint8_t> Red(64), Green(16), Blue(64);
    for (size_t Offset = 0; Offset < Red.size(); Offset += 4)
    { Red[Offset] = 255; Red[Offset + 3] = 255; Blue[Offset + 2] = 255; Blue[Offset + 3] = 255; }
    for (size_t Offset = 0; Offset < Green.size(); Offset += 4) { Green[Offset + 1] = 255; Green[Offset + 3] = 255; }
    Exchange.WriteTexture(Texture, 0, Red.data(), Red.size(), 4, 4);
    Exchange.WriteTexture(Texture, 0, Green.data(), Green.size(), 2, 2, 1, 1, 1);
    Exchange.WriteTexture(Texture, 1, Blue.data(), Blue.size(), 4, 4);
    for (uint32_t Row = 1; Row < 3; ++Row) for (uint32_t Column = 1; Column < 3; ++Column)
    { const size_t Offset = (Row * 4 + Column) * 4; Red[Offset] = 0; Red[Offset + 1] = 255; }
    auto TextureSequence = Exchange.BeginSequence();
    Check(Exchange.Submit(TextureSequence, &Diagnostic), "submit image transitions and layered writes");
    std::vector<uint8_t> Image;
    Check(Exchange.ReadTexture(Texture, 0, 0, Image) && Image == Red, "overlapping image writes retain order");
    Check(Exchange.ReadTexture(Texture, 1, 0, Image) && Image == Blue, "independent image layer intact");

    auto Middle = Exchange.ConstructRegion(Expected.size(), "Series middle");
    auto End = Exchange.ConstructRegion(Expected.size(), "Series end");
    if (!Middle || !End) { Check(false, "series regions constructed"); return; }
    auto FirstSequence = Exchange.BeginSequence(); auto SecondSequence = Exchange.BeginSequence();
    FirstSequence.CopyRegion(Source, 0, Middle, 0, Expected.size());
    SecondSequence.CopyRegion(Middle, 0, End, 0, Expected.size());
    std::fill(Expected.begin(), Expected.end(), 0x5a); Exchange.WriteRegion(Source, 0, Expected.data(), Expected.size());
    const std::array<CommandSequence*, 2> Series{&FirstSequence, &SecondSequence};
    const std::array<std::string, 2> Labels{"first", "second"};
    Before = Exchange.CompletedSubmissions();
    Check(Exchange.SubmitSeries(Series, Labels, &Diagnostic), "submit dependent command series");
    Count = Exchange.CompletedSubmissions() - Before;
    std::printf("  upload plus two series submissions: %llu\n", static_cast<unsigned long long>(Count));
    if (ExpectBatched) Check(Count == 2, "series attaches uploads to first sequence");
    Check(ReadMatches(Exchange, End, Expected), "series dependencies preserve data");
    std::fill(Expected.begin(), Expected.end(), 0xa5); Exchange.WriteRegion(Source, 0, Expected.data(), Expected.size());
    Check(Exchange.FlushWrites(&Diagnostic) && ReadMatches(Exchange, Source, Expected), "explicit flush reaches device");
    std::fill(Expected.begin(), Expected.end(), 0x7c); Exchange.WriteRegion(Source, 0, Expected.data(), Expected.size());
    Check(Exchange.SubmitSeries({}, {}, &Diagnostic) && ReadMatches(Exchange, Source, Expected), "empty series flushes writes");
    std::fill(Expected.begin(), Expected.end(), 0x6b); Exchange.WriteRegion(Source, 0, Expected.data(), Expected.size());
    Check(ReadMatches(Exchange, Source, Expected), "readback flushes pending writes");
    auto EmptySequence = Exchange.BeginSequence(); Before = Exchange.CompletedSubmissions();
    Check(Exchange.Submit(EmptySequence) && Exchange.CompletedSubmissions() - Before == 1, "submit without writes uses one submission");
    auto Temporary = Exchange.ConstructTexture(Specification);
    std::weak_ptr<DeviceTexture> Weak = Temporary;
    Exchange.WriteTexture(Temporary, 0, Blue.data(), Blue.size(), 4, 4); Temporary.reset();
    Check(!Weak.expired(), "pending write retains texture");
    auto Lifetime = Exchange.BeginSequence();
    Check(Exchange.Submit(Lifetime) && Weak.expired(), "texture released after completion");
    if (Large)
    {
        constexpr VkDeviceSize LargeBytes = 81ull * 1024 * 1024;
        std::fill(Expected.begin(), Expected.end(), 0x9d);
        auto Copy = Exchange.BeginSequence(); Copy.CopyRegion(Source, 0, Target, 0, Expected.size());
        Exchange.WriteRegion(Source, 0, Expected.data(), Expected.size()); Before = Exchange.CompletedSubmissions();
        auto Growth = Exchange.ConstructRegion(LargeBytes, "Growth region");
        Check(Growth && Exchange.CompletedSubmissions() > Before, "staging growth flushes earlier writes");
        if (!Growth) return;
        Check(Exchange.Submit(Copy) && ReadMatches(Exchange, Target, Expected), "pre-growth upload reaches recorded copy");
        std::vector<uint8_t> Last;
        Check(Exchange.ReadRegion(Growth, LargeBytes - 16, 16, Last) && Last == std::vector<uint8_t>(16), "grown zero fill complete");
    }
    Check(Exchange.Faults().empty(), "no exchange faults");
}
void Measure(DeviceExchange& Exchange)
{
    constexpr uint32_t Repetitions = 500, Rounds = 7;
    std::vector<uint8_t> Contents(16 * 1024, 0x64);
    auto Source = Exchange.ConstructRegion(Contents.size(), "Measurement source");
    auto Target = Exchange.ConstructRegion(Contents.size(), "Measurement target");
    if (!Source || !Target || !Exchange.FlushWrites()) { ++Failures; return; }
    std::vector<double> Times; uint64_t Submissions = 0;
    for (uint32_t Round = 0; Round < Rounds + 1; ++Round)
    {
        const uint64_t Before = Exchange.CompletedSubmissions(); const auto Start = std::chrono::steady_clock::now();
        for (uint32_t Index = 0; Index < Repetitions; ++Index)
        {
            Contents[0] = static_cast<uint8_t>(Index); Exchange.WriteRegion(Source, 0, Contents.data(), Contents.size());
            auto Sequence = Exchange.BeginSequence(); Sequence.CopyRegion(Source, 0, Target, 0, Contents.size());
            if (!Exchange.Submit(Sequence)) { ++Failures; return; }
        }
        const auto Finish = std::chrono::steady_clock::now();
        if (!ReadMatches(Exchange, Target, Contents)) { ++Failures; return; }
        if (Round) { Times.push_back(std::chrono::duration<double, std::milli>(Finish - Start).count() / Repetitions);
                     Submissions += Exchange.CompletedSubmissions() - Before - 1; }
    }
    std::sort(Times.begin(), Times.end());
    std::printf("submission: median %.6f ms/iteration; range %.6f..%.6f; %.2f submissions/iteration\n",
                Times[3], Times.front(), Times.back(), static_cast<double>(Submissions) / (Rounds * Repetitions));
}
} // namespace
int main(int Count, char** Arguments)
{
    const std::string Mode = Count > 1 ? Arguments[1] : "";
    DeviceExchange Exchange; std::string Diagnostic;
    if (!Exchange.Initialize("", &Diagnostic)) { std::fprintf(stderr, "Vulkan device unavailable: %s\n", Diagnostic.c_str()); return 2; }
    std::printf("device: %s\n", Exchange.AdapterDescription().c_str());
    if (Mode == "--benchmark") Measure(Exchange); else Validate(Exchange, Mode == "--expect-batched", Mode == "--large");
    std::printf("DeviceSubmissionValidation: %d failures\n", Failures);
    return Failures ? 1 : 0;
}
