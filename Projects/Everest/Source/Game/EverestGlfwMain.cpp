/*==========================================================================================================================================
                                                            EVERESTGLFWMAIN.CPP
==========================================================================================================================================*/
// 🧩 GLFW interactive Project Everest front-end: the policy selects Lobby navigation-only input or full
//    vehicle driving, while the camera consumes the same packet's mouse deltas and camera-cycle action.
//
//      EverestWindow [--archive DIR]

#include "Frontier/Engine/Input/InputEncoder.h"
#include "Frontier/Engine/Session/LobbySession.h"
#include "Frontier/Game/CameraController.h"
#include "Frontier/Game/SoftwarePresentation.h"
#include "Experimental/FluidSmokeEditor/Source/FluidSmokeEditor.h"
#include "Experimental/FluidSmokeEditor/Source/PlumeMarch.h"
#include "Projects/Everest/Source/Navigation/NavigationApp.h"
#include "Projects/Everest/Source/Session/SessionPolicy.h"

#include <GLFW/glfw3.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace
{

void DrawRect(float X, float Y, float Width, float Height, float R, float G, float B, float A)
{
    glColor4f(R, G, B, A);
    glBegin(GL_QUADS);
    glVertex2f(X, Y); glVertex2f(X + Width, Y); glVertex2f(X + Width, Y + Height); glVertex2f(X, Y + Height);
    glEnd();
}

void Present(GLFWwindow* Window, GLuint Texture, const Frontier::PresentationFrame& Frame,
             bool MenuVisible, size_t SelectedDestination, const Everest::NavigationApp& Navigation,
             const Frontier::LobbySession& Game)
{
    int Width = 0, Height = 0;
    glfwGetFramebufferSize(Window, &Width, &Height);
    if (Width <= 0 || Height <= 0)
        return;
    glViewport(0, 0, Width, Height);
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_BLEND);
    glClearColor(0.04f, 0.05f, 0.07f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);

    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glOrtho(0.0, 1.0, 1.0, 0.0, -1.0, 1.0);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glEnable(GL_TEXTURE_2D);
    glBindTexture(GL_TEXTURE_2D, Texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, Frame.Width, Frame.Height, 0, GL_RGB, GL_UNSIGNED_BYTE, Frame.Rgb.data());
    glColor4f(1, 1, 1, 1);
    glBegin(GL_QUADS);
    glTexCoord2f(0, 0); glVertex2f(0, 0);
    glTexCoord2f(1, 0); glVertex2f(1, 0);
    glTexCoord2f(1, 1); glVertex2f(1, 1);
    glTexCoord2f(0, 1); glVertex2f(0, 1);
    glEnd();
    glDisable(GL_TEXTURE_2D);

    if (MenuVisible)
    {
        // 📝 A legible, font-free menu marker; exact labels and controls are also shown in the window title.
        glEnable(GL_BLEND);
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        DrawRect(0.025f, 0.035f, 0.30f, 0.20f, 0.02f, 0.04f, 0.06f, 0.86f);
        const auto& Destinations = Navigation.QueryDestinations();
        for (size_t Index = 0; Index < Destinations.size(); ++Index)
        {
            const bool Current = Navigation.IsCurrent(Game, Destinations[Index]);
            const bool Selected = Index == SelectedDestination;
            const float Y = 0.075f + static_cast<float>(Index) * 0.075f;
            DrawRect(0.045f, Y, 0.26f, 0.055f,
                     Current ? 0.05f : (Selected ? 0.12f : 0.18f),
                     Current ? 0.48f : (Selected ? 0.42f : 0.20f),
                     Current ? 0.38f : (Selected ? 0.72f : 0.24f), 0.95f);
        }
        glDisable(GL_BLEND);
    }
    glfwSwapBuffers(Window);
}

