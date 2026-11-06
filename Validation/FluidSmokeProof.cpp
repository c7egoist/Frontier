/*==========================================================================================================================================
                                                           FLUIDSMOKEPROOF.CPP
==========================================================================================================================================*/
// 🧩 Headless visual proof for the 1:1 C++ port of the exhibit's fluid/smoke editor: runs a scripted burnout
//    (slide, then ignite a tyre) through the ported plume lattice in the SDF world, marches it from an orbit
//    camera, composites over a studio-style background and writes VisualProof/FluidSmokeEditorProof.ppm
//    (+ .png when ImageMagick is available).
//
//    g++ -std=c++17 -O2 -I. Validation/FluidSmokeProof.cpp Experimental/FluidSmokeEditor/Source/*.cpp -o /tmp/FluidSmokeProof && /tmp/FluidSmokeProof

#include "Experimental/FluidSmokeEditor/Source/FluidSmokeEditor.h"
#include "Experimental/FluidSmokeEditor/Source/PlumeMarch.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

namespace
{

using namespace FluidSmoke;

constexpr int Width = 640, Height = 400;

// 📝 A plain studio-style background, standing in for SoftwarePresentation's frame.
std::vector<std::array<float, 3>> Background()
{
    std::vector<std::array<float, 3>> Bg(static_cast<size_t>(Width) * Height);
    for (int Y = 0; Y < Height; ++Y)
    {
        const float T = static_cast<float>(Y) / static_cast<float>(Height - 1);
        for (int X = 0; X < Width; ++X)
        {
            const float V = static_cast<float>(X) / static_cast<float>(Width - 1);
            Bg[static_cast<size_t>(Y) * Width + X] = { 0.10f + 0.06f * V, 0.11f + 0.07f * V, 0.14f + 0.08f * V
                                                       + 0.10f * (1.0f - T) };   // floor glow toward the top
        }
    }
    return Bg;
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    const std::string OutPpm = ArgumentCount > 1 ? Arguments[1] : "VisualProof/FluidSmokeEditorProof.ppm";

    FluidSmokeEditor Editor;
    Editor.Open(FluidEditorMode::Smoke);
    SceneDistanceField& Field = Editor.AccessField();

    // 📝 The ControlVehicle standing at the origin as the SDF world's dynamic occupant.
    OccupantRecord Vehicle;
    Vehicle.Roles = RoleDynamic;
    Vehicle.Orientation = { 0, 0, 0, 1 };
    Vehicle.Position = { 0, 0, 0.35f };
    Vehicle.HalfExtents = { 1.95f, 0.95f, 0.38f };
    Vehicle.PreviousPosition = Vehicle.Position;
    Field.AssignOccupants({ Vehicle });

    // 📝 Scripted burnout: the car slides (handbrake at speed), then the rear-left tyre ignites.
    PlumeTelemetry Telemetry;
    Telemetry.Position = { 0, 0, 0.5f };
    Telemetry.Velocity = { 9, 0, 0 };
    Telemetry.Exhausts = { { { -1.8f, 0.25f, 0.85f }, { -1, 0, 0 } }, { { -1.8f, -0.25f, 0.85f }, { -1, 0, 0 } } };
    WheelTelemetry Wheel;
    Wheel.ContactFraction = 1.0f;
    Wheel.SurfaceSpeed = 9.0f;
    Wheel.ContactVelocity = { 9, 0, 0 };
    Wheel.Radius = 0.33f;
    const Vec3 Forward = { 1, 0, 0 }, Lateral = { 0, 1, 0 };
    const float Base[4][2] = { { 1.25f, 0.78f }, { 1.25f, -0.78f }, { -1.25f, 0.78f }, { -1.25f, -0.78f } };
    float Surface[4] = { 300, 300, 300, 300 };
    bool Ignited[4] = { false, false, false, false };
    for (int W = 0; W < 4; ++W)
    {
        Wheel.HubPosition = { Base[W][0], Base[W][1], 0.83f };
        Wheel.ContactPoint = { Base[W][0], Base[W][1], 0.02f };
        Wheel.SlipSpeed = 7.0f;
        Wheel.SlidingPower = 12000.0f;
        Telemetry.Wheels.push_back(Wheel);
    }

    const float Dt = 1.0f / 60.0f;
    for (int Frame = 0; Frame < 360; ++Frame)   // 6 s: slide, then ignite the rear-left
    {
        for (int W = 0; W < 4; ++W)
        {
            Surface[W] += (Telemetry.Wheels[W].SlidingPower * 0.15f - 6.0f * (Surface[W] - 300.0f)) * Dt;
            if (Frame > 240 && W == 2 && Surface[W] > 523.15f)
                Ignited[W] = true;
            Telemetry.Wheels[W].Thermal.Surface = Surface[W];
            Telemetry.Wheels[W].Thermal.Ignited = Ignited[W];
            Telemetry.Wheels[W].Thermal.CombustionPower = Ignited[W] ? 6000.0f : 0.0f;
        }
        Editor.AdvanceFrame(Dt, Telemetry, Telemetry.Position, Normalize({ 0.4f, 0.25f, 0.87f }));
    }
    const SmokeSequence& Smoke = Editor.QuerySmoke();
    std::printf("after 6 s: resident=%d sources=%d steps=%d fireLight=%.3f\n", Smoke.Resident ? 1 : 0,
                Smoke.Metrics.Sources, Smoke.Metrics.Ticks, Smoke.FireLight.Intensity);
    if (!Smoke.Resident || Smoke.Metrics.Sources == 0)
    {
        std::printf("FluidSmokeProof: plume did not come resident — FAILED\n");
        return 1;
    }

    // 📝 March from an orbit camera and composite over the background.
    MarchCamera Camera;
    const float Yaw = 38.0f * Pi / 180.0f, Pitch = 14.0f * Pi / 180.0f, Distance = 15.5f;
    Camera.Position = { 0.0f + Distance * std::cos(Pitch) * std::cos(Yaw), 0.0f + Distance * std::cos(Pitch) * std::sin(Yaw),
                        0.55f + Distance * std::sin(Pitch) };
    Camera.Forward = Normalize({ -Camera.Position[0], -Camera.Position[1], 0.55f - Camera.Position[2] });
    Camera.Right = Normalize(Cross(Camera.Forward, { 0, 0, 1 }));
    Camera.Up = Cross(Camera.Right, Camera.Forward);
    Camera.TanHalfFov = 0.52f;
    Camera.Aspect = static_cast<float>(Width) / static_cast<float>(Height);
    MarchEnvironment Env;
    Env.SunDirection = Normalize({ 0.4f, 0.25f, 0.87f });
    const PlumeMarchResult March = MarchPlume(Smoke, Camera, Env, &Field, Width, Height, 7);

    const std::vector<std::array<float, 3>> Bg = Background();
    std::vector<uint8_t> Rgb(static_cast<size_t>(Width) * Height * 3);
    int Lit = 0;
    for (int Y = 0; Y < Height; ++Y)
        for (int X = 0; X < Width; ++X)
        {
            const Vec4 P = March.Pixels[static_cast<size_t>(Y) * Width + X];
            if (P.X + P.Y + P.Z > 1.0e-3f || P.W < 0.999f)
                ++Lit;
            const std::array<float, 3>& B = Bg[static_cast<size_t>(Y) * Width + X];
            for (int C = 0; C < 3; ++C)
            {
                const float Plume = C == 0 ? P.X : C == 1 ? P.Y : P.Z;
                const float Linear = P.W * B[C] + Plume;
                const float Tonemapped = 1.0f - std::exp(-Linear * 1.6f);
                Rgb[(static_cast<size_t>(Y) * Width + X) * 3 + C] =
                    static_cast<uint8_t>(std::clamp(std::pow(Tonemapped, 1.0f / 2.2f), 0.0f, 1.0f) * 255.0f);
            }
        }
    std::printf("plume covers %d/%d pixels\n", Lit, Width * Height);
    if (Lit == 0)
    {
        std::printf("FluidSmokeProof: march lit nothing — FAILED\n");
        return 1;
    }

    FILE* F = std::fopen(OutPpm.c_str(), "wb");
    if (!F)
    {
        std::printf("FluidSmokeProof: cannot write %s\n", OutPpm.c_str());
        return 1;
    }
    std::fprintf(F, "P6\n%d %d\n255\n", Width, Height);
    std::fwrite(Rgb.data(), 1, Rgb.size(), F);
    std::fclose(F);
    std::printf("wrote %s\n", OutPpm.c_str());

    const std::string Png = OutPpm.substr(0, OutPpm.find_last_of('.')) + ".png";
    const std::string Cmd = "convert \"" + OutPpm + "\" \"" + Png + "\"";
    if (std::system(Cmd.c_str()) == 0)
        std::printf("wrote %s\n", Png.c_str());
    std::printf("FluidSmokeProof: ok\n");
    return 0;
}
