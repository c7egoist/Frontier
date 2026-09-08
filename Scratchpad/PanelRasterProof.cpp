//============================================================================================================================================
//                                                      PANELRASTERPROOF.CPP
//============================================================================================================================================
// 🧩 Draws the REAL World Browser panel into a bitmap and writes it to Diagnostics/, so a claim about how the
//    panel looks can be checked by looking at it.
//
//    🔴 WHY THIS EXISTS. Every previous fix to this panel was argued from prose and from arithmetic, and twice
//    that was not enough: the cards overlapped for three commits, and the value pill was called correct while it
//    was visibly wrong on screen. Geometry assertions prove that rectangles do not intersect; they cannot prove
//    that the result looks right, and "looks right" was the actual complaint.
//
//    PixelSpace is a recording seam — hosts speak rectangles, polygons and text, and something downstream turns
//    those into an image. Normally that something is ImGui. Here it is the rasteriser below, so the panel drawn
//    is the panel the renderer draws, from the same InterfaceBrowserSequence, through the same ControlKit, with
//    the same layout solver. Nothing about the panel is reimplemented for the proof.
//
//    ⚠️ The text is a 5×7 block font, not the engine's typeface. Glyph shapes are not what is being proven —
//    geometry, spacing, colour and containment are — and a proof that needed a font atlas would not run here.
//
//    Build: bash Scratchpad/CheckPanelRaster.sh

#include "DisplayPresentation/ControlKit.h"
#include "DisplayPresentation/InterfaceBrowserSequence.h"
#include "DisplayPresentation/PixelSpace.h"
#include "DisplayPresentation/GlyphSpace.h"
#include "BlockFontShim.h"
#include "DisplayPresentation/ThemeStructure.h"
#include "DisplayPresentation/VectorCodec.h"
#include "PngWriteShim.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace {

//------------------------------------------------------------------------------------------------------------------------
//                                                     THE CANVAS
//------------------------------------------------------------------------------------------------------------------------

int          CanvasWidth  = 0;
int          CanvasHeight = 0;
std::vector<unsigned char> Canvas;                       // RGB8
std::vector<Frontier::PlaneExtent> ClipStack;

void Plot(int X, int Y, Frontier::ColorQuad Colour, float Coverage) noexcept
{
    if (X < 0 || Y < 0 || X >= CanvasWidth || Y >= CanvasHeight) return;
    if (!ClipStack.empty())
    {
        const Frontier::PlaneExtent& C = ClipStack.back();
        const float Px = static_cast<float>(X) + 0.5f, Py = static_cast<float>(Y) + 0.5f;
        if (Px < C.MinimumX || Px >= C.MaximumX || Py < C.MinimumY || Py >= C.MaximumY) return;
    }
    const float A = std::clamp(Colour.Alpha * Coverage, 0.0f, 1.0f);
    if (A <= 0.0f) return;
    unsigned char* P = &Canvas[static_cast<size_t>(Y) * CanvasWidth * 3 + static_cast<size_t>(X) * 3];
    const float Src[3] = { Colour.Red, Colour.Green, Colour.Blue };
    for (int I = 0; I < 3; ++I)
    {
        const float Dst = static_cast<float>(P[I]) / 255.0f;
        P[I] = static_cast<unsigned char>(std::clamp((Src[I] * A + Dst * (1.0f - A)) * 255.0f, 0.0f, 255.0f));
    }
}

// Signed distance to a rounded rectangle, so edges and corners are antialiased the same way and a 14 px radius
//    reads as a curve rather than as a staircase.
float RoundedDistance(float Px, float Py, const Frontier::PlaneExtent& E, float Radius) noexcept
{
    const float Cx = (E.MinimumX + E.MaximumX) * 0.5f, Cy = (E.MinimumY + E.MaximumY) * 0.5f;
    const float Hx = std::max(E.Width()  * 0.5f - Radius, 0.0f);
    const float Hy = std::max(E.Height() * 0.5f - Radius, 0.0f);
    // 🔴 The interior term is not optional. Clamping both axes at zero makes the distance zero for EVERY
    //    interior pixel, so with Radius 0 the whole rectangle came out at coverage 0.5 - a flat 50 % wash
    //    instead of a solid fill. That is invisible on a rounded fill, where the -Radius still drives the
    //    interior negative, and total on a square one. It is why the value pill's squared-off edge appeared
    //    to stay rounded: the square fill meant to cover the corner was painting at half alpha over it.
    const float Qx = std::fabs(Px - Cx) - Hx;
    const float Qy = std::fabs(Py - Cy) - Hy;
    const float Outside = std::sqrt(std::max(Qx, 0.0f) * std::max(Qx, 0.0f)
                                  + std::max(Qy, 0.0f) * std::max(Qy, 0.0f));
    return std::min(std::max(Qx, Qy), 0.0f) + Outside - Radius;
}

