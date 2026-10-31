/*==========================================================================================================================================
                                            LENS FLARE INSPECTOR PANEL
==========================================================================================================================================*/
// Source-mapped native implementation of VehicleHMI/NativeFlarePanel.js and LensOptics.css.

#include "Engine/Interface/GlobalInspectorPresentationContext.h"
#include "Engine/Interface/SceneDirectoryPanel.h"
#include "Engine/Scene/GlobalEnvironmentRecords.h"

#if defined(FRONTIER_WITH_INTERFACE_SDK)
#include <imgui.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace Frontier
{
namespace
{
constexpr float FlarePi = 3.14159265358979323846f;
constexpr ImU32 FlareInk = IM_COL32(216, 211, 223, 255);
constexpr ImU32 FlareMuted = IM_COL32(161, 154, 168, 255);
constexpr ImU32 FlareAccent = IM_COL32(222, 206, 176, 255);

void FlareText(GlobalInspectorPresentationContext& Context, ImVec2 At, float Size, ImU32 Colour,
               const char* Text, ImFont* Font = nullptr)
{
    ImGui::GetWindowDrawList()->AddText(Font ? Font : Context.Faces.Regular, Size, At, Colour, Text);
}

void FlareCard(GlobalInspectorPresentationContext& Context, const char* Id, const char* Overline,
               const char* Title, float Height)
{
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::PushID(Id);
    ImGui::BeginChild("##flare_card", ImVec2(Width, Height), false,
                      ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
    ForwardGlobalInspectorCardWheelToParent();
    const ImVec2 Min = ImGui::GetWindowPos();
    const ImVec2 Max(Min.x + ImGui::GetWindowSize().x, Min.y + ImGui::GetWindowSize().y);
    ImGui::GetWindowDrawList()->AddRectFilledMultiColor(Min, Max, IM_COL32(40, 38, 44, 255), IM_COL32(30, 31, 36, 255),
                                                        IM_COL32(28, 29, 34, 255), IM_COL32(35, 34, 40, 255));
    ImGui::GetWindowDrawList()->AddRect(Min, Max, IM_COL32(197, 182, 210, 36), 18.0f);
    FlareText(Context, ImVec2(Min.x + 18.0f, Min.y + 15.0f), 8.0f, FlareMuted, Overline, Context.Faces.Medium);
    FlareText(Context, ImVec2(Min.x + 18.0f, Min.y + 34.0f), 16.0f, FlareInk, Title, Context.Faces.Light);
    ImGui::SetCursorScreenPos(ImVec2(Min.x + 18.0f, Min.y + 62.0f));
}

void FlareEndCard()
{
    ImGui::EndChild();
    ImGui::PopID();
    ImGui::Dummy(ImVec2(0.0f, 15.0f));
}

bool FlareSlider(GlobalInspectorPresentationContext& Context, const char* Label, double* Value,
                 double Minimum, double Maximum, const char* Format)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    const float NumberWidth = std::min(85.0f, Width * 0.29f);
    FlareText(Context, At, 8.5f, FlareMuted, Label);
    ImGui::PushStyleColor(ImGuiCol_FrameBg, IM_COL32(23, 22, 27, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, IM_COL32(38, 36, 43, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, IM_COL32(45, 42, 50, 255));
    ImGui::PushStyleColor(ImGuiCol_SliderGrab, FlareAccent);
    ImGui::PushStyleColor(ImGuiCol_SliderGrabActive, FlareAccent);
    ImGui::PushStyleColor(ImGuiCol_Text, FlareInk);
    ImGui::SetCursorScreenPos(ImVec2(At.x + Width - NumberWidth, At.y - 3.0f));
    ImGui::SetNextItemWidth(NumberWidth);
    char NumberId[128]{}; std::snprintf(NumberId, sizeof(NumberId), "##flare_value_%s", Label);
    bool Changed = ImGui::InputScalar(NumberId, ImGuiDataType_Double, Value, nullptr, nullptr, Format);
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("%s", Label);
    const double Min = Minimum, Max = Maximum;
    ImGui::SetCursorScreenPos(ImVec2(At.x, At.y + 22.0f));
    ImGui::SetNextItemWidth(Width);
    char TrackId[128]{}; std::snprintf(TrackId, sizeof(TrackId), "##flare_track_%s", Label);
    Changed = ImGui::SliderScalar(TrackId, ImGuiDataType_Double, Value, &Min, &Max, "") || Changed;
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("%s", Label);
    ImGui::PopStyleColor(6);
    *Value = std::clamp(*Value, Minimum, Maximum);
    ImGui::SetCursorScreenPos(ImVec2(At.x, At.y + 42.0f));
    ImGui::Dummy(ImVec2(Width, 11.0f));
    return Changed;
}

void FlareSelectStyleBegin()
{
    ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(216, 208, 223, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBg, IM_COL32(22, 22, 27, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, IM_COL32(33, 32, 38, 255));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, IM_COL32(45, 43, 51, 255));
    ImGui::PushStyleColor(ImGuiCol_Border, IM_COL32(197, 182, 210, 34));
    ImGui::PushStyleColor(ImGuiCol_PopupBg, IM_COL32(26, 27, 32, 255));
    ImGui::PushStyleColor(ImGuiCol_Header, IM_COL32(58, 53, 65, 255));
    ImGui::PushStyleColor(ImGuiCol_HeaderHovered, IM_COL32(71, 64, 79, 255));
    ImGui::PushStyleColor(ImGuiCol_HeaderActive, IM_COL32(82, 73, 90, 255));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 18.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(12.0f, 7.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
}

void FlareSelectStyleEnd()
{
    ImGui::PopStyleVar(3);
    ImGui::PopStyleColor(9);
}

void FlareNote(GlobalInspectorPresentationContext& Context, const char* Text, float Height = 64.0f)
{
    const ImVec2 At = ImGui::GetCursorScreenPos();
    const float Width = ImGui::GetContentRegionAvail().x;
    ImGui::Dummy(ImVec2(Width, Height));
    ImGui::GetWindowDrawList()->AddText(Context.Faces.Regular, 9.5f, At, FlareMuted, Text, nullptr, Width - 5.0f);
}

void FlarePlotFrame(const char* Id, float Height, ImVec2& Origin, float& Width)
{
    Width = ImGui::GetContentRegionAvail().x;
    Origin = ImGui::GetCursorScreenPos();
    ImGui::InvisibleButton(Id, ImVec2(Width, Height));
}

void FlareToggleTile(GlobalInspectorPresentationContext& Context, const char* Name, bool* Value, int32_t* Preset,
                     float X, float Y, float Width, const char* Id)
{
    ImGui::SetCursorScreenPos(ImVec2(X, Y));
    ImGui::PushID(Id);
    const bool Clicked = ImGui::InvisibleButton("##flare_tile", ImVec2(Width, 106.0f));
    const bool Hovered = ImGui::IsItemHovered();
    if (Clicked) { *Value = !*Value; *Preset = 4; }
    const ImU32 State = *Value ? IM_COL32(105, 200, 132, 255) : IM_COL32(204, 118, 115, 255);
    ImGui::GetWindowDrawList()->AddRectFilled(ImVec2(X, Y), ImVec2(X + Width, Y + 106.0f),
                                               Hovered ? IM_COL32(47, 48, 51, 255) : IM_COL32(32, 32, 32, 255), 16.0f);
    ImGui::GetWindowDrawList()->AddRect(ImVec2(X, Y), ImVec2(X + Width, Y + 106.0f),
                                         *Value ? IM_COL32(105, 200, 132, 78) : IM_COL32(204, 118, 115, 78), 16.0f);
    const float CX = X + Width * 0.5f;
    ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(CX, Y + 31.0f), 15.5f, State, 28);
    const float TextWidth = KitTextWidth(Context.Faces.Regular, 9.0f, Name);
    FlareText(Context, ImVec2(CX - TextWidth * 0.5f, Y + 60.0f), 9.0f, IM_COL32(200, 200, 200, 255), Name);
    const char* StateText = *Value ? "ON" : "OFF";
    const float StateWidth = KitTextWidth(Context.Faces.Regular, 8.0f, StateText);
    FlareText(Context, ImVec2(CX - StateWidth * 0.5f, Y + 83.0f), 8.0f, State, StateText);
    ImGui::PopID();
}

double FlareFract(double V) { return V - std::floor(V); }
double FlareSmooth(double A, double B, double X) { const double T=std::clamp((X-A)/(B-A),0.0,1.0); return T*T*(3.0-2.0*T); }
double FlareHue(double H, double S) { return std::clamp(std::abs(FlareFract(H+S)*6.0-3.0)-1.0,0.0,1.0); }
std::array<double,3> EvaluateFlareKernel(const LensFlareRecord& F,double U,double V)
{
    const double SU=F.PreviewSourceU,SV=F.PreviewSourceV;
    const double Edge=FlareSmooth(-.15,.05,SU)*(1-FlareSmooth(.95,1.15,SU))*FlareSmooth(-.15,.05,SV)*(1-FlareSmooth(.95,1.15,SV));
    const double Aspect=640.0/280.0,X=(U-.5)*Aspect,Y=V-.5,SX=(SU-.5)*Aspect,SY=SV-.5,DX=X-SX,DY=Y-SY;
    const double Spread=std::clamp(F.OpticalSpread,.25,2.0),D=std::hypot(DX,DY),A=F.StreakRotationDegrees*double(FlarePi)/180.0;
    const double RX=DX*std::cos(A)+DY*std::sin(A),RY=-DX*std::sin(A)+DY*std::cos(A),C=F.ChromaticSeparation;
    const double Cool=std::exp(-std::abs(DY)*95/Spread)*std::exp(-std::abs(DX)*2.2/Spread)*.55*(F.AnamorphicStreakEnabled?1:0)*F.StreakGain;
    const double Warm=std::exp(-std::abs(RY)*160/Spread)*std::exp(-std::abs(RX)*3/Spread)*.65*(F.WarmStreakEnabled?1:0)*F.StreakGain;
    const double Angle=D>1e-8?std::atan2(RY,RX):0;
    const int Pairs=int(std::floor(std::clamp(double(F.PresetIndex==4?F.CustomRayPairs:F.ApertureBlades),2.0,12.0)+.5));
    const double Burst=std::pow(std::abs(std::sin(Angle*Pairs)),32)*std::exp(-D*5/Spread)*.6*(F.StarburstEnabled?1:0);
    const double Core=(F.AnamorphicStreakEnabled||F.WarmStreakEnabled||F.StarburstEnabled)?std::exp(-D*80/Spread)*.8+std::exp(-D*9/Spread)*.035:0;
    std::array<double,3> RGB{Cool*(1-.55*C)+Warm+Burst+Core,Cool*(1-.35*C)+Warm*.8+Burst*.95+Core*.9,Cool+Warm*.55+Burst*.82+Core*.75};
    const int Count=int(std::floor(std::clamp(double(F.GhostCount),0.0,24.0)+.5));
    for(int I=0;I<Count;++I){
        const double K=1-(.6+double(I+1)/Count*(1.7+F.GhostSpacing)),GX=X-SX*K,GY=Y-SY*K; double GD=std::hypot(GX,GY);
        if(F.AperturePolygonSides>=3){const double Step=2*double(FlarePi)/F.AperturePolygonSides,T=GD>1e-8?std::atan2(GY,GX):0,Fold=T-Step*std::floor((T+Step*.5)/Step);GD*=std::cos(Fold)/std::cos(double(FlarePi)/F.AperturePolygonSides);}
        const double R=(.025+.06*FlareFract(I*.618+.31))*Spread,H=FlareFract(I*.23+.5);
        for(int J=0;J<3;++J){const double RR=R*(1+(J-1)*C*.035),Spectral=(FlareSmooth(RR,RR*.35,GD)*.6+std::exp(-std::abs(GD-RR)*350))*.14*F.GhostBrightness,Sector=J==0?0:J==1?.6666667:.3333333;RGB[size_t(J)]+=Spectral*(1+(FlareHue(H,Sector)-1)*C);}
    }
    const double HX=X-SX*.25,HY=Y-SY*.25,HD=std::hypot(HX,HY),Offset=std::abs(HD-F.HaloRadius),Halo=FlareSmooth(std::clamp(F.HaloWidth,.005,.2),0,Offset)*.09*F.HaloBrightness,H=FlareFract((HD>1e-8?std::atan2(HY,HX):0)/(2*double(FlarePi))+Offset*8);
    for(int J=0;J<3;++J){const double Sector=J==0?0:J==1?.6666667:.3333333;RGB[size_t(J)]=(RGB[size_t(J)]+Halo*(1+(FlareHue(H,Sector)-1)*C*.8))*F.GlobalIntensity*Edge;}
    return RGB;
}
ImU32 ToneMapFlarePixel(const std::array<double,3>& RGB)
{
    const auto C=[](double X){X=std::max(0.0,X);return uint8_t(std::clamp(std::pow(X/(1+X),1/2.2)*255.0,0.0,255.0));};
    return IM_COL32(C(RGB[0]),C(RGB[1]),C(RGB[2]),255);
}

void FlarePreview(GlobalInspectorPresentationContext& Context, LensFlareRecord& Flare)
{
    FlareCard(Context, "flare_preview", "01 / LIVE PROCEDURAL REFERENCE", "Optical composite", 530.0f);
    const float Width = ImGui::GetContentRegionAvail().x;
    ImVec2 Origin;
    const float PlotHeight=Width*(280.0f/640.0f);
    Origin=ImGui::GetCursorScreenPos(); ImGui::InvisibleButton("##flare_source_plot",ImVec2(Width,PlotHeight));
    const float SX=Width/640.0f,SY=PlotHeight/280.0f;
    ImDrawList* Draw=ImGui::GetWindowDrawList(); Draw->AddRectFilled(Origin,ImVec2(Origin.x+Width,Origin.y+PlotHeight),IM_COL32(8,8,8,255),14.0f);
    constexpr int32_t PreviewWidth=640,PreviewHeight=280;
    static std::array<double,18> LastSettings{}; static bool HasPixels=false;
    static std::array<ImU32,PreviewWidth*PreviewHeight> Pixels{};
    const std::array<double,18> Settings{Flare.PreviewSourceU,Flare.PreviewSourceV,Flare.GlobalIntensity,Flare.OpticalSpread,Flare.ChromaticSeparation,double(Flare.GhostCount),Flare.GhostBrightness,Flare.GhostSpacing,double(Flare.AperturePolygonSides),Flare.HaloRadius,Flare.HaloWidth,Flare.HaloBrightness,Flare.AnamorphicStreakEnabled?1.0:0.0,Flare.WarmStreakEnabled?1.0:0.0,Flare.StarburstEnabled?1.0:0.0,Flare.StreakGain,Flare.StreakRotationDegrees,double(Flare.PresetIndex==4?Flare.CustomRayPairs:Flare.ApertureBlades)};
    if(!HasPixels||Settings!=LastSettings){LastSettings=Settings;HasPixels=true;for(int32_t Y=0;Y<PreviewHeight;++Y)for(int32_t X=0;X<PreviewWidth;++X)Pixels[size_t(Y*PreviewWidth+X)]=ToneMapFlarePixel(EvaluateFlareKernel(Flare,(X+.5)/PreviewWidth,(Y+.5)/PreviewHeight));}
    for(int32_t Y=0;Y<PreviewHeight;++Y)for(int32_t X=0;X<PreviewWidth;++X){const ImVec2 A(Origin.x+Width*X/PreviewWidth,Origin.y+PlotHeight*Y/PreviewHeight),B(Origin.x+Width*(X+1)/PreviewWidth,Origin.y+PlotHeight*(Y+1)/PreviewHeight);Draw->AddRectFilled(A,B,Pixels[size_t(Y*PreviewWidth+X)]);}
    const float U=std::clamp(float((ImGui::GetIO().MousePos.x-Origin.x)/SX/640.0f),.06f,.94f),V=std::clamp(float((ImGui::GetIO().MousePos.y-Origin.y)/SY/280.0f),.08f,.92f);
    if (ImGui::IsItemActive()) { Flare.PreviewSourceU = U; Flare.PreviewSourceV = V; }
    if (ImGui::IsItemFocused())
    {
        if (ImGui::IsKeyPressed(ImGuiKey_Home)) Flare.ResetPreviewSource();
        if (ImGui::IsKeyPressed(ImGuiKey_LeftArrow)) Flare.PreviewSourceU = std::clamp(Flare.PreviewSourceU - 0.02, 0.06, 0.94);
        if (ImGui::IsKeyPressed(ImGuiKey_RightArrow)) Flare.PreviewSourceU = std::clamp(Flare.PreviewSourceU + 0.02, 0.06, 0.94);
        if (ImGui::IsKeyPressed(ImGuiKey_UpArrow)) Flare.PreviewSourceV = std::clamp(Flare.PreviewSourceV - 0.02, 0.08, 0.92);
        if (ImGui::IsKeyPressed(ImGuiKey_DownArrow)) Flare.PreviewSourceV = std::clamp(Flare.PreviewSourceV + 0.02, 0.08, 0.92);
    }
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Drag the flare source; arrow keys move the preview light");
    ImGui::Dummy(ImVec2(Width, PlotHeight + 10.0f));
    char Pose[64]{}; std::snprintf(Pose, sizeof(Pose), "SOURCE %.2f / %.2f", Flare.PreviewSourceU, Flare.PreviewSourceV);
    FlareText(Context, ImGui::GetCursorScreenPos(), 8.0f, FlareMuted, Pose, Context.Faces.Medium);
    ImGui::SameLine(ImGui::GetWindowWidth() - 150.0f);
    if (ImGui::SmallButton("Reset source")) Flare.ResetPreviewSource();
    FlareNote(Context, "Drag the source. Authoring preview stays visible when scene flare is disabled; scene flare follows the Sun, camera occlusion and cabin transmission. Display-mapped thumbnail · export retains linear HDR.", 62.0f);
    FlareEndCard();
}

void FlareCompose(GlobalInspectorPresentationContext& Context, LensFlareRecord& Flare)
{
    FlareCard(Context, "flare_compose", "02 / SOURCE & PRESET", "Light stack", 370.0f);
    const char* Names[] = {"Cinematic", "Anamorphic", "Starburst", "Halo", "Custom layers"};
    const ImVec2 PresetLabelAt = ImGui::GetCursorScreenPos();
    const float SelectWidth = ImGui::GetContentRegionAvail().x;
    FlareText(Context, PresetLabelAt, 9.0f, FlareMuted, "Optical preset");
    ImGui::SetCursorScreenPos(ImVec2(PresetLabelAt.x, PresetLabelAt.y + 17.0f));
    ImGui::SetNextItemWidth(SelectWidth);
    FlareSelectStyleBegin();
    if (ImGui::BeginCombo("##flare_preset", Names[std::clamp(Flare.PresetIndex, 0, 4)]))
    {
        for (int32_t I = 0; I < 5; ++I)
            if (ImGui::Selectable(Names[I], I == Flare.PresetIndex)) Flare.ApplyOpticalPreset(I);
        ImGui::EndCombo();
    }
    FlareSelectStyleEnd();
    ImGui::SetCursorScreenPos(ImVec2(PresetLabelAt.x, PresetLabelAt.y + 52.0f));
    ImGui::Dummy(ImVec2(SelectWidth, 8.0f));
    double Intensity = Flare.GlobalIntensity;
    if (FlareSlider(Context, "Intensity", &Intensity, 0.0, 5.0, "%.2f×")) Flare.GlobalIntensity = Intensity;
    double Spread = Flare.OpticalSpread;
    if (FlareSlider(Context, "Spread", &Spread, 0.25, 2.0, "%.2f×")) Flare.OpticalSpread = Spread;
    double Chromatic = Flare.ChromaticSeparation;
    if (FlareSlider(Context, "Chromatic separation", &Chromatic, 0.0, 1.0, "%.2f")) Flare.ChromaticSeparation = Chromatic;
    FlareNote(Context, "Presets retain their original renderer behaviour. Editing layer geometry or a layer switch selects Custom layers; global intensity, spread and chromatic separation do not.", 58.0f);
    FlareEndCard();
}

void FlareGhosts(GlobalInspectorPresentationContext& Context, LensFlareRecord& Flare)
{
    FlareCard(Context, "flare_ghosts", "03 / SENSOR-PLANE POSITIONS", "Internal reflections", 810.0f);
    ImVec2 Origin; float Width = 0.0f;
    const float Height = ImGui::GetContentRegionAvail().x * (300.0f / 640.0f);
    FlarePlotFrame("##flare_ghost_plot", Height, Origin, Width);
    const float SX = Width / 640.0f, SY = Height / 300.0f;
    const auto P = [&](float X, float Y) { return ImVec2(Origin.x + X * SX, Origin.y + Y * SY); };
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddRectFilled(Origin, ImVec2(Origin.x + Width, Origin.y + Height), IM_COL32(16, 19, 24, 255), 10.0f);
    Draw->AddLine(P(35, 145), P(605, 145), IM_COL32(186, 197, 218, 24), 1.0f);
    Draw->AddLine(P(320, 30), P(320, 260), IM_COL32(186, 197, 218, 24), 1.0f);
    const ImVec2 Source = P(float(Flare.PreviewSourceU * 640.0), float(Flare.PreviewSourceV * 300.0));
    Draw->AddLine(Source, P(320 - float(Flare.PreviewSourceU * 640.0 - 320.0) * 2.8f,
                            145 - float(Flare.PreviewSourceV * 300.0 - 145.0) * 2.8f), IM_COL32(184, 168, 206, 82), 1.0f);
    const auto Ghosts = Flare.EvaluateSensorGhostCentres();
    for (size_t I = 0; I < Ghosts.size(); ++I)
    {
        const float X = float(Ghosts[I].first * 640.0), Y = float(Ghosts[I].second * 300.0);
        if (X < 40 || X > 600 || Y < 36 || Y > 253) continue;
        const float Radius = 8.0f + float(I % 4) * 3.0f;
        if (Flare.AperturePolygonSides <= 2) Draw->AddCircle(P(X, Y), Radius * SX, IM_COL32(195, 175, 210, 180), 24, 1.4f);
        else
        {
            const int32_t Sides = std::clamp(Flare.AperturePolygonSides, 3, 12);
            std::array<ImVec2, 13> Poly{};
            for (int32_t J = 0; J <= Sides; ++J)
            {
                const float A = 2.0f * FlarePi * J / Sides;
                Poly[size_t(J)] = ImVec2(P(X, Y).x + std::cos(A) * Radius * SX, P(X, Y).y + std::sin(A) * Radius * SY);
            }
            Draw->AddPolyline(Poly.data(), Sides + 1, IM_COL32(195, 175, 210, 180), ImDrawFlags_None, 1.4f);
        }
    }
    Draw->AddCircleFilled(Source, 4.0f, FlareAccent, 24);
    Draw->AddCircle(P(320, 145), 4.0f, IM_COL32(193, 201, 215, 180), 24, 1.0f);
    FlareText(Context, ImVec2(Origin.x + 14.0f, Origin.y + Height - 17.0f), 8.0f, FlareMuted,
              "SOURCE → SENSOR CENTRE → REFLECTIONS");
    ImGui::Dummy(ImVec2(Width, Height + 8.0f));
    const ImVec2 ShapeLabelAt = ImGui::GetCursorScreenPos();
    const float ShapeWidth = ImGui::GetContentRegionAvail().x;
    FlareText(Context, ShapeLabelAt, 9.0f, FlareMuted, "Ghost shape");
    ImGui::SetCursorScreenPos(ImVec2(ShapeLabelAt.x, ShapeLabelAt.y + 17.0f));
    ImGui::SetNextItemWidth(ShapeWidth);
    FlareSelectStyleBegin();
    if (ImGui::BeginCombo("##flare_ghost_shape", Flare.AperturePolygonSides == 0 ? "Round" : Flare.AperturePolygonSides == 8 ? "Octagon" : "Hexagon"))
    {
        if (ImGui::Selectable("Round", Flare.AperturePolygonSides == 0)) { Flare.AperturePolygonSides = 0; Flare.PresetIndex = 4; }
        if (ImGui::Selectable("Hexagon", Flare.AperturePolygonSides == 6)) { Flare.AperturePolygonSides = 6; Flare.PresetIndex = 4; }
        if (ImGui::Selectable("Octagon", Flare.AperturePolygonSides == 8)) { Flare.AperturePolygonSides = 8; Flare.PresetIndex = 4; }
        ImGui::EndCombo();
    }
    FlareSelectStyleEnd();
    ImGui::SetCursorScreenPos(ImVec2(ShapeLabelAt.x, ShapeLabelAt.y + 52.0f));
    ImGui::Dummy(ImVec2(ShapeWidth, 8.0f));
    double Count = Flare.GhostCount;
    if (FlareSlider(Context, "Ghost count", &Count, 0.0, 24.0, "%.0f")) { Flare.GhostCount = int32_t(std::round(Count)); Flare.PresetIndex = 4; }
    double Brightness = Flare.GhostBrightness;
    if (FlareSlider(Context, "Ghost brightness", &Brightness, 0.0, 2.0, "%.2f×")) { Flare.GhostBrightness = Brightness; Flare.PresetIndex = 4; }
    double Spacing = Flare.GhostSpacing;
    if (FlareSlider(Context, "Ghost spacing", &Spacing, 0.0, 3.0, "%.2f×")) { Flare.GhostSpacing = Spacing; Flare.PresetIndex = 4; }
    FlareNote(Context, "Positions follow the actual kernel’s optical axis; outlines are a geometry guide, not radiance or exact ghost sizes. Off-sensor centres are omitted.", 54.0f);
    FlareEndCard();
}

void FlareHalo(GlobalInspectorPresentationContext& Context, LensFlareRecord& Flare)
{
    FlareCard(Context, "flare_halo", "04 / RADIAL CROSS-SECTION", "Annular response", 330.0f);
    ImVec2 Origin; float Width = 0.0f;
    const float Height = std::min(190.0f, std::max(150.0f, ImGui::GetContentRegionAvail().x * 0.34f));
    FlarePlotFrame("##flare_halo_plot", Height, Origin, Width);
    const float SX = Width / 640.0f, SY = Height / 280.0f;
    const ImVec2 Centre(Origin.x + 220.0f * SX, Origin.y + 130.0f * SY);
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddRectFilled(Origin, ImVec2(Origin.x + Width, Origin.y + Height), IM_COL32(20, 22, 25, 255), 10.0f);
    const float Scale = 95.0f / 0.6f * SX;
    const float Radius = float(Flare.HaloRadius) * Scale, Support = float(Flare.HaloWidth) * Scale;
    Draw->AddCircle(Centre, 105.0f * SX, IM_COL32(189, 190, 169, 30), 64, 1.0f);
    Draw->AddCircle(Centre, Radius, IM_COL32(229, 213, 171, 110), 64, 1.5f);
    Draw->AddCircle(Centre, std::max(0.0f, Radius - Support), IM_COL32(229, 213, 171, 36), 64, 1.0f);
    Draw->AddCircle(Centre, Radius + Support, IM_COL32(229, 213, 171, 36), 64, 1.0f);
    Draw->AddLine(Centre, ImVec2(Centre.x + Radius, Centre.y), IM_COL32(229, 213, 171, 155), 2.0f);
    Draw->AddCircleFilled(ImVec2(Centre.x + Radius, Centre.y), 5.0f, FlareAccent, 24);
    char Readout[64]{}; std::snprintf(Readout, sizeof(Readout), "%.2f", Flare.HaloRadius);
    FlareText(Context, ImVec2(Origin.x + 470.0f * SX, Origin.y + 80.0f * SY), 25.0f, FlareAccent, Readout, Context.Faces.Light);
    FlareText(Context, ImVec2(Origin.x + 470.0f * SX, Origin.y + 110.0f * SY), 8.0f, FlareMuted, "RADIUS / UV UNITS");
    std::snprintf(Readout, sizeof(Readout), "± %.3f", Flare.HaloWidth);
    FlareText(Context, ImVec2(Origin.x + 470.0f * SX, Origin.y + 155.0f * SY), 14.0f, FlareInk, Readout);
    FlareText(Context, ImVec2(Origin.x + 470.0f * SX, Origin.y + 177.0f * SY), 8.0f, FlareMuted, "RESPONSE SUPPORT");
    ImGui::Dummy(ImVec2(Width, Height + 8.0f));
    double RadiusValue = Flare.HaloRadius;
    if (FlareSlider(Context, "Halo radius", &RadiusValue, 0.01, 0.60, "%.2f")) { Flare.HaloRadius = RadiusValue; Flare.PresetIndex = 4; }
    double WidthValue = Flare.HaloWidth;
    if (FlareSlider(Context, "Halo width", &WidthValue, 0.005, 0.20, "%.3f")) { Flare.HaloWidth = WidthValue; Flare.PresetIndex = 4; }
    double Brightness = Flare.HaloBrightness;
    if (FlareSlider(Context, "Halo brightness", &Brightness, 0.0, 2.0, "%.2f×")) { Flare.HaloBrightness = Brightness; Flare.PresetIndex = 4; }
    FlareNote(Context, "Radius and ± width mark the smooth radial response support in aspect-corrected UV units. This enlarged guide is not a physical lens section; the composite above is the procedural result.", 64.0f);
    FlareEndCard();
}

void FlareRays(GlobalInspectorPresentationContext& Context, LensFlareRecord& Flare)
{
    FlareCard(Context, "flare_rays", "05 / LAYER MIXER", "Diffraction & streaks", 540.0f);
    const float Width = ImGui::GetContentRegionAvail().x, Gap = 8.0f, TileWidth = (Width - 2.0f * Gap) / 3.0f;
    const ImVec2 Start = ImGui::GetCursorScreenPos();
    FlareToggleTile(Context, "Anamorphic", &Flare.AnamorphicStreakEnabled, &Flare.PresetIndex, Start.x, Start.y, TileWidth, "anamorphic");
    FlareToggleTile(Context, "Warm streak", &Flare.WarmStreakEnabled, &Flare.PresetIndex, Start.x + TileWidth + Gap, Start.y, TileWidth, "warm_streak");
    FlareToggleTile(Context, "Starburst", &Flare.StarburstEnabled, &Flare.PresetIndex, Start.x + 2.0f * (TileWidth + Gap), Start.y, TileWidth, "starburst");
    ImGui::SetCursorScreenPos(ImVec2(Start.x, Start.y + 106.0f));
    ImGui::Dummy(ImVec2(Width, 20.0f));
    char Rays[80]{};
    std::snprintf(Rays, sizeof(Rays), "%d ray pairs · %s", Flare.QueryEffectiveRayPairs(),
                  Flare.PresetIndex == 4 ? "Custom ray control" : "Legacy aperture control");
    FlareText(Context, ImGui::GetCursorScreenPos(), 11.0f, FlareAccent, Rays);
    ImGui::Dummy(ImVec2(0.0f, 24.0f));
    double Rotation = Flare.StreakRotationDegrees;
    if (FlareSlider(Context, "Rotation", &Rotation, 0.0, 360.0, "%.0f°")) { Flare.StreakRotationDegrees = Rotation; Flare.PresetIndex = 4; }
    double RayPairs = Flare.CustomRayPairs;
    if (FlareSlider(Context, "Ray pairs", &RayPairs, 2.0, 12.0, "%.0f")) { Flare.CustomRayPairs = int32_t(std::round(RayPairs)); Flare.PresetIndex = 4; }
    double Gain = Flare.StreakGain;
    if (FlareSlider(Context, "Streak gain", &Gain, 0.0, 3.0, "%.2f×")) { Flare.StreakGain = Gain; Flare.PresetIndex = 4; }
    double Blades = Flare.ApertureBlades;
    if (FlareSlider(Context, "Aperture blades", &Blades, 2.0, 12.0, "%.0f")) Flare.ApertureBlades = int32_t(std::round(Blades));
    FlareNote(Context, "Preset starbursts use Aperture blades; Custom layers uses Ray pairs. Rotation turns the warm streak and burst, while the cool anamorphic streak stays horizontal, matching the renderer.", 65.0f);
    FlareEndCard();
}

} // namespace

void DrawLensFlareInspectorPanel(GlobalInspectorPresentationContext& Context)
{
    auto* Flare = static_cast<LensFlareRecord*>(Context.Descriptor->PayloadAddress);
    if (Flare == nullptr) return;
    const ImVec2 Window = ImGui::GetWindowPos(), Size = ImGui::GetWindowSize();
    ImGui::GetWindowDrawList()->AddRectFilled(Window, ImVec2(Window.x + Size.x, Window.y + Size.y), Context.Theme.PanelBg);

    const float HeaderY = Context.BodyTop + 2.0f - ImGui::GetScrollY();
    FlareText(Context, ImVec2(Context.Left + 2.0f, HeaderY), 8.5f, FlareMuted, "ENVIRONMENT / CAMERA OPTICS", Context.Faces.Medium);
    FlareText(Context, ImVec2(Context.Left + 2.0f, HeaderY + 18.0f), 30.0f, FlareInk, "Lens flare", Context.Faces.Light);
    FlareText(Context, ImVec2(Context.Left + 2.0f, HeaderY + 53.0f), 10.0f, FlareMuted,
              "Reflections, diffraction, and light across the sensor.");
    ImGui::SetCursorScreenPos(ImVec2(Context.Left + 2.0f, HeaderY + 78.0f));
    ImGui::PushStyleColor(ImGuiCol_Button, Flare->FlareEnabled ? IM_COL32(53, 66, 48, 255) : IM_COL32(39, 39, 43, 255));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(69, 79, 58, 255));
    ImGui::PushStyleColor(ImGuiCol_Text, FlareInk);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 22.0f);
    if (ImGui::Button(Flare->FlareEnabled ? "● Enabled" : "○ Disabled")) Flare->FlareEnabled = !Flare->FlareEnabled;
    if (ImGui::IsItemHovered()) ImGui::SetTooltip("Toggle lens flare");
    ImGui::PopStyleVar(); ImGui::PopStyleColor(3);
    ImGui::SameLine();
    if (ImGui::Button("Export HDR ↗")) ImGui::OpenPopup("##flare_export_info");
    if (ImGui::BeginPopup("##flare_export_info"))
    {
        ImGui::TextUnformatted("Linear HDR export is available from the source preview workflow.");
        ImGui::EndPopup();
    }

    ImGui::SetCursorScreenPos(ImVec2(Context.Left, HeaderY + 116.0f));
    ImGui::PushID(static_cast<int>(Context.Selected.Value & 0x7fffffffu));
    FlarePreview(Context, *Flare);
    const std::array<const char*, 4> Tabs{"Compose", "Ghosts", "Halo", "Rays & streaks"};
    ImGui::SetCursorScreenPos(ImVec2(Context.Left, ImGui::GetCursorScreenPos().y));
    ImGui::PushStyleColor(ImGuiCol_Tab, Context.Theme.LightSurface ? Context.Theme.Surface : IM_COL32(34, 34, 39, 255));
    ImGui::PushStyleColor(ImGuiCol_TabHovered, Context.Theme.LightSurface ? Context.Theme.Surface3 : IM_COL32(57, 51, 62, 255));
    ImGui::PushStyleColor(ImGuiCol_TabActive, Context.Theme.LightSurface ? Context.Theme.Surface2 : IM_COL32(61, 53, 66, 255));
    ImGui::PushStyleColor(ImGuiCol_Text, FlareInk);
    ImGui::PushStyleVar(ImGuiStyleVar_TabRounding, 8.0f);
    if (ImGui::BeginTabBar("##flare_sections", ImGuiTabBarFlags_FittingPolicyScroll))
    {
        for (int32_t Index = 0; Index < int32_t(Tabs.size()); ++Index)
        {
            const ImGuiTabItemFlags Flags = Flare->ActiveSectionIndex == Index ? ImGuiTabItemFlags_SetSelected : ImGuiTabItemFlags_None;
            if (!ImGui::BeginTabItem(Tabs[size_t(Index)], nullptr, Flags)) continue;
            if (ImGui::IsItemActivated()) Flare->ActiveSectionIndex = Index;
            ImGui::PushStyleColor(ImGuiCol_ChildBg, Context.Theme.PanelBg);
            ImGui::BeginChild("##flare_tab_content", ImVec2(0.0f, 0.0f), false, ImGuiWindowFlags_AlwaysVerticalScrollbar);
            ImGui::SetCursorPosX(10.0f); ImGui::SetCursorPosY(12.0f);
            switch (Index)
            {
                case 0: FlareCompose(Context, *Flare); break;
                case 1: FlareGhosts(Context, *Flare); break;
                case 2: FlareHalo(Context, *Flare); break;
                case 3: FlareRays(Context, *Flare); break;
                default: break;
            }
            ImGui::EndChild(); ImGui::PopStyleColor(); ImGui::EndTabItem();
        }
        ImGui::EndTabBar();
    }
    ImGui::PopStyleVar(); ImGui::PopStyleColor(4); ImGui::PopID();
}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