std::string ResolveControlsTitle(const std::string& Level, const Frontier::InputRoutingPolicy& Policy,
                                 bool MenuVisible, const std::vector<Everest::NavigationDestination>& Destinations,
                                 size_t Selection)
{
    std::string Title = "Project Everest | " + Level + " | " + std::string(Policy.ControlsHint);
    if (MenuVisible)
    {
        Title += " | routes:";
        for (size_t Index = 0; Index < Destinations.size(); ++Index)
            Title += " " + std::to_string(Index + 1) + ") " + Destinations[Index].Label;
        if (Selection < Destinations.size())
            Title += " | selected: " + Destinations[Selection].Label + " (Up/Down, Enter, Esc)";
    }
    return Title;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 FLUID / SMOKE EDITOR (1:1 C++ port of the exhibit)
//------------------------------------------------------------------------------------------------------------------------

// 📝 Vehicle telemetry for the plume sources: pose, velocity and four wheels with a sliding-power and tread
//    heat model, so driving with the handbrake or steering hard at speed smokes the tyres and a sustained slide
//    ignites them — the smoke and fire interaction with the SDF world.
struct TyreThermalState
{
    float SurfaceKelvin = 300.0f;
    bool  Ignited = false;
    float IgnitionSeconds = 0.0f;
};

FluidSmoke::PlumeTelemetry BuildPlumeTelemetry(const Frontier::DeployableUnit& Unit, const std::array<float, 3>& PriorPosition,
                                               float StepSeconds, const Frontier::InputPacket& Packet,
                                               std::array<TyreThermalState, 4>& Thermal)
{
    using namespace FluidSmoke;
    const std::array<float, 3>& P = Unit.QueryPositionMetres();
    const float Yaw = Unit.QueryYawDegrees() * Pi / 180.0f;
    const Quat Orientation = ConstructAxisQuaternion({ 0, 0, 1 }, Yaw);
    Vec3 Velocity = { 0, 0, 0 };
    if (StepSeconds > 0.0f)
        for (int A = 0; A < 3; ++A)
            Velocity[A] = (P[A] - PriorPosition[A]) / StepSeconds;
    const float Speed = Unit.QueryForwardSpeedMps();

    PlumeTelemetry Telemetry;
    Telemetry.Position = { P[0], P[1], P[2] };
    Telemetry.Velocity = Velocity;
    Telemetry.Exhausts = { { { P[0] - 1.8f, P[1] + 0.25f, P[2] + 0.35f }, { -1, 0, 0 } },
                           { { P[0] - 1.8f, P[1] - 0.25f, P[2] + 0.35f }, { -1, 0, 0 } } };
    Telemetry.AfterfireSeconds = Packet.HasAction(Frontier::InputActionBoost) ? 1.0f : 0.0f;

    const Vec3 Forward = RotateVector(Orientation, { 1, 0, 0 });
    const Vec3 Lateral = RotateVector(Orientation, { 0, 1, 0 });
    const float WheelBase[4][2] = { { 1.25f, 0.78f }, { 1.25f, -0.78f }, { -1.25f, 0.78f }, { -1.25f, -0.78f } };
    for (int W = 0; W < 4; ++W)
    {
        WheelTelemetry Wheel;
        Wheel.Radius = 0.33f;
        Wheel.HubPosition = { P[0] + Forward[0] * WheelBase[W][0] + Lateral[0] * WheelBase[W][1],
                              P[1] + Forward[1] * WheelBase[W][0] + Lateral[1] * WheelBase[W][1],
                              P[2] + Wheel.Radius };
        Wheel.ContactPoint = { Wheel.HubPosition[0], Wheel.HubPosition[1], P[2] + 0.02f };
        Wheel.ContactVelocity = Velocity;
        Wheel.SurfaceSpeed = Speed;
        Wheel.Steer = W < 2 ? Packet.SteerAxis * 0.5f : 0.0f;
        Wheel.ContactFraction = 1.0f;
        // 📝 sliding work: handbrake locks the rears, steering at speed scrubs the fronts
        const float Slip = Speed * (W >= 2 ? Packet.HandbrakeAxis : std::abs(Packet.SteerAxis) * 0.8f);
        Wheel.SlipSpeed = Slip;
        Wheel.SlidingPower = 900.0f * Slip * Slip;
        TyreThermalState& Heat = Thermal[W];
        Heat.SurfaceKelvin += (Wheel.SlidingPower * 0.15f - 6.0f * (Heat.SurfaceKelvin - 300.0f)) * StepSeconds;
        if (Heat.SurfaceKelvin > 523.15f)
        {
            Heat.IgnitionSeconds += StepSeconds;
            if (Heat.IgnitionSeconds > 4.0f)
                Heat.Ignited = true;
        }
        else
            Heat.IgnitionSeconds = std::max(0.0f, Heat.IgnitionSeconds - StepSeconds);
        Wheel.Thermal.Surface = Heat.SurfaceKelvin;
        Wheel.Thermal.Ignited = Heat.Ignited;
        Wheel.Thermal.CombustionPower = Heat.Ignited ? 6000.0f : 0.0f;
        Telemetry.Wheels.push_back(Wheel);
    }
    return Telemetry;
}

// 📝 The ControlVehicle as a dynamic occupant of the SDF world: the plume's obstruction samples it and its motion
//    parts the smoke.
void UpdateSdfOccupant(FluidSmoke::SceneDistanceField& Field, const Frontier::DeployableUnit& Unit,
                       const std::array<float, 3>& PriorPosition, float PriorYawDegrees)
{
    using namespace FluidSmoke;
    const std::array<float, 3>& P = Unit.QueryPositionMetres();
    const float Yaw = Unit.QueryYawDegrees() * Pi / 180.0f;
    OccupantRecord Vehicle;
    Vehicle.Roles = RoleDynamic;
    Vehicle.Orientation = ConstructAxisQuaternion({ 0, 0, 1 }, Yaw);
    Vehicle.Position = { P[0], P[1], P[2] + 0.35f };
    Vehicle.HalfExtents = { 1.95f, 0.95f, 0.38f };
    Vehicle.PreviousOrientation = ConstructAxisQuaternion({ 0, 0, 1 }, PriorYawDegrees * Pi / 180.0f);
    Vehicle.PreviousPosition = { PriorPosition[0], PriorPosition[1], PriorPosition[2] + 0.35f };
    Field.AssignOccupants({ Vehicle });
}

// 📝 Marches the plume lattice and composites it over the software frame (premultiplied radiance over the
//    background by its transmittance), at half resolution and bilinearly upsampled.
void CompositePlumeOverFrame(Frontier::PresentationFrame& Frame, const FluidSmoke::SmokeSequence& Smoke,
                             const FluidSmoke::SceneDistanceField& Field, const Frontier::PresentationCamera& View)
{
    using namespace FluidSmoke;
    if (!Smoke.Resident)
        return;
    const int TraceW = std::max(1, Frame.Width / 2), TraceH = std::max(1, Frame.Height / 2);
    const float Yaw = View.YawDegrees * Pi / 180.0f, Pitch = View.PitchDegrees * Pi / 180.0f;
    MarchCamera Camera;
    Camera.Position = { View.FocusMetres[0] + View.DistanceMetres * std::cos(Pitch) * std::cos(Yaw),
                        View.FocusMetres[1] + View.DistanceMetres * std::cos(Pitch) * std::sin(Yaw),
                        View.FocusMetres[2] + View.DistanceMetres * std::sin(Pitch) };
    const FluidSmoke::Vec3 ToFocus = { View.FocusMetres[0] - Camera.Position[0], View.FocusMetres[1] - Camera.Position[1],
                                       View.FocusMetres[2] - Camera.Position[2] };
    Camera.Forward = FluidSmoke::Normalize(ToFocus);
    Camera.Right = FluidSmoke::Normalize(FluidSmoke::Cross(Camera.Forward, { 0, 0, 1 }));
    Camera.Up = FluidSmoke::Cross(Camera.Right, Camera.Forward);
    Camera.TanHalfFov = 0.52f;
    Camera.Aspect = static_cast<float>(Frame.Width) / static_cast<float>(Frame.Height);
    MarchEnvironment Env;
    Env.SunDirection = FluidSmoke::Normalize({ 0.4f, 0.25f, 0.87f });
    const PlumeMarchResult March = MarchPlume(Smoke, Camera, Env, &Field, TraceW, TraceH, static_cast<uint32_t>(Smoke.StepsTaken));
    auto SampleMarch = [&](float Fx, float Fy) -> Vec4
    {
        const int X = std::clamp(static_cast<int>(Fx), 0, TraceW - 1), Y = std::clamp(static_cast<int>(Fy), 0, TraceH - 1);
        return March.Pixels[static_cast<size_t>(Y) * TraceW + X];
    };
    for (int Y = 0; Y < Frame.Height; ++Y)
        for (int X = 0; X < Frame.Width; ++X)
        {
            const Vec4 P = SampleMarch(static_cast<float>(X) / Frame.Width * TraceW, static_cast<float>(Y) / Frame.Height * TraceH);
            if (P.W >= 0.999f && P.X == 0.0f && P.Y == 0.0f && P.Z == 0.0f)
                continue;
            uint8_t* Px = &Frame.Rgb[(static_cast<size_t>(Y) * Frame.Width + X) * 3];
            for (int C = 0; C < 3; ++C)
            {
                const float Bg = static_cast<float>(Px[C]) / 255.0f;
                const float Linear = P.W * Bg + (C == 0 ? P.X : C == 1 ? P.Y : P.Z);
                const float Tonemapped = 1.0f - std::exp(-Linear * 1.6f);
                Px[C] = static_cast<uint8_t>(std::clamp(std::pow(Tonemapped, 1.0f / 2.2f), 0.0f, 1.0f) * 255.0f);
            }
        }
}

// 📝 The editor chrome, drawn font-free like the navigation menu: outliner column, inspector column with the
//    gas sliders (selected row highlighted), status along the bottom. Exact labels are in the window title.
void DrawEditorOverlay(GLFWwindow* Window, const FluidSmoke::FluidSmokeEditor& Editor)
{
    int Width = 0, Height = 0;
    glfwGetFramebufferSize(Window, &Width, &Height);
    if (Width <= 0 || Height <= 0)
        return;
    const float W = static_cast<float>(Width), H = static_cast<float>(Height);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glOrtho(0.0, 1.0, 1.0, 0.0, -1.0, 1.0);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    // outliner column
    DrawRect(0.0f, 0.0f, 0.17f, 1.0f, 0.03f, 0.045f, 0.06f, 0.82f);
    const auto& Entities = Editor.QueryEntities();
    for (size_t Index = 0; Index < Entities.size() && Index < 18; ++Index)
    {
        const bool Gas = Entities[Index].IsGas;
        DrawRect(0.008f, 0.03f + static_cast<float>(Index) * 0.052f, 0.154f, 0.044f,
                 Gas ? 0.30f : 0.10f, Gas ? 0.22f : 0.14f, Gas ? 0.10f : 0.18f, 0.9f);
    }
    // inspector column with the gas sections' sliders
    DrawRect(0.83f, 0.0f, 0.17f, 1.0f, 0.03f, 0.045f, 0.06f, 0.82f);
    const std::vector<FluidSmoke::GasSection> Sections = Editor.QueryGasSections();
    int Row = 0;
    const int Selected = Editor.QuerySelectedRow();
    for (const auto& Section : Sections)
    {
        DrawRect(0.838f, 0.03f + static_cast<float>(Row) * 0.030f, 0.154f, 0.026f, 0.16f, 0.13f, 0.10f, 0.9f);
        ++Row;
        for (FluidSmoke::GasParameter Key : Section.Sliders)
        {
            const FluidSmoke::SliderDescriptor D = Editor.QuerySlider(Key);
            const bool Sel = Row == Selected;
            DrawRect(0.838f, 0.03f + static_cast<float>(Row) * 0.030f, 0.154f, 0.026f,
                     Sel ? 0.36f : 0.12f, Sel ? 0.26f : 0.15f, Sel ? 0.12f : 0.20f, 0.95f);
            const float T = (D.Value - D.Minimum) / std::max(D.Maximum - D.Minimum, 1.0e-6f);
            DrawRect(0.842f, 0.03f + static_cast<float>(Row) * 0.030f + 0.020f, 0.146f * std::clamp(T, 0.0f, 1.0f), 0.005f,
                     0.85f, 0.55f, 0.25f, 0.9f);
            ++Row;
        }
    }
    glDisable(GL_BLEND);
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    using namespace Frontier;
    SessionConfiguration Configuration{};
    std::string ArchiveDirectory = "Experimental/VehicleHmiPrototype/Archive";
    for (int Index = 1; Index < ArgumentCount; ++Index)
        if (std::strcmp(Arguments[Index], "--archive") == 0 && Index + 1 < ArgumentCount)
            ArchiveDirectory = Arguments[++Index];

    const FacetArchiveData Body = LoadFacetArchive(ArchiveDirectory + "/ControlVehicleBody.facet");
    const FacetArchiveData Tyre = LoadFacetArchive(ArchiveDirectory + "/ControlVehicleTyre.facet");
    const FacetArchiveData Rim = LoadFacetArchive(ArchiveDirectory + "/ControlVehicleRim.facet");
    if (!Body.IsValid() || !Tyre.IsValid() || !Rim.IsValid())
    {
        std::fprintf(stderr, "EverestWindow: vehicle facet archives not found or invalid under %s\n", ArchiveDirectory.c_str());
        return 1;
    }

    if (!glfwInit())
    {
        std::fprintf(stderr, "EverestWindow: GLFW initialization failed\n");
        return 1;
    }
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 2);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 1);
    glfwWindowHint(GLFW_RESIZABLE, GLFW_TRUE);
    GLFWwindow* Window = glfwCreateWindow(1000, 650, "Project Everest", nullptr, nullptr);
    if (!Window)
    {
        std::fprintf(stderr, "EverestWindow: could not create a GLFW/OpenGL window\n");
        glfwTerminate();
        return 1;
    }
    glfwMakeContextCurrent(Window);
    glfwSwapInterval(1);
    glfwSetInputMode(Window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);

    LobbySession Game(Configuration, Everest::ConstructEverestSessionPolicy);
    Everest::NavigationApp Navigation(Configuration);
    InputEncoder Encoder;
    CameraController Camera;
    FluidSmoke::FluidSmokeEditor Editor;   // the 1:1 C++ port of the exhibit's fluid/smoke editor (keys 1/2/3)
    std::array<TyreThermalState, 4> TyreThermal{};
    std::array<float, 3> PriorUnitPosition{ 0.0f, 0.0f, 0.53f };
    float PriorUnitYaw = 0.0f;
    GLuint Texture = 0;
    glGenTextures(1, &Texture);
    bool MenuVisible = true;
    size_t SelectedDestination = 1;   // default Lobby selection is the next route: Proving Grounds
    std::string LastLevel = Game.QueryCurrentLevelPath();
    double PreviousTime = glfwGetTime();
    static const InputRoutingPolicy FallbackRouting{};
    std::vector<PresentationVehicle> Vehicles(1);
    Vehicles[0].Body = &Body;
    Vehicles[0].Tyre = &Tyre;
    Vehicles[0].Rim = &Rim;

    while (!glfwWindowShouldClose(Window))
    {
        glfwPollEvents();
        const double Now = glfwGetTime();
        const float Step = std::clamp(static_cast<float>(Now - PreviousTime), 1.0f / 240.0f, 1.0f / 20.0f);
        PreviousTime = Now;

        const SessionPolicy* Policy = Game.QuerySession().QueryPolicy();
        const InputRoutingPolicy& Routing = Policy ? Policy->QueryInputRoutingPolicy() : FallbackRouting;
        const InputControlMode Mode = Routing.AllowDriving && !MenuVisible
                                    ? InputControlMode::Driving : InputControlMode::Navigation;
        InputPacket Packet = Encoder.SampleGlfwWindow(Window, Step, Mode);
        Packet = Routing.Route(Packet);
        if (!Encoder.WasActionPressed(InputActionResetUnit))
            Packet.ActionBits &= ~static_cast<uint32_t>(InputActionResetUnit);

        if (Routing.AllowLevelNavigation && Mode == InputControlMode::Driving
            && Encoder.WasActionPressed(InputActionMenu))
        {
            MenuVisible = true;
            SelectedDestination = Game.QueryCurrentLevelPath() == Configuration.LobbyLevelPath ? 1 : 0;
        }
        if (MenuVisible)
        {
            if (Encoder.WasActionPressed(InputActionNavigatePrev))
                SelectedDestination = (SelectedDestination + Navigation.QueryDestinations().size() - 1)
                                    % Navigation.QueryDestinations().size();
            if (Encoder.WasActionPressed(InputActionNavigateNext))
                SelectedDestination = (SelectedDestination + 1) % Navigation.QueryDestinations().size();
            if (Encoder.WasActionPressed(InputActionConfirm)
                && Navigation.Navigate(Game, SelectedDestination + 1))
                MenuVisible = !Game.QuerySession().QueryPolicy()->QueryInputRoutingPolicy().AllowDriving;
            if (Encoder.WasActionPressed(InputActionBack) && Routing.AllowDriving)
                MenuVisible = false;
        }

        if (!Game.QuerySession().QueryPolicy()->QueryInputRoutingPolicy().AllowDriving)
            MenuVisible = true;   // the Lobby is always in Navigation control mode; never a driving level

        // 📝 1/2/3 open the fluid/smoke editor (smoke · fluid · plume); Esc closes it; Up/Down pick a gas
        //    slider and Left/Right step it — the ported Smoke & fire inspector.
        if (Encoder.WasActionPressed(InputActionEditorSmoke)) Editor.Open(FluidSmoke::FluidEditorMode::Smoke);
        if (Encoder.WasActionPressed(InputActionEditorFluid)) Editor.Open(FluidSmoke::FluidEditorMode::Fluid);
        if (Encoder.WasActionPressed(InputActionEditorPlume)) Editor.Open(FluidSmoke::FluidEditorMode::Plume);
        static bool PriorEditorKeys[4] = { false, false, false, false };
        const bool EditorKeys[4] = { Editor.IsOpen() && glfwGetKey(Window, GLFW_KEY_UP) == GLFW_PRESS,
                                      Editor.IsOpen() && glfwGetKey(Window, GLFW_KEY_DOWN) == GLFW_PRESS,
                                      Editor.IsOpen() && glfwGetKey(Window, GLFW_KEY_LEFT) == GLFW_PRESS,
                                      Editor.IsOpen() && glfwGetKey(Window, GLFW_KEY_RIGHT) == GLFW_PRESS };
        if (Editor.IsOpen())
        {
            if (Encoder.WasActionPressed(InputActionBack))
                Editor.Close();
            else
            {
                if (EditorKeys[0] && !PriorEditorKeys[0]) Editor.SelectPrevRow();
                if (EditorKeys[1] && !PriorEditorKeys[1]) Editor.SelectNextRow();
                if (EditorKeys[2] && !PriorEditorKeys[2]) Editor.AdjustSelectedRow(-1.0f);
                if (EditorKeys[3] && !PriorEditorKeys[3]) Editor.AdjustSelectedRow(1.0f);
            }
        }
        for (int K = 0; K < 4; ++K)
            PriorEditorKeys[K] = EditorKeys[K];
        Game.SubmitLocalInput(Packet);
        Game.Step(Step);
        const SessionPolicy* UpdatedPolicy = Game.QuerySession().QueryPolicy();
        const InputRoutingPolicy& UpdatedRouting = UpdatedPolicy->QueryInputRoutingPolicy();
        const std::string& Level = Game.QueryCurrentLevelPath();
        if (Level != LastLevel)
        {
            LastLevel = Level;
            MenuVisible = !UpdatedRouting.AllowDriving;
            SelectedDestination = Level == Configuration.LobbyLevelPath ? 1 : 0;
        }

        const DeployableUnit* Unit = Game.QueryLocalVehicle();
        InputPacket CameraPacket = Packet;
        if (!Encoder.WasActionPressed(InputActionCycleCamera))
            CameraPacket.ActionBits &= ~static_cast<uint32_t>(InputActionCycleCamera);
        Camera.Step(CameraPacket, UpdatedRouting, Unit);
        Vehicles[0].PositionMetres = Unit ? Unit->QueryPositionMetres() : std::array<float, 3>{ 0.0f, 0.0f, 0.53f };
        Vehicles[0].YawDegrees = Unit ? Unit->QueryYawDegrees() : 0.0f;
        const PresentationCamera View = Camera.Resolve(UpdatedRouting, Unit);
        PresentationFrame Image = UpdatedRouting.AllowDriving
            ? RenderProvingGroundsFrame(Vehicles, View, 960, 624)
            : RenderLobbyFrame(Vehicles, View, 960, 624);

        // 📝 The fluid/smoke editor running in the Proving Grounds SDF world: telemetry → sources → transport →
        //    march, composited over the frame, so the smoke and fire interact with the world and the car.
        if (Editor.IsOpen() && UpdatedRouting.AllowDriving && Unit)
        {
            const FluidSmoke::PlumeTelemetry Telemetry = BuildPlumeTelemetry(*Unit, PriorUnitPosition, Step, Packet, TyreThermal);
            UpdateSdfOccupant(Editor.AccessField(), *Unit, PriorUnitPosition, PriorUnitYaw);
            const std::array<float, 3>& Focus = Unit->QueryPositionMetres();
            Editor.AdvanceFrame(Step, Telemetry, { Focus[0], Focus[1], Focus[2] },
                                FluidSmoke::Normalize({ 0.4f, 0.25f, 0.87f }));
            CompositePlumeOverFrame(Image, Editor.QuerySmoke(), Editor.AccessField(), View);
        }
        if (Unit)
        {
            PriorUnitPosition = Unit->QueryPositionMetres();
            PriorUnitYaw = Unit->QueryYawDegrees();
        }

        const std::string LevelLabel = UpdatedRouting.AllowDriving ? "Proving Grounds" : "Lobby";
        std::string Title = ResolveControlsTitle(LevelLabel, UpdatedRouting, MenuVisible,
                                                 Navigation.QueryDestinations(), SelectedDestination);
        if (Editor.IsOpen())
        {
            for (const std::string& Line : Editor.QueryStatusLines())
                Title += " | " + Line;
        }
        glfwSetWindowTitle(Window, Title.c_str());
        Present(Window, Texture, Image, MenuVisible, SelectedDestination, Navigation, Game);
        if (Editor.IsOpen())
            DrawEditorOverlay(Window, Editor);
    }

    glDeleteTextures(1, &Texture);
    glfwDestroyWindow(Window);
    glfwTerminate();
    return 0;
}
