/*============================================================================================================================================
                                                        GEOMETRYCOMPILEEXHIBITSTUDIO.H
============================================================================================================================================*/
// 🧩 Shared Geometry Compiler exhibit studio: Vulkan UVWorkspaceRasterizer tiles, ImGui label canvas, scoreboard & fixture encoders

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Appearance/ThemeRepository.h"
#include "Engine/Components/Appearance/TypographyRepository.h"
#include "Engine/Components/Docking/WorkspaceTabStrip.h"
#include "Engine/GeometricRaster/UV/UVWorkspaceRasterizer.h"
#include "Engine/GeometricRaster/VulkanInterchange.h"
#include "Engine/GeometrySpace/Network/FacePartitionRegister.h"
#include "Engine/GeometrySpace/Network/PolygonNetwork.h"
#include "Engine/Mathematics/CoordinateSpace.h"
#include "Engine/SimulationSpace/PhysicsSpace/CollisionFitSolver.h"
#include "Exhibits/SoftwareCanvasRasterizer.h"

#include <imgui.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <span>
#include <string>
#include <vector>

namespace Frontier::Exhibits
{

//------------------------------------------------------------------------------------------------------------------------
//                                                       STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

struct ExhibitCheckLine
{
    std::string Label  {};    // [-] - Check description shown in the proof
    bool        Passed = false; // [-] - Outcome
};

struct ExhibitScoreboard
{
    const char*                   SuiteTitle = "GeometryCompiler";
    std::vector<ExhibitCheckLine> Lines      {};

    bool Check(bool Condition, std::string Label)
    {
        if (!Condition)
        {
            std::fprintf(stderr, "[%s][FAIL] %s\n", SuiteTitle, Label.c_str());
        }
        Lines.push_back({ std::move(Label), Condition });
        return Condition;
    }

    [[nodiscard]] uint32_t QueryFailedCount() const noexcept
    {
        return static_cast<uint32_t>(std::count_if(Lines.begin(), Lines.end(), [](const ExhibitCheckLine& Line) { return !Line.Passed; }));
    }
};

// Owns the real Vulkan viewport rasterizer (GPU tiles) plus the ImGui context used only for labels and diagrams.
class GeometryCompileExhibitStudio
{
public:
    [[nodiscard]] bool Initialize(const std::filesystem::path& RepoRoot, uint32_t CanvasWidthPx, uint32_t CanvasHeightPx, std::string& OutDiagnostic)
    {
        if (!Interchange.InitializeInterchange(RepoRoot, &OutDiagnostic))
        {
            return false;
        }
        if (!Rasterizer.InitializeRasterizer(&Interchange, std::filesystem::path(FRONTIER_COMPILED_SHADER_DIR)))
        {
            OutDiagnostic = "UVWorkspaceRasterizer failed to initialize";
            return false;
        }
        GpuReady = true;

        IMGUI_CHECKVERSION();
        GuiSession = ImGui::CreateContext();
        ImGui::SetCurrentContext(GuiSession);
        ImGuiIO& Io    = ImGui::GetIO();
        Io.IniFilename = nullptr;
        Io.LogFilename = nullptr;
        (void)Typefaces.LoadRepository(RepoRoot / "EngineContent/FontsArchives");
        TypographyRepository::AssignCurrent(&Typefaces);
        if (ImFont* TabFont = Typefaces.QueryTabStripFont())
        {
            Io.FontDefault = TabFont;
        }
        unsigned char* FontPixels = nullptr;
        int            FontW = 0, FontH = 0;
        Io.Fonts->GetTexDataAsRGBA32(&FontPixels, &FontW, &FontH);
        Themes.ConfigureTheme(ThemePreset::Dark);
        Components::ConfigureImGuiWorkspaceTheme(Components::ConstructWorkspaceTabMetrics(1.0f), Themes);
        WidthPx  = CanvasWidthPx;
        HeightPx = CanvasHeightPx;
        return true;
    }

    void Teardown() noexcept
    {
        if (GuiSession != nullptr)
        {
            TypographyRepository::AssignCurrent(nullptr);
            ImGui::DestroyContext(GuiSession);
            GuiSession = nullptr;
        }
        if (GpuReady)
        {
            Rasterizer.TeardownRasterizer();
            Interchange.TeardownInterchange();
            GpuReady = false;
        }
    }

