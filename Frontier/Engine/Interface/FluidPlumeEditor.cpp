/*==========================================================================================================================================
                                                         FLUIDPLUMEEDITOR.CPP
==========================================================================================================================================*/
// 🧩 EditorShell outliner + BuildGas inspector, rasterised with FrontierEditor.css colours
//    (--ground #101010, --column #161616, effects accent #e8833a, 288 / flex / 380 columns).

#include "Frontier/Engine/Interface/FluidPlumeEditor.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>

namespace Frontier
{

namespace
{

constexpr uint8_t Ground[3]  = { 0x10, 0x10, 0x10 };
constexpr uint8_t Column[3]  = { 0x16, 0x16, 0x16 };
constexpr uint8_t Edge[3]    = { 0x2a, 0x2a, 0x2a };
constexpr uint8_t Text[3]    = { 0xdc, 0xdc, 0xdc };
constexpr uint8_t Soft[3]    = { 0xb4, 0xb4, 0xb4 };
constexpr uint8_t Muted[3]   = { 0x7d, 0x7d, 0x7d };
constexpr uint8_t AccentFx[3]= { 0xe8, 0x83, 0x3a };
constexpr uint8_t OnGreen[3] = { 0x3e, 0xc4, 0x6d };
constexpr uint8_t Card0[3]   = { 0x22, 0x22, 0x22 };
constexpr uint8_t Card1[3]   = { 0x1f, 0x1f, 0x1f };
constexpr int OutlinerWidth = 288;
constexpr int InspectorWidth = 380;
constexpr int StatusHeight = 28;
constexpr int TabHeight = 34;
constexpr int RowHeight = 43;

// 📝 5×7 packed glyphs for 0-9 A-Z a-z space . × ° / & + - : '
const uint8_t Font5x7[96][7] = {
    {0,0,0,0,0,0,0},{0x04,0x04,0x04,0x04,0x00,0x04,0},{0x0a,0x0a,0,0,0,0,0},{0x0a,0x1f,0x0a,0x1f,0x0a,0,0},
    {0x04,0x0f,0x14,0x0e,0x05,0x1e,0x04},{0x18,0x19,0x02,0x04,0x08,0x13,0x03},{0x08,0x14,0x08,0x15,0x12,0x0d,0},
    {0x04,0x04,0,0,0,0,0},{0x02,0x04,0x04,0x04,0x04,0x02,0},{0x08,0x04,0x04,0x04,0x04,0x08,0},
    {0x00,0x0a,0x04,0x1f,0x04,0x0a,0},{0x00,0x04,0x04,0x1f,0x04,0x04,0},{0,0,0,0,0x04,0x04,0x08},
    {0,0,0,0x1f,0,0,0},{0,0,0,0,0,0x04,0},{0x01,0x02,0x04,0x08,0x10,0,0},
    {0x0e,0x11,0x13,0x15,0x19,0x11,0x0e},{0x04,0x0c,0x04,0x04,0x04,0x04,0x0e},{0x0e,0x11,0x01,0x06,0x08,0x10,0x1f},
    {0x1f,0x01,0x02,0x06,0x01,0x11,0x0e},{0x02,0x06,0x0a,0x12,0x1f,0x02,0x02},{0x1f,0x10,0x1e,0x01,0x01,0x11,0x0e},
    {0x06,0x08,0x10,0x1e,0x11,0x11,0x0e},{0x1f,0x01,0x02,0x04,0x08,0x08,0x08},{0x0e,0x11,0x11,0x0e,0x11,0x11,0x0e},
    {0x0e,0x11,0x11,0x0f,0x01,0x02,0x0c},{0x00,0x04,0x00,0x00,0x04,0x00,0},{0x00,0x04,0x00,0x00,0x04,0x04,0x08},
    {0x02,0x04,0x08,0x10,0x08,0x04,0x02},{0x00,0x00,0x1f,0x00,0x1f,0x00,0},{0x08,0x04,0x02,0x01,0x02,0x04,0x08},
    {0x0e,0x11,0x01,0x02,0x04,0x00,0x04},{0x0e,0x11,0x17,0x15,0x17,0x10,0x0e},
    {0x0e,0x11,0x11,0x1f,0x11,0x11,0x11},{0x1e,0x11,0x11,0x1e,0x11,0x11,0x1e},{0x0e,0x11,0x10,0x10,0x10,0x11,0x0e},
    {0x1e,0x11,0x11,0x11,0x11,0x11,0x1e},{0x1f,0x10,0x10,0x1e,0x10,0x10,0x1f},{0x1f,0x10,0x10,0x1e,0x10,0x10,0x10},
    {0x0e,0x11,0x10,0x13,0x11,0x11,0x0f},{0x11,0x11,0x11,0x1f,0x11,0x11,0x11},{0x0e,0x04,0x04,0x04,0x04,0x04,0x0e},
    {0x01,0x01,0x01,0x01,0x11,0x11,0x0e},{0x11,0x12,0x14,0x18,0x14,0x12,0x11},{0x10,0x10,0x10,0x10,0x10,0x10,0x1f},
    {0x11,0x1b,0x15,0x15,0x11,0x11,0x11},{0x11,0x19,0x15,0x13,0x11,0x11,0x11},{0x0e,0x11,0x11,0x11,0x11,0x11,0x0e},
    {0x1e,0x11,0x11,0x1e,0x10,0x10,0x10},{0x0e,0x11,0x11,0x11,0x15,0x12,0x0d},{0x1e,0x11,0x11,0x1e,0x14,0x12,0x11},
    {0x0e,0x11,0x10,0x0e,0x01,0x11,0x0e},{0x1f,0x04,0x04,0x04,0x04,0x04,0x04},{0x11,0x11,0x11,0x11,0x11,0x11,0x0e},
    {0x11,0x11,0x11,0x11,0x11,0x0a,0x04},{0x11,0x11,0x11,0x15,0x15,0x1b,0x11},{0x11,0x11,0x0a,0x04,0x0a,0x11,0x11},
    {0x11,0x11,0x0a,0x04,0x04,0x04,0x04},{0x1f,0x01,0x02,0x04,0x08,0x10,0x1f},
    {0x0e,0x08,0x08,0x08,0x08,0x08,0x0e},{0x10,0x08,0x04,0x02,0x01,0,0},{0x0e,0x02,0x02,0x02,0x02,0x02,0x0e},
    {0x04,0x0a,0x11,0,0,0,0},{0,0,0,0,0,0,0x1f},{0x08,0x04,0,0,0,0,0},
    {0,0x0e,0x01,0x0f,0x11,0x0f,0},{0x10,0x10,0x1e,0x11,0x11,0x1e,0},{0,0x0e,0x11,0x10,0x11,0x0e,0},
    {0x01,0x01,0x0f,0x11,0x11,0x0f,0},{0,0x0e,0x11,0x1f,0x10,0x0e,0},{0x06,0x08,0x1e,0x08,0x08,0x08,0},
    {0,0x0f,0x11,0x11,0x0f,0x01,0x0e},{0x10,0x10,0x1e,0x11,0x11,0x11,0},{0x04,0,0x0c,0x04,0x04,0x0e,0},
    {0x02,0,0x02,0x02,0x02,0x12,0x0c},{0x10,0x12,0x14,0x18,0x14,0x12,0},{0x0c,0x04,0x04,0x04,0x04,0x0e,0},
    {0,0x1a,0x15,0x15,0x15,0x15,0},{0,0x1e,0x11,0x11,0x11,0x11,0},{0,0x0e,0x11,0x11,0x11,0x0e,0},
    {0,0x1e,0x11,0x11,0x1e,0x10,0x10},{0,0x0f,0x11,0x11,0x0f,0x01,0x01},{0,0x16,0x19,0x10,0x10,0x10,0},
    {0,0x0f,0x10,0x0e,0x01,0x1e,0},{0x08,0x1e,0x08,0x08,0x08,0x06,0},{0,0x11,0x11,0x11,0x11,0x0f,0},
    {0,0x11,0x11,0x11,0x0a,0x04,0},{0,0x11,0x11,0x15,0x15,0x0a,0},{0,0x11,0x0a,0x04,0x0a,0x11,0},
    {0,0x11,0x11,0x0f,0x01,0x0e,0},{0,0x1f,0x02,0x04,0x08,0x1f,0},
    {0x06,0x08,0x08,0x10,0x08,0x08,0x06},{0x04,0x04,0x04,0x04,0x04,0x04,0x04},{0x0c,0x02,0x02,0x01,0x02,0x02,0x0c},
    {0,0x08,0x15,0x02,0,0,0},{0,0,0,0,0,0,0}
};

int GlyphIndex(char C)
{
    if (C >= 32 && C <= 126) return C - 32;
    return 0;
}

void PutPixel(PresentationFrame& Frame, int X, int Y, uint8_t R, uint8_t G, uint8_t B)
{
    if (X < 0 || Y < 0 || X >= Frame.Width || Y >= Frame.Height) return;
    uint8_t* P = &Frame.Rgb[(static_cast<size_t>(Y) * Frame.Width + X) * 3];
    P[0] = R; P[1] = G; P[2] = B;
}

void FillRect(PresentationFrame& Frame, int X, int Y, int W, int H, const uint8_t C[3])
{
    for (int Row = 0; Row < H; ++Row)
        for (int Col = 0; Col < W; ++Col)
            PutPixel(Frame, X + Col, Y + Row, C[0], C[1], C[2]);
}

void BlendRect(PresentationFrame& Frame, int X, int Y, int W, int H, const uint8_t C[3], float A)
{
    for (int Row = 0; Row < H; ++Row)
        for (int Col = 0; Col < W; ++Col)
        {
            if (X + Col < 0 || Y + Row < 0 || X + Col >= Frame.Width || Y + Row >= Frame.Height) continue;
            uint8_t* P = &Frame.Rgb[(static_cast<size_t>(Y + Row) * Frame.Width + (X + Col)) * 3];
            P[0] = static_cast<uint8_t>(P[0] * (1 - A) + C[0] * A);
            P[1] = static_cast<uint8_t>(P[1] * (1 - A) + C[1] * A);
            P[2] = static_cast<uint8_t>(P[2] * (1 - A) + C[2] * A);
        }
}

void DrawText(PresentationFrame& Frame, int X, int Y, const char* String, const uint8_t C[3], int Scale = 1)
{
    int Cursor = X;
    for (const char* Ch = String; *Ch; ++Ch)
    {
        if (*Ch == '\n') { Y += 8 * Scale; Cursor = X; continue; }
        const uint8_t* Glyph = Font5x7[GlyphIndex(*Ch)];
        for (int Row = 0; Row < 7; ++Row)
            for (int Col = 0; Col < 5; ++Col)
                if (Glyph[Row] & (0x10 >> Col))
                    for (int Sy = 0; Sy < Scale; ++Sy)
                        for (int Sx = 0; Sx < Scale; ++Sx)
                            PutPixel(Frame, Cursor + Col * Scale + Sx, Y + Row * Scale + Sy, C[0], C[1], C[2]);
        Cursor += 6 * Scale;
    }
}

void DrawHLine(PresentationFrame& Frame, int X, int Y, int W, const uint8_t C[3])
{
    for (int Col = 0; Col < W; ++Col) PutPixel(Frame, X + Col, Y, C[0], C[1], C[2]);
}

std::string FormatScalar(float Scalar, int Digits)
{
    std::ostringstream Stream;
    Stream.setf(std::ios::fixed);
    Stream.precision(Digits);
    Stream << Scalar;
    return Stream.str();
}

int SliderDigits(const GasParameterSpec& Spec)
{
    if (Spec.Step >= 1.0f) return 0;
    if (Spec.Step >= 0.1f) return 1;
    if (Spec.Step >= 0.01f) return 2;
    return 3;
}

}

FluidPlumeEditor::FluidPlumeEditor()
    : Space(0)
{
    Entities = {
        { "render", "Render", "Render settings", "Renderer", "BVH ReSTIR Path Tracer, resolution, reflections & debug views", { 0x9f, 0xb4, 0xd6 }, false },
        { "sun", "Environment", "Sun & sky", "Directional light", "Light, direction & atmosphere", { 0xe8, 0xc2, 0x7a }, false },
        { "vehicle", "Vehicle", "ControlVehicle", "Vehicle", "Telemetry, burnout, tyres & camera", { 0xe1, 0xd3, 0x4a }, false },
        { "gas", "Effects", "Smoke & fire", "Gas domain", "Eulerian smoke · combustion · tyre sources", { 0xe8, 0x83, 0x3a }, true },
        { "fracture", "Destruction", "Fracture", "Breakable props", "Energy-limited fracture · fragment bodies", { 0x8f, 0xb3, 0xa4 }, true },
        { "level", "Level", "Proving grounds", "Level", "Zones, teleports & scene budget", { 0xa8, 0xbb, 0xeb }, false },
    };
    Selected = "gas";
    OccupantRecord Vehicle{};
    Vehicle.Centre = { 0.0f, 0.0f, 0.55f };
    Vehicle.Identity = 0;
    Distance.Occupants.push_back(Vehicle);
    Distance.GroundHeight = 0.0f;
}

void FluidPlumeEditor::Select(const char* Id)
{
    for (const EditorEntity& Entity : Entities)
        if (std::strcmp(Entity.Id, Id) == 0)
        {
            Selected = Id;
            InspectorScroll = 0;
            return;
        }
}

bool FluidPlumeEditor::SelectByQuery(const char* Query)
{
    const std::string Needle = Query ? Query : "";
    std::string Lower = Needle;
    for (char& Ch : Lower) Ch = static_cast<char>(std::tolower(static_cast<unsigned char>(Ch)));
    if (Lower == "smoke" || Lower == "fluid" || Lower == "plume" || Lower == "gas"
        || Lower.find("smoke") != std::string::npos || Lower.find("plume") != std::string::npos
        || Lower.find("fluid") != std::string::npos)
    {
        Select("gas");
        return true;
    }
    for (const EditorEntity& Entity : Entities)
    {
        std::string Name = Entity.Name;
        std::string Type = Entity.Type;
        std::string Id = Entity.Id;
        for (char& Ch : Name) Ch = static_cast<char>(std::tolower(static_cast<unsigned char>(Ch)));
        for (char& Ch : Type) Ch = static_cast<char>(std::tolower(static_cast<unsigned char>(Ch)));
        if (Name.find(Lower) != std::string::npos || Type.find(Lower) != std::string::npos || Id == Lower)
        {
            Select(Entity.Id);
            return true;
        }
    }
    return false;
}

void FluidPlumeEditor::ToggleSelected()
{
    if (Selected == "gas")
        Settings.SmokeEnabled = !Settings.SmokeEnabled;
}

void FluidPlumeEditor::ApplyPreset(const char* Name)
{
    Settings.Gas.ApplyPreset(Name);
}

void FluidPlumeEditor::ClearSmoke()
{
    Space.Clear();
    Sources.Reset();
}

void FluidPlumeEditor::AssignSlider(GasParameter Id, float Scalar)
{
    Settings.Gas.Assign(Id, Scalar);
}

void FluidPlumeEditor::AssignTestPlume(int Mode)
{
    Settings.TestPlume = std::clamp(Mode, 0, 2);
}

bool FluidPlumeEditor::Hit(int X, int Y)
{
    for (const HitRect& Rect : Hits)
    {
        if (X < Rect.X || Y < Rect.Y || X >= Rect.X + Rect.W || Y >= Rect.Y + Rect.H)
            continue;
        if (Rect.Kind == 1) { Select(Entities[static_cast<size_t>(Rect.Payload)].Id); return true; }
        if (Rect.Kind == 2) { ToggleSelected(); return true; }
        if (Rect.Kind == 3) { AssignTestPlume(Rect.Payload); return true; }
        if (Rect.Kind == 4) { ApplyPreset(QueryGasPresets()[static_cast<size_t>(Rect.Payload)].Name); return true; }
        if (Rect.Kind == 5) { ClearSmoke(); return true; }
        if (Rect.Kind == 6) { Settings.Gas.ResetDefaults(); return true; }
        if (Rect.Kind == 7)
        {
            const GasParameterSpec& Spec = QueryGasParameterCatalogue()[static_cast<size_t>(Rect.Payload)];
            const float T = std::clamp(static_cast<float>(X - Rect.X) / static_cast<float>(std::max(Rect.W, 1)), 0.0f, 1.0f);
            AssignSlider(static_cast<GasParameter>(Rect.Payload), Spec.Minimum + T * (Spec.Maximum - Spec.Minimum));
            return true;
        }
    }
    return false;
}

void FluidPlumeEditor::Advance(float Seconds, PlumeVec3 VehiclePosition, PlumeVec3 Forward)
{
    Distance.Occupants[0].Centre = { VehiclePosition.X, VehiclePosition.Y, VehiclePosition.Z + 0.02f };
    const PlumeSettings Mapped = MapPlumeSettings(Settings.Gas, Settings.SmokeEnabled);
    SourceProjectOptions Options{};
    Options.EmissionRate = Mapped.PlumeEmissionRate;
    Options.SmokeYield = Mapped.PlumeDensity;
    Options.HeatYield = Mapped.PlumeHeat;
    Options.SootYield = Mapped.PlumeSoot;
    Options.FireLight = Mapped.PlumeFireLight;
    PlumeTelemetry Telemetry{};
    Telemetry.Position = VehiclePosition;
    Sources.Project(Telemetry, Seconds * Settings.Gas.Query(GasParameter::TimeScale), Options);
    if (Settings.TestPlume > 0)
        Sources.WriteExtra(ResolveTestPlume(VehiclePosition, Forward, Settings.TestPlume == 2));
    const float Step = std::min(0.1f, Seconds * Settings.Gas.Query(GasParameter::TimeScale));
    Space.Configuration.PressureSweeps = std::max(4, 2 * static_cast<int>(std::round(Settings.Gas.Query(GasParameter::PressureSweeps) / 2.0f)));
    Space.Schedule(Step, Seconds, VehiclePosition, Sources, Mapped, PlumeNormalize({ 0.25f, 0.15f, 1.0f }));
    Space.AssignFireLights(Sources.Lights);
    if (Space.StepPending)
        Space.RecordTransport(Distance);
}

void FluidPlumeEditor::CompositeViewport(PresentationFrame& Frame, int ViewX, int ViewY, int ViewW, int ViewH)
{
    PlumeMarchFrame March;
    March.Width = ViewW;
    March.Height = ViewH;
    March.CameraPosition = { 3.0f, -5.5f, 1.15f };
    March.SunDirection = { 0.25f, 0.18f, 0.95f };
    March.SunIlluminance = { 12.0f, 11.0f, 9.4f };
    March.SkyAmbient = { 0.42f, 0.55f, 0.78f };
    March.SkyScale = 1.0f;
    March.Depth.assign(static_cast<size_t>(ViewW * ViewH), 1.0e5f);
    Space.RecordMarch(March);
    auto Tone = [](float Channel) {
        const float Mapped = Channel / (1.0f + Channel);
        return static_cast<uint8_t>(std::clamp(std::pow(Mapped, 1.0f / 2.2f) * 255.0f, 0.0f, 255.0f));
    };
    for (int Y = 0; Y < ViewH; ++Y)
        for (int X = 0; X < ViewW; ++X)
        {
            const PlumeVec4 Sample = March.Radiance[static_cast<size_t>(Y * ViewW + X)];
            uint8_t* P = &Frame.Rgb[(static_cast<size_t>(ViewY + Y) * Frame.Width + (ViewX + X)) * 3];
            const float T = Sample.W;
            P[0] = static_cast<uint8_t>(P[0] * T + Tone(Sample.X) * (1.0f - T));
            P[1] = static_cast<uint8_t>(P[1] * T + Tone(Sample.Y) * (1.0f - T));
            P[2] = static_cast<uint8_t>(P[2] * T + Tone(Sample.Z) * (1.0f - T));
        }
}

PresentationFrame FluidPlumeEditor::Raster(int Width, int Height)
{
    PresentationFrame Frame;
    Frame.Width = Width;
    Frame.Height = Height;
    Frame.Rgb.assign(static_cast<size_t>(Width) * Height * 3, 0x10);
    Hits.clear();

    const int ViewX = OutlinerWidth;
    const int ViewW = std::max(64, Width - OutlinerWidth - InspectorWidth);
    const int ViewH = Height - StatusHeight;
    const int InspectorX = OutlinerWidth + ViewW;

    FillRect(Frame, 0, 0, OutlinerWidth, Height - StatusHeight, Column);
    FillRect(Frame, InspectorX, 0, InspectorWidth, Height - StatusHeight, Column);
    FillRect(Frame, 0, Height - StatusHeight, Width, StatusHeight, Ground);
    DrawHLine(Frame, OutlinerWidth - 1, 0, 1, Edge);
    for (int Y = 0; Y < Height - StatusHeight; ++Y) PutPixel(Frame, OutlinerWidth - 1, Y, Edge[0], Edge[1], Edge[2]);
    for (int Y = 0; Y < Height - StatusHeight; ++Y) PutPixel(Frame, InspectorX, Y, Edge[0], Edge[1], Edge[2]);

    FillRect(Frame, 0, 0, OutlinerWidth, TabHeight, Ground);
    DrawText(Frame, 16, 12, "Outliner", Soft);
    DrawText(Frame, 16, 44, "frontier.", Text, 2);
    DrawText(Frame, 16, 66, "ENGINE / 01", Muted);
    DrawText(Frame, 16, 86, "WORKSPACE", Muted);
    DrawText(Frame, 16, 100, "Proving Grounds.scene", Text);

    int RowY = 128;
    const char* LastGroup = "";
    for (size_t Index = 0; Index < Entities.size(); ++Index)
    {
        const EditorEntity& Entity = Entities[Index];
        if (std::strcmp(Entity.Group, LastGroup) != 0)
        {
            DrawText(Frame, 16, RowY, Entity.Group, Muted);
            RowY += 16;
            LastGroup = Entity.Group;
        }
        const bool On = Selected == Entity.Id;
        if (On) BlendRect(Frame, 8, RowY - 4, OutlinerWidth - 16, RowHeight - 8, Entity.Colour.data(), 0.18f);
        DrawText(Frame, 20, RowY + 4, Entity.Name, On ? Text : Soft);
        DrawText(Frame, 20, RowY + 16, Entity.Type, Muted);
        Hits.push_back({ 8, RowY - 4, OutlinerWidth - 16, RowHeight - 8, 1, static_cast<int>(Index) });
        if (Entity.Toggle)
        {
            const bool Enabled = Settings.SmokeEnabled || std::strcmp(Entity.Id, "gas") != 0;
            FillRect(Frame, OutlinerWidth - 28, RowY + 8, 10, 10, Enabled ? OnGreen : Muted);
        }
        RowY += RowHeight;
    }

    FillRect(Frame, ViewX, 0, ViewW, TabHeight, Ground);
    DrawText(Frame, ViewX + 16, 12, "Scene  WebGPU · distance-field GI · ReSTIR", Soft);
    DrawText(Frame, ViewX + ViewW - 50, 12, "LIVE", OnGreen);
    const uint8_t ViewBg[3] = { 0x0c, 0x0c, 0x0c };
    FillRect(Frame, ViewX, TabHeight, ViewW, ViewH - TabHeight, ViewBg);

    FillRect(Frame, InspectorX, 0, InspectorWidth, 44, Column);
    DrawText(Frame, InspectorX + 18, 16, "Inspector  Effects", Soft);
    DrawText(Frame, InspectorX + InspectorWidth - 150, 16, "Changes apply live", OnGreen);

    int Y = 56;
    DrawText(Frame, InspectorX + 18, Y, "Gas domain", Muted);
    DrawText(Frame, InspectorX + 18, Y + 14, "Smoke & fire", Text, 2);
    Y += 40;
    const uint8_t* Pill = Settings.SmokeEnabled ? OnGreen : Muted;
    FillRect(Frame, InspectorX + InspectorWidth - 100, 70, 72, 18, Pill);
    DrawText(Frame, InspectorX + InspectorWidth - 92, 74, Settings.SmokeEnabled ? "Enabled" : "Disabled", Ground);
    Hits.push_back({ InspectorX + InspectorWidth - 100, 70, 72, 18, 2, 0 });

    DrawText(Frame, InspectorX + 18, Y, "PROPERTIES", Muted);
    DrawText(Frame, InspectorX + 120, Y, "Eulerian smoke · combustion · tyre sources", Muted);
    Y += 18;

    auto Card = [&](const char* Title, int Index, const char* Subtitle) {
        FillRect(Frame, InspectorX + 14, Y, InspectorWidth - 28, 8, Card0);
        DrawText(Frame, InspectorX + 24, Y + 6, Title, AccentFx);
        char Number[8];
        std::snprintf(Number, sizeof(Number), "%02d", Index);
        DrawText(Frame, InspectorX + InspectorWidth - 48, Y + 6, Number, Muted);
        Y += 20;
        if (Subtitle && Subtitle[0])
        {
            DrawText(Frame, InspectorX + 24, Y, Subtitle, Muted);
            Y += 14;
        }
    };

    Card("Domain", 1, "Toroidal lattice following the car");
    const PlumeDescription Description = Space.QueryDescription();
    DrawText(Frame, InspectorX + 24, Y, Description.Thermo.c_str(), Text);
    DrawText(Frame, InspectorX + 24, Y + 12, Space.Resident ? "resident" : "idle", Space.Resident ? OnGreen : Muted);
    Y += 28;
    DrawText(Frame, InspectorX + 24, Y, "Test emitter · 3 m ahead of the car", Soft);
    Y += 14;
    const char* Modes[3] = { "Off", "Smoke plume", "Fire" };
    for (int Mode = 0; Mode < 3; ++Mode)
    {
        const int BX = InspectorX + 24 + Mode * 110;
        const uint8_t* Colour = Settings.TestPlume == Mode ? AccentFx : Edge;
        FillRect(Frame, BX, Y, 100, 18, Colour);
        DrawText(Frame, BX + 8, Y + 5, Modes[Mode], Settings.TestPlume == Mode ? Ground : Text);
        Hits.push_back({ BX, Y, 100, 18, 3, Mode });
    }
    Y += 26;
    FillRect(Frame, InspectorX + 24, Y, 100, 18, Edge);
    DrawText(Frame, InspectorX + 32, Y + 5, "Clear smoke", Text);
    Hits.push_back({ InspectorX + 24, Y, 100, 18, 5, 0 });
    FillRect(Frame, InspectorX + 132, Y, 80, 18, Edge);
    DrawText(Frame, InspectorX + 144, Y + 5, "Defaults", Text);
    Hits.push_back({ InspectorX + 132, Y, 80, 18, 6, 0 });
    Y += 28;

    auto SliderBlock = [&](GasParameter Id) {
        const GasParameterSpec& Spec = QueryGasParameterCatalogue()[static_cast<size_t>(Id)];
        const float Scalar = Settings.Gas.Query(Id);
        DrawText(Frame, InspectorX + 24, Y, Spec.Label, Soft);
        const std::string Value = FormatScalar(Scalar, SliderDigits(Spec)) + Spec.Unit;
        DrawText(Frame, InspectorX + InspectorWidth - 90, Y, Value.c_str(), Text);
        Y += 12;
        FillRect(Frame, InspectorX + 24, Y + 4, InspectorWidth - 56, 3, Edge);
        const float T = (Scalar - Spec.Minimum) / std::max(Spec.Maximum - Spec.Minimum, 1.0e-4f);
        const int Fill = static_cast<int>((InspectorWidth - 56) * std::clamp(T, 0.0f, 1.0f));
        FillRect(Frame, InspectorX + 24, Y + 4, Fill, 3, AccentFx);
        Hits.push_back({ InspectorX + 24, Y, InspectorWidth - 56, 12, 7, static_cast<int>(Id) });
        Y += 16;
    };

    Card("Source", 2, "Multipliers on the tyre model");
    SliderBlock(GasParameter::Emission);
    SliderBlock(GasParameter::Heat);
    SliderBlock(GasParameter::Soot);
    Y += 8;

    Card("Simulation", 3, nullptr);
    SliderBlock(GasParameter::Buoyancy);
    SliderBlock(GasParameter::Dissipation);
    SliderBlock(GasParameter::Cooling);
    SliderBlock(GasParameter::Vorticity);
    SliderBlock(GasParameter::Turbulence);
    SliderBlock(GasParameter::TurbulenceScale);
    SliderBlock(GasParameter::WindSpeed);
    SliderBlock(GasParameter::WindHeading);
    SliderBlock(GasParameter::TimeScale);
    SliderBlock(GasParameter::PressureSweeps);
    Y += 8;

    Card("Appearance", 4, nullptr);
    SliderBlock(GasParameter::Density);
    SliderBlock(GasParameter::Albedo);
    SliderBlock(GasParameter::Phase);
    SliderBlock(GasParameter::MultiScatter);
    SliderBlock(GasParameter::Ambient);
    SliderBlock(GasParameter::Detail);
    SliderBlock(GasParameter::DetailScale);
    Y += 8;

    Card("Fire", 5, "Combustion of the tyre");
    SliderBlock(GasParameter::FlameIntensity);
    SliderBlock(GasParameter::FlameCore);
    SliderBlock(GasParameter::FlameTip);
    SliderBlock(GasParameter::FlameTemperature);
    SliderBlock(GasParameter::FlameLoss);
    SliderBlock(GasParameter::FireLight);
    Y += 8;

    Card("Presets", 6, nullptr);
    int PX = InspectorX + 24;
    int PY = Y;
    const auto& Presets = QueryGasPresets();
    for (size_t Index = 0; Index < Presets.size(); ++Index)
    {
        FillRect(Frame, PX, PY, 160, 16, Edge);
        DrawText(Frame, PX + 6, PY + 4, Presets[Index].Name, Text);
        Hits.push_back({ PX, PY, 160, 16, 4, static_cast<int>(Index) });
        PY += 20;
        if (Index == 2) { PX = InspectorX + 190; PY = Y; }
    }
    Y = std::max(Y + 70, PY + 8);
    const auto Lines = Space.QueryReadout();
    DrawText(Frame, InspectorX + 24, Y, Lines[0].c_str(), Muted);
    if (Lines.size() > 1)
        DrawText(Frame, InspectorX + 24, Y + 12, Lines[1].c_str(), Muted);

    DrawText(Frame, 12, Height - 18, "REALTIME", Muted);
    DrawText(Frame, 120, Height - 18, Space.Resident ? "SMOKE resident" : "SMOKE idle", Space.Resident ? AccentFx : Muted);
    DrawText(Frame, Width - 180, Height - 18, "CAM  0, -8, 2", Muted);

    CompositeViewport(Frame, ViewX, TabHeight, ViewW, ViewH - TabHeight);
    return Frame;
}

PresentationFrame RasterFluidPlumeEditor(FluidPlumeEditor& Editor, int Width, int Height)
{
    return Editor.Raster(Width, Height);
}

bool WritePpm(const std::string& Path, const PresentationFrame& Frame)
{
    std::ofstream Stream(Path, std::ios::binary);
    if (!Stream) return false;
    Stream << "P6\n" << Frame.Width << " " << Frame.Height << "\n255\n";
    Stream.write(reinterpret_cast<const char*>(Frame.Rgb.data()), static_cast<std::streamsize>(Frame.Rgb.size()));
    return static_cast<bool>(Stream);
}

} // namespace Frontier