void FillRounded(const Frontier::PlaneExtent& E, Frontier::ColorQuad Colour, float Radius) noexcept
{
    const int X0 = static_cast<int>(std::floor(E.MinimumX)) - 1, X1 = static_cast<int>(std::ceil(E.MaximumX)) + 1;
    const int Y0 = static_cast<int>(std::floor(E.MinimumY)) - 1, Y1 = static_cast<int>(std::ceil(E.MaximumY)) + 1;
    const float R = std::clamp(Radius, 0.0f, std::min(E.Width(), E.Height()) * 0.5f);
    for (int Y = Y0; Y <= Y1; ++Y)
        for (int X = X0; X <= X1; ++X)
        {
            const float D = RoundedDistance(static_cast<float>(X) + 0.5f, static_cast<float>(Y) + 0.5f, E, R);
            Plot(X, Y, Colour, std::clamp(0.5f - D, 0.0f, 1.0f));
        }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                       TEXT
//------------------------------------------------------------------------------------------------------------------------
// A 5×7 block font. Only the characters the panel actually shows are defined; anything else draws as a box, which
//    is deliberately conspicuous rather than silently blank.

using BlockFontShim::Glyph;

const Glyph* FindGlyph(char Code) noexcept { return BlockFontShim::Find(Code); }

float GlyphAdvance(float Size) noexcept { return std::max(std::floor(Size * 0.62f), 4.0f); }

void DrawText(float X, float Y, Frontier::ColorQuad Colour, const char* Utf8, float Size) noexcept
{
    if (!Utf8) return;
    const float Scale   = std::max(std::floor(Size / 9.0f), 1.0f);
    const float Advance = GlyphAdvance(Size);
    float Pen = X;
    for (const char* C = Utf8; *C; ++C)
    {
        const Glyph* G = FindGlyph(*C);
        for (int Row = 0; Row < 7; ++Row)
            for (int Col = 0; Col < 5; ++Col)
            {
                const bool On = G ? (G->Rows[Row][Col] == '1')
                                  : (Row == 0 || Row == 6 || Col == 0 || Col == 4);   // unknown: a hollow box
                if (!On) continue;
                for (int Sy = 0; Sy < static_cast<int>(Scale); ++Sy)
                    for (int Sx = 0; Sx < static_cast<int>(Scale); ++Sx)
                        Plot(static_cast<int>(Pen) + Col * static_cast<int>(Scale) + Sx,
                             static_cast<int>(Y) + Row * static_cast<int>(Scale) + Sy, Colour, 1.0f);
            }
        Pen += Advance;
    }
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                              THE PIXELSPACE SEAM
//------------------------------------------------------------------------------------------------------------------------

namespace Frontier {

PixelSpace::PixelSpace() noexcept = default;

bool PixelSpace::Begin(SurfaceLayer, float Width, float Height, float) noexcept
{
    DisplayWidth = Width; DisplayHeight = Height; return true;
}

void PixelSpace::FillRectangle(const PlaneExtent& Extent, ColorQuad Colour, float Radius) noexcept
{ FillRounded(Extent, Colour, Radius); }

void PixelSpace::FillRectangleBottomRounded(const PlaneExtent& Extent, ColorQuad Colour, float Radius) noexcept
{ FillRounded(Extent, Colour, Radius); }

void PixelSpace::FillPolygon(const PlanePoint* Points, uint32_t Count, ColorQuad Colour) noexcept
{
    if (!Points || Count < 3u) return;
    float MinX = Points[0].X, MaxX = Points[0].X, MinY = Points[0].Y, MaxY = Points[0].Y;
    for (uint32_t I = 1u; I < Count; ++I)
    {
        MinX = std::min(MinX, Points[I].X); MaxX = std::max(MaxX, Points[I].X);
        MinY = std::min(MinY, Points[I].Y); MaxY = std::max(MaxY, Points[I].Y);
    }
    for (int Y = static_cast<int>(MinY); Y <= static_cast<int>(MaxY) + 1; ++Y)
        for (int X = static_cast<int>(MinX); X <= static_cast<int>(MaxX) + 1; ++X)
        {
            // Even-odd crossing at the pixel centre. Circles arrive here as fans, so this is what draws a knob.
            const float Px = static_cast<float>(X) + 0.5f, Py = static_cast<float>(Y) + 0.5f;
            bool Inside = false;
            for (uint32_t I = 0u, J = Count - 1u; I < Count; J = I++)
                if (((Points[I].Y > Py) != (Points[J].Y > Py))
                 && (Px < (Points[J].X - Points[I].X) * (Py - Points[I].Y)
                          / (Points[J].Y - Points[I].Y) + Points[I].X))
                    Inside = !Inside;
            if (Inside) Plot(X, Y, Colour, 1.0f);
        }
}

void PixelSpace::StrokePolyline(const PlanePoint* Points, uint32_t Count, ColorQuad Colour, float Thickness, bool Closed) noexcept
{
    if (!Points || Count < 2u) return;
    const uint32_t Segments = Closed ? Count : Count - 1u;
    for (uint32_t I = 0u; I < Segments; ++I)
    {
        const PlanePoint A = Points[I], B = Points[(I + 1u) % Count];
        const float Steps = std::max(std::fabs(B.X - A.X), std::fabs(B.Y - A.Y)) + 1.0f;
        for (float T = 0.0f; T <= Steps; T += 0.5f)
        {
            const float U = T / Steps;
            const float X = A.X + (B.X - A.X) * U, Y = A.Y + (B.Y - A.Y) * U;
            const int H = static_cast<int>(std::max(Thickness * 0.5f, 0.5f));
            for (int Oy = -H; Oy <= H; ++Oy)
                for (int Ox = -H; Ox <= H; ++Ox)
                    Plot(static_cast<int>(X) + Ox, static_cast<int>(Y) + Oy, Colour, 1.0f);
        }
    }
}

void PixelSpace::Text(float X, float Y, ColorQuad Colour, const char* Utf8, float Size) noexcept
{ DrawText(X, Y, Colour, Utf8, Size > 0.0f ? Size : 13.0f); }

void PixelSpace::PushClip(const PlaneExtent& Extent) noexcept { ClipStack.push_back(Extent); }
void PixelSpace::PopClip() noexcept { if (!ClipStack.empty()) ClipStack.pop_back(); }
void PixelSpace::PushTypeface(void*) noexcept {}
void PixelSpace::PopTypeface() noexcept {}
uint32_t PixelSpace::BeginGroup() const noexcept { return 0u; }
void PixelSpace::EndGroup(uint32_t, float, float, float, float, float, float) noexcept {}

PlanePoint PixelSpace::MeasureText(const char* Utf8, float Size) const noexcept
{
    const float S = Size > 0.0f ? Size : 13.0f;
    uint32_t Count = 0u; if (Utf8) while (Utf8[Count]) ++Count;
    return PlanePoint{ static_cast<float>(Count) * GlyphAdvance(S), S };
}

// The icon and theme seams the kit reaches for. Icons are not what this proves.
void GlyphSpace::Stroke(PixelSpace&, std::string_view, const GlyphPlacement&, float) noexcept {}
std::string_view VectorCodec::QueryControlCentreSvgPath(ControlCentreIconCategory) noexcept { return {}; }
ThemeStructure::ThemeStructure() noexcept = default;

const ThemePalette& ThemeStructure::QueryPalette() const noexcept
{
    static ThemePalette Dark = []
    {
        ThemePalette P{};
        P.MainBackground   = ColorQuad{ 0x0E / 255.0f, 0x0E / 255.0f, 0x0E / 255.0f, 1.0f };
        P.PanelBackground  = ColorQuad{ 0x14 / 255.0f, 0x14 / 255.0f, 0x14 / 255.0f, 1.0f };
        P.InputBackground  = ColorQuad{ 0x1A / 255.0f, 0x1A / 255.0f, 0x1A / 255.0f, 1.0f };
        P.ActiveBackground = ColorQuad{ 0x22 / 255.0f, 0x22 / 255.0f, 0x22 / 255.0f, 1.0f };
        P.CardBackground   = ColorQuad{ 0x18 / 255.0f, 0x18 / 255.0f, 0x18 / 255.0f, 1.0f };
        P.CardSubBackground= ColorQuad{ 0x2A / 255.0f, 0x2A / 255.0f, 0x2A / 255.0f, 1.0f };
        P.PanelBorder      = ColorQuad{ 0x2E / 255.0f, 0x2E / 255.0f, 0x2E / 255.0f, 1.0f };
        P.DividerColor     = ColorQuad{ 0x26 / 255.0f, 0x26 / 255.0f, 0x26 / 255.0f, 1.0f };
        P.TextMain         = ColorQuad{ 0xE0 / 255.0f, 0xE0 / 255.0f, 0xE0 / 255.0f, 1.0f };
        P.TextMuted        = ColorQuad{ 0x8A / 255.0f, 0x8A / 255.0f, 0x8A / 255.0f, 1.0f };
        return P;
    }();
    return Dark;
}

ColorQuad ThemeStructure::QueryAccentColor() const noexcept { return ColorQuad{ 0.231f, 0.510f, 0.965f, 1.0f }; }

} // namespace Frontier

//------------------------------------------------------------------------------------------------------------------------
//                                                       THE PROOF
//------------------------------------------------------------------------------------------------------------------------

int main()
{
    using namespace Frontier;

    ThemeStructure Theme;
    ControlKit::AssignTheme(Theme, ColorQuad{ 1.0f, 0.7f, 0.2f, 1.0f }, ColorQuad{ 0.2f, 0.8f, 0.4f, 1.0f },
                                   ColorQuad{ 0.3f, 0.6f, 1.0f, 1.0f }, ColorQuad{ 1.0f, 0.5f, 0.3f, 1.0f });

    CanvasWidth = 560; CanvasHeight = 420;
    Canvas.assign(static_cast<size_t>(CanvasWidth) * CanvasHeight * 3, 10);

    // The Sun panel, which is the one in the report.
    static float TimeOfDay = 19.06f, Rate = 0.0f, Latitude = 0.0f;
    std::vector<PropertyRowRecord> Rows;
    const auto Heading = [&](const char* Label)
    { PropertyRowRecord R{}; R.Kind = PropertyKindCategory::Heading; R.Label = Label; Rows.push_back(R); };
    const auto Slider = [&](const char* Label, float* Value, float Lo, float Hi, const char* Unit, uint32_t Decimals)
    {
        PropertyRowRecord R{}; R.Kind = PropertyKindCategory::Slider; R.Label = Label; R.Value = Value;
        R.Minimum = Lo; R.Maximum = Hi; R.Unit = Unit; R.Decimals = Decimals; Rows.push_back(R);
    };
    const auto Readout = [&](const char* Label, const char* Text)
    { PropertyRowRecord R{}; R.Kind = PropertyKindCategory::Readout; R.Label = Label; R.Text = Text; Rows.push_back(R); };

    Heading("Clock");
    Slider("Time of day", &TimeOfDay, 0.0f, 24.0f, "h", 2u);
    Slider("Rate", &Rate, 0.0f, 3600.0f, "x", 0u);
    Heading("Position");
    Readout("Elevation", "-14.6 deg");
    Readout("Azimuth", "293.5 deg");
    Heading("Site");
    Slider("Latitude", &Latitude, -90.0f, 90.0f, "d", 1u);

    PixelSpace Surface;
    Surface.Begin(SurfaceLayer::Window, static_cast<float>(CanvasWidth), static_cast<float>(CanvasHeight), 1.0f);

    const PlaneExtent Pane{ 20.0f, 20.0f, static_cast<float>(CanvasWidth) - 20.0f,
                            static_cast<float>(CanvasHeight) - 20.0f };
    Surface.FillRectangle(Pane, ControlKit::Palette().Panel, 0.0f);

    // The real layout, and the real controls, drawn through the real kit.
    const float CardX = Pane.MinimumX + 18.0f;
    const float CardW = Pane.Width() - 36.0f;
    const PanelLayout Layout = SolvePanelLayout(Rows, CardX, CardW, Pane.MinimumY + 14.0f);

    for (const PanelPlacement& Card : Layout.Cards)
        // ⚠️ Card, not Inset. Filling the card with --inset made it the SAME colour as a value pill's unit
        //    cell, so the unit cell disappeared into the card behind it and the pill read as a black box with a
        //    stroke floating next to nothing. The proof was hiding the very thing it was built to show.
        Surface.FillRectangle(Card.Extent, ControlKit::Palette().Card, 18.0f);

    uint32_t CardIndex = 0u;
    for (const PropertyRowRecord& R : Rows)
    {
        if (R.Kind != PropertyKindCategory::Heading) continue;
        const PlaneExtent& Card = Layout.Cards[CardIndex++].Extent;
        ControlKit::TextLeading(Surface,
            Spanning(Card.MinimumX + PanelSpacing::CardPadSide, Card.MinimumY + PanelSpacing::CardPadTop,
                     Card.Width() - PanelSpacing::CardPadSide * 2.0f, PanelSpacing::HeadingHeight),
            0.0f, ControlKit::Palette().TextFaint, R.Label, 10.5f);
    }

    ControlPointer Pointer{};
    Pointer.Enabled = false;
    for (const PanelPlacement& Placement : Layout.Rows)
    {
        const PropertyRowRecord& R = Rows[Placement.Row];
        const PlaneExtent Row = Placement.Extent;
        const PropertyRowGeometry G = SolvePropertyRow(Row.MinimumX, Row.Width(), R.Kind);

        ControlKit::TextLeading(Surface,
            Spanning(G.LabelX, Row.MinimumY + G.LabelY, G.LabelWidth,
                     G.LabelAbove ? PanelSpacing::LabelHeight : Row.Height()),
            0.0f, ControlKit::Palette().TextDim, R.Label, 12.0f);

        const float ControlY = Row.MinimumY + G.ControlY;
        if (R.Kind == PropertyKindCategory::Slider)
        {
            char Number[32];
            std::snprintf(Number, sizeof(Number), R.Decimals == 0u ? "%.0f" : (R.Decimals == 1u ? "%.1f" : "%.2f"),
                          static_cast<double>(*R.Value));
            ControlKit::ValuePill(Surface, G.PillX, ControlY, Number, R.Unit, 1.0f, G.PillWidth, G.PillUnitWidth);
            float Out = *R.Value;
            ControlKit::Slider(Surface, Spanning(G.SliderX, ControlY, G.SliderWidth, PanelSpacing::ControlHeight),
                               R.Minimum, R.Maximum, Out, false, Pointer, Out, false, false, 1.0f);
        }
        else if (R.Kind == PropertyKindCategory::Readout)
        {
            // Right-aligned by measuring, since the kit has no trailing helper.
            const PlanePoint Size = Surface.MeasureText(R.Text, 12.0f);
            ControlKit::TextLeading(Surface,
                Spanning(Row.MaximumX - Size.X, Row.MinimumY, Size.X, Row.Height()),
                0.0f, ControlKit::Palette().TextDim, R.Text, 12.0f);
        }
    }

    const std::string Path = "Diagnostics/WorldBrowser_Panel.png";
    if (PngWriteShim::WritePng(Path.c_str(), CanvasWidth, CanvasHeight, 3, Canvas.data(), CanvasWidth * 3) == 0)
    {
        std::printf("  could not write %s\n", Path.c_str());
        return 1;
    }
    std::printf("  wrote %s (%d x %d)\n", Path.c_str(), CanvasWidth, CanvasHeight);
    return 0;
}