    // Renders Network through the engine viewport (Vulkan) framed on its bounds; OutRgba is WidthPx × HeightPx × 4.
    [[nodiscard]] bool RenderNetworkTile(
        const GeometrySpace::PolygonNetwork&                   Network,
        std::span<const GeometrySpace::PriorityAllocationLayer> Layers,
        GeometricRaster::SurfaceDisplayMode                    DisplayMode,
        uint32_t                                               TileWidthPx,
        uint32_t                                               TileHeightPx,
        std::vector<uint8_t>&                                  OutRgba,
        float                                                  YawRadians   = 0.72f,
        float                                                  PitchRadians = 0.42f,
        bool                                                   Wireframe    = false)
    {
        if (!GpuReady || Network.Faces.empty())
        {
            return false;
        }
        Rasterizer.ConfigureLayerSwatches(Layers);
        if (!Rasterizer.UploadPolygonNetwork(Network, 1u))
        {
            return false;
        }
        std::vector<Mathematics::Axis3D> Points {};
        Points.reserve(Network.Vertices.size());
        for (const GeometrySpace::Vertex& Vert : Network.Vertices)
        {
            Points.push_back(Vert.Axes);
        }
        const auto  Bounds = SimulationSpace::PhysicsSpace::EvaluateAxisAlignedBounds(Points);
        const float ρ      = std::max(1.0e-3f, Mathematics::EvaluateLength(Bounds.QuerySize()) * 0.5f); // [m] - Bounding radius

        GeometricRaster::Viewport3DRenderOptions Options {};
        Options.Camera.TargetPivot    = Bounds.QueryCentre();
        Options.Camera.YawRadians     = YawRadians;
        Options.Camera.PitchRadians   = PitchRadians;
        Options.Camera.DistanceMeters = ρ * 2.85f;
        Options.Camera.Basis          = Mathematics::QueryActiveWorldBasis();
        Options.DisplayMode           = DisplayMode;
        Options.WireframeEnabled      = Wireframe;
        Options.GroundGridEnabled     = false;
        Options.RenderGizmo           = false;
        Options.SeamOverlayEnabled    = false;
        Options.ActiveLayerOrdinal    = 0u;
        OutRgba.clear();
        return Rasterizer.Rasterize3DViewport(TileWidthPx, TileHeightPx, Options, nullptr, &OutRgba) &&
               OutRgba.size() >= static_cast<std::size_t>(TileWidthPx) * TileHeightPx * 4u;
    }

    ImDrawList* BeginLabelCanvas()
    {
        ImGuiIO& Io    = ImGui::GetIO();
        Io.DisplaySize = ImVec2(static_cast<float>(WidthPx), static_cast<float>(HeightPx));
        Io.DeltaTime   = 1.0f / 60.0f;
        ImGui::NewFrame();
        return ImGui::GetBackgroundDrawList();
    }

    struct PendingTileBlit
    {
        uint32_t             X      = 0u;
        uint32_t             Y      = 0u;
        uint32_t             Width  = 0u;
        uint32_t             Height = 0u;
        std::vector<uint8_t> Rgba   {};
    };

    // Tiles are blitted first, then the ImGui label batches are composited over the panel chrome around them.
    [[nodiscard]] bool WriteCanvas(const std::filesystem::path& OutputPng, std::span<const PendingTileBlit> Tiles, Components::RgbaColor8 Backdrop)
    {
        ImGui::Render();
        SoftwareRasterCanvas Canvas(WidthPx, HeightPx, Backdrop);
        Canvas.RasterizeImGuiBatches(ImGui::GetDrawData());
        for (const PendingTileBlit& Tile : Tiles)
        {
            if (Tile.Rgba.size() >= static_cast<std::size_t>(Tile.Width) * Tile.Height * 4u)
            {
                Canvas.BlitRgbaRegion(Tile.X, Tile.Y, Tile.Width, Tile.Height, Tile.Rgba.data());
            }
        }
        std::filesystem::create_directories(OutputPng.parent_path());
        return Canvas.WritePngFile(OutputPng);
    }

private:
    GeometricRaster::VulkanInterchange     Interchange {};
    GeometricRaster::UVWorkspaceRasterizer Rasterizer  {};
    TypographyRepository                   Typefaces   {};
    ThemeRepository                        Themes      {};
    ImGuiContext*                          GuiSession  = nullptr;
    bool                                   GpuReady    = false;
    uint32_t                               WidthPx     = 0u;
    uint32_t                               HeightPx    = 0u;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  CHECKLIST TRACING
//------------------------------------------------------------------------------------------------------------------------

inline void TraceScoreboardColumn(ImDrawList* List, const ExhibitScoreboard& Score, ImVec2 Origin, float RowPitch, std::size_t FirstLine = 0u, std::size_t LineCount = ~std::size_t{ 0u })
{
    const ImU32 Pass = IM_COL32(126, 214, 150, 255);
    const ImU32 Fail = IM_COL32(240, 104, 104, 255);
    const ImU32 Text = IM_COL32(214, 220, 230, 255);
    const std::size_t Last = std::min(Score.Lines.size(), FirstLine + std::min(LineCount, Score.Lines.size()));
    for (std::size_t Idx = FirstLine; Idx < Last; ++Idx)
    {
        const float Y = Origin.y + static_cast<float>(Idx - FirstLine) * RowPitch;
        List->AddCircleFilled(ImVec2(Origin.x + 6.0f, Y + 8.0f), 5.0f, Score.Lines[Idx].Passed ? Pass : Fail);
        List->AddText(ImVec2(Origin.x + 20.0f, Y), Text, Score.Lines[Idx].Label.c_str());
    }
}

} // namespace Frontier::Exhibits
