/*==========================================================================================================================================
                                                            EVERESTGLFWMAIN.CPP
==========================================================================================================================================*/
// 🧩 GLFW interactive Project Everest front-end: the policy selects Lobby navigation-only input or full
//    vehicle driving, while the camera consumes the same packet's mouse deltas and camera-cycle action.
//
//      EverestWindow [--archive DIR]

#include "Frontier/Engine/Input/InputEncoder.h"
#include "Frontier/Engine/Interface/FluidPlumeEditor.h"
#include "Frontier/Engine/Session/LobbySession.h"
#include "Frontier/Game/CameraController.h"
#include "Frontier/Game/SoftwarePresentation.h"
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
    GLuint Texture = 0;
    glGenTextures(1, &Texture);
    bool MenuVisible = true;
    bool EditorVisible = false;
    bool GasKeyWasDown = false;
    bool FireKeyWasDown = false;
    bool MouseWasDown = false;
    FluidPlumeEditor GasEditor;
    GasEditor.Select("gas");
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

        const bool GasDown = glfwGetKey(Window, GLFW_KEY_G) == GLFW_PRESS;
        if (GasDown && !GasKeyWasDown)
        {
            EditorVisible = !EditorVisible;
            glfwSetInputMode(Window, GLFW_CURSOR, EditorVisible ? GLFW_CURSOR_NORMAL : GLFW_CURSOR_DISABLED);
            if (EditorVisible)
                GasEditor.SelectByQuery("smoke");
        }
        GasKeyWasDown = GasDown;
        const bool FireDown = glfwGetKey(Window, GLFW_KEY_F) == GLFW_PRESS;
        if (EditorVisible && FireDown && !FireKeyWasDown)
            GasEditor.AssignTestPlume((GasEditor.Settings.TestPlume + 1) % 3);
        FireKeyWasDown = FireDown;

        if (EditorVisible)
        {
            int FrameW = 0, FrameH = 0;
            glfwGetFramebufferSize(Window, &FrameW, &FrameH);
            double MouseX = 0.0, MouseY = 0.0;
            glfwGetCursorPos(Window, &MouseX, &MouseY);
            const bool MouseDown = glfwGetMouseButton(Window, GLFW_MOUSE_BUTTON_LEFT) == GLFW_PRESS;
            if (MouseDown && !MouseWasDown && FrameW > 0)
            {
                const int HitX = static_cast<int>(MouseX * 1280.0 / std::max(1, FrameW));
                const int HitY = static_cast<int>(MouseY * 720.0 / std::max(1, FrameH));
                GasEditor.Hit(HitX, HitY);
            }
            MouseWasDown = MouseDown;
            const PlumeVec3 Position = { Vehicles[0].PositionMetres[0], Vehicles[0].PositionMetres[1], Vehicles[0].PositionMetres[2] };
            const float Yaw = Vehicles[0].YawDegrees * 3.14159265f / 180.0f;
            GasEditor.Advance(Step, Position, { std::cos(Yaw), std::sin(Yaw), 0.0f });
        }

        PresentationFrame Image = EditorVisible
            ? GasEditor.Raster(1280, 720)
            : (UpdatedRouting.AllowDriving
                ? RenderProvingGroundsFrame(Vehicles, View, 960, 624)
                : RenderLobbyFrame(Vehicles, View, 960, 624));

        const std::string LevelLabel = UpdatedRouting.AllowDriving ? "Proving Grounds" : "Lobby";
        std::string Title = ResolveControlsTitle(LevelLabel, UpdatedRouting, MenuVisible,
                                                 Navigation.QueryDestinations(), SelectedDestination);
        if (EditorVisible)
            Title += " | Smoke & fire editor (G close, click outliner, F test plume)";
        glfwSetWindowTitle(Window, Title.c_str());
        Present(Window, Texture, Image, MenuVisible && !EditorVisible, SelectedDestination, Navigation, Game);
    }

    glDeleteTextures(1, &Texture);
    glfwDestroyWindow(Window);
    glfwTerminate();
    return 0;
}
