/*==========================================================================================================================================
                                             REPLAYDYNAMICCAMERAVALIDATION.H
==========================================================================================================================================*/
// 🧩 Check four-bounce replay through a simultaneous camera and blocker transition against independent CPU paths.
#pragma once

namespace
{

//------------------------------------------------------------------------------------------------------------------------
//                                  OCCLUSION-AWARE DYNAMIC MULTIBOUNCE VALIDATION
//------------------------------------------------------------------------------------------------------------------------

// 📝 Compare the colour-history layout during stable and changed-camera frames.
void ValidateReplayCompactReconstruction(const char* Driver, const std::string& Shaders)
{
    const auto Previous = ReplayCameraPlane(0, 0), Moved = ReplayCameraPlane(.0625f, 0, .1f);
    LightComputeSubmission Legacy(Driver), Compact(Driver);
    Legacy.Prepare(Previous, Shaders, false, false, false, false, true, false, 0);
    Compact.Prepare(Previous, Shaders, false, false, false, false, true, false, 1);
    Require(Compact.Buffers[6].Size == PathReplayRequiredCompactOutputRecords(
                uint32_t(Previous.Receivers.size()), true, false) * 16,
            "Compact reconstruction span differs");
    for (uint32_t Frame = 0; Frame < 4; ++Frame)
    {
        const auto& Scene = Frame < 3 ? Previous : Moved;
        const auto Execute = [&](LightComputeSubmission& Compute)
        {
            return ExecuteReplayCameraPlane(Compute, Scene, 920003u + Frame * 7919u, true, true, Frame == 0,
                                            true, true, 4, 4, {.025f,.025f,.025f}, false);
        };
        const auto A = Execute(Legacy), B = Execute(Compact);
        Require(A.size() == B.size() && std::memcmp(A.data(), B.data(), A.size() * sizeof(A[0])) == 0,
                "Compact reconstruction differs from legacy float readback");
        Require(Legacy.ExtendedStatistics() == Compact.ExtendedStatistics(),
                "Compact reconstruction counters differ");
        for (uint32_t Pixel = 0; Pixel < A.size(); ++Pixel)
            for (uint32_t Slot = 0; Slot <= 10; ++Slot)
                Require(ReplayTailSlot(Legacy, Slot, Pixel) == ReplayTailSlot(Compact, Slot, Pixel),
                        "Compact reconstruction history differs");
    }
    std::printf("COMPACT_RECONSTRUCTION_PARITY pixels=1024 frames=4 float_readbacks=bit_exact slots=equal\n");
}

void ValidateReplayReconstructionLayoutTransitions(const char* Driver, const std::string& Shaders)
{
    const auto Scene = ReplayCameraPlane(0, 0);
    LightComputeSubmission Switched(Driver), Fresh(Driver);
    Switched.Prepare(Scene, Shaders, false, false, false, false, true, false, 0);
    Fresh.Prepare(Scene, Shaders, false, false, false, false, true, false, 0);
    const auto Execute = [&](LightComputeSubmission& Compute, uint32_t Seed, bool Reset)
    {
        return ExecuteReplayCameraPlane(Compute, Scene, Seed, true, true, Reset, true, true,
                                        1, 2, {.025f,.025f,.025f}, false);
    };
    for (uint32_t Frame = 0; Frame < 3; ++Frame)
        (void)Execute(Switched, 610001u + Frame * 7919u, Frame == 0);
    for (uint32_t Transition = 0; Transition < 2; ++Transition)
    {
        Switched.CompactReplay = Transition == 0;
        Fresh.CompactReplay = Switched.CompactReplay;
        const uint32_t Seed = 710001u + Transition * 7919u;
        const auto Expected = Execute(Fresh, Seed, true);
        const auto Actual = Execute(Switched, Seed, false);
        Require(Switched.ReplayLastReset && Switched.ReplayLastReconstructionReset &&
                Switched.HistorySequence == 1 && Switched.ExtendedStatistics()[20] == 0 &&
                Switched.ExtendedStatistics()[23] == 0 && ReplayCandidateImagesEqual(Expected, Actual),
                "Layout switch failed to reset reconstructed colour and reservoir histories");
        (void)Execute(Switched, Seed + 1, false);
    }
    std::printf("LAYOUT_RECONSTRUCTION_TRANSITIONS directions=2 colour_reset=1 fresh_exact=1\n");
}

void ValidateReplayDynamicCamera(const char* Driver, const std::string& Shaders)
{
    ValidateReplayReconstructionLayoutTransitions(Driver, Shaders);
    ValidateReplayCompactReconstruction(Driver, Shaders);
    constexpr uint32_t Bounces = 4, Candidates = 4, WarmFrames = 3, Batches = 16, CpuSamples = 1024;
    const auto Previous = ReplayCameraPlane(0, 0);
    const auto Moved = ReplayCameraPlane(.0625f, 0, .1f);
    const auto Reopened = ReplayCameraPlane(.0625f, .0625f);
    const std::array<float,3> Environment{.025f,.025f,.025f};
    LightComputeSubmission Fresh(Driver), Filtered(Driver), Isolated(Driver);
    Fresh.Prepare(Previous, Shaders, false, false, false, false, true);
    Filtered.Prepare(Previous, Shaders, false, false, false, false, true);
    Isolated.Prepare(Moved, Shaders, false, false, false, false, true);
    const auto Render = [&](LightComputeSubmission& Compute, const LightComputeArchive& Scene, uint32_t Seed,
                            bool Reuse, bool Reset, bool Reconstruct, bool Camera)
    {
        return ExecuteReplayCameraPlane(Compute, Scene, Seed, Reuse, Reuse, Reset, Reconstruct, Camera,
                                        Candidates, Bounces, Environment, false);
    };
    std::mt19937_64 BatchSeeds(0xa7e5531dull);
    std::vector<double> ReferencePoint(Previous.Receivers.size(), -1);
    DirectGpuMoments ReusedBatches, FreshBatches, PairedDifference;
    double ReferenceSum = 0, ReferenceVariance = 0, ReusedSquared = 0, FreshSquared = 0;
    uint32_t ReferencePoints = 0, Disoccluded = 0, HistoryAccepted = 0, SpatialLinks = 0, UnreusedAtDisocclusion = 0;
    for (uint32_t Batch = 0; Batch < Batches; ++Batch)
    {
        for (uint32_t Frame = 0; Frame < WarmFrames; ++Frame)
        {
            const uint32_t Seed = uint32_t(BatchSeeds());
            (void)Render(Fresh, Previous, Seed, true, Frame == 0, false, false);
            (void)Render(Filtered, Previous, Seed, true, Frame == 0, true, true);
        }
        const auto PriorGuides = Filtered.PrimaryReceivers();
        const uint32_t Seed = uint32_t(BatchSeeds());
        const auto Raw = Render(Fresh, Moved, Seed, true, false, false, false);
        const auto Reconstructed = Render(Filtered, Moved, Seed, true, false, true, true);
        const auto FreshOnly = Render(Isolated, Moved, Seed, false, true, false, false);
        const auto Counts = Filtered.ExtendedStatistics();
        const auto Guides = Filtered.PrimaryReceivers();
        Require(!Filtered.ReplayLastReset && Filtered.ReplayLastHistoryCap == 1 &&
                    Filtered.ReplayLastReconstructionReset && Counts[20] > 100 && Counts[22] > 100 && Counts[23] == 0 &&
                    ReplayCandidateImagesEqual(Raw, Reconstructed),
                "Moving camera/blocker failed to retrace reservoirs or reset multibounce colour");
        if (Batch == 0)
        {
            HistoryAccepted = Counts[20];
            SpatialLinks = Counts[22];
            for (uint32_t Pixel = 0; Pixel < Guides.size(); ++Pixel)
            {
                const auto& R = Guides[Pixel];
                if (R.PositionHit[3] == 0 || R.MotionPixel[3] == 0) continue;
                const int32_t X = int32_t(std::floor(R.MotionPixel[0] + .5f));
                const int32_t Y = int32_t(std::floor(R.MotionPixel[1] + .5f));
                if (X < 0 || Y < 0 || X >= int32_t(Moved.Width) || Y >= int32_t(Moved.Height)) continue;
                const auto& Old = PriorGuides[uint32_t(Y) * Moved.Width + uint32_t(X)];
                if (Old.MotionPositionToken[3] != R.MotionPositionToken[3])
                {
                    ++Disoccluded;
                    if (ReplayTailSlot(Filtered, 2, Pixel)[3] == float(Candidates)) ++UnreusedAtDisocclusion;
                }
                if (R.MotionPositionToken[3] != 1) continue;
                std::mt19937_64 Random(0xc954d2b7ull + uint64_t(Pixel) * 0x9e3779b97f4a7c15ull);
                DirectGpuMoments Reference;
                for (uint32_t Sample = 0; Sample < CpuSamples; ++Sample)
                    Reference.Accumulate(ReplayReferencePath(Moved, R, Bounces, Random)[0]);
                const double Se = Reference.StandardError() * std::sqrt(double(CpuSamples) / (CpuSamples - 1));
                ReferencePoint[Pixel] = Reference.Mean();
                ReferenceSum += ReferencePoint[Pixel];
                ReferenceVariance += Se * Se;
                ++ReferencePoints;
            }
            Require(ReferencePoints > 500 && Disoccluded > 5 && UnreusedAtDisocclusion == Disoccluded,
                    "Dynamic camera fixture did not reject all cross-token histories");
            std::printf("DYNAMIC_CAMERA_REFERENCE cpu_paths=%u points=%u reference=%.9g cpu_mean_se=%.9g "
                        "disoccluded=%u temporal_rejected=%u accepted=%u spatial=%u\n",
                        ReferencePoints * CpuSamples, ReferencePoints, ReferenceSum / ReferencePoints,
                        std::sqrt(ReferenceVariance) / ReferencePoints, Disoccluded, UnreusedAtDisocclusion,
                        HistoryAccepted, SpatialLinks);
            std::fflush(stdout);
        }
        double ReusedMean = 0, FreshMean = 0;
        uint32_t Points = 0;
        for (uint32_t Pixel = 0; Pixel < ReferencePoint.size(); ++Pixel)
        {
            if (ReferencePoint[Pixel] < 0) continue;
            ReusedMean += Raw[Pixel][0];
            FreshMean += FreshOnly[Pixel][0];
            ReusedSquared += std::pow(double(Raw[Pixel][0]) - ReferencePoint[Pixel], 2);
            FreshSquared += std::pow(double(FreshOnly[Pixel][0]) - ReferencePoint[Pixel], 2);
            ++Points;
        }
        Require(Points == ReferencePoints, "Dynamic camera reference point count changed");
        ReusedBatches.Accumulate(ReusedMean / Points);
        FreshBatches.Accumulate(FreshMean / Points);
        PairedDifference.Accumulate((ReusedMean - FreshMean) / Points);
        if (Batch == 0)
        {
            const auto ReopenedRaw = Render(Fresh, Reopened, Seed + 1, true, false, false, false);
            const auto ReopenedResult = Render(Filtered, Reopened, Seed + 1, true, false, true, true);
            Require(Filtered.ReplayLastReconstructionReset && Filtered.ExtendedStatistics()[23] == 0 &&
                        ReplayCandidateImagesEqual(ReopenedRaw, ReopenedResult),
                    "Reopened dynamic multibounce scene retained stale colour");
        }
        if ((Batch + 1) % 4 == 0)
        {
            std::printf("DYNAMIC_CAMERA_BATCHES completed=%u/%u\n", Batch + 1, Batches);
            std::fflush(stdout);
        }
    }
    const double Correction = std::sqrt(double(Batches) / (Batches - 1));
    const double ReusedSe = ReusedBatches.StandardError() * Correction;
    const double FreshSe = FreshBatches.StandardError() * Correction;
    const double DifferenceSe = PairedDifference.StandardError() * Correction;
    const double ReferenceSe = std::sqrt(ReferenceVariance) / ReferencePoints;
    const double ReferenceMean = ReferenceSum / ReferencePoints;
    const double ReusedRmse = std::sqrt(ReusedSquared / (Batches * ReferencePoints));
    const double FreshRmse = std::sqrt(FreshSquared / (Batches * ReferencePoints));
    std::printf("DYNAMIC_CAMERA_MULTIBOUNCE bounces=%u candidates=%u batches=%u points=%u reference=%.9g "
                "cpu_mean_se=%.9g fresh=%.9g batch_se=%.9g reused=%.9g batch_se=%.9g "
                "fresh_rmse=%.9g reused_rmse=%.9g colour_reset=1 reopen_raw_exact=1\n",
                Bounces, Candidates, Batches, ReferencePoints, ReferenceMean, ReferenceSe,
                FreshBatches.Mean(), FreshSe, ReusedBatches.Mean(), ReusedSe,
                FreshRmse, ReusedRmse);
    std::printf("DYNAMIC_CAMERA_PAIRED reused_minus_fresh=%.9g batch_se=%.9g batches=%u\n",
                PairedDifference.Mean(), DifferenceSe, Batches);
    Require(std::abs(FreshBatches.Mean() - ReferenceMean) < 6 * std::hypot(FreshSe, ReferenceSe) + .003 &&
                std::abs(ReusedBatches.Mean() - ReferenceMean) < 6 * std::hypot(ReusedSe, ReferenceSe) + .003 &&
                std::abs(PairedDifference.Mean()) < 6 * DifferenceSe + .003,
            "Dynamic multibounce batches disagree with the independent CPU reference");
    std::printf("PASS bounded dynamic camera and occlusion-aware multibounce replay\n");
}
} // namespace
