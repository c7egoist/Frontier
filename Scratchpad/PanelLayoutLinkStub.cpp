// Link stub for the panel-layout proof. PanelLayoutTest asserts GEOMETRY — the negotiated widths of a property
//    row and the clamping of a scroll offset — and none of that touches a pixel. ControlKit nonetheless carries
//    the drawing entry points beside the arithmetic, so the icon rasteriser, the SVG table and the theme come
//    along at link time. They are stubbed here rather than dragging an immediate-mode UI, a font atlas and a
//    vector codec into a headless build-time proof.
//
//    ⚠️ The palette returned is a real default rather than a zeroed one: ControlKit reads colours while laying
//    out (a disabled row measures the same as an enabled one, but the code path still asks), and a palette full
//    of NaN would make the arithmetic under test depend on it.

#include "DisplayPresentation/ControlKit.h"
#include "DisplayPresentation/GlyphSpace.h"
#include "DisplayPresentation/PixelSpace.h"
#include "DisplayPresentation/ThemeStructure.h"
#include "DisplayPresentation/VectorCodec.h"

namespace Frontier {

PixelSpace::PixelSpace() noexcept = default;
void PixelSpace::StrokePolyline(const PlanePoint*, unsigned int, ColorQuad, float, bool) noexcept {}
void PixelSpace::FillPolygon(const PlanePoint*, unsigned int, ColorQuad) noexcept {}
void PixelSpace::FillRectangle(const PlaneExtent&, ColorQuad, float) noexcept {}
void PixelSpace::FillRectangleBottomRounded(const PlaneExtent&, ColorQuad, float) noexcept {}
void PixelSpace::Text(float, float, ColorQuad, const char*, float) noexcept {}
void PixelSpace::PushClip(const PlaneExtent&) noexcept {}
void PixelSpace::PopClip() noexcept {}
void PixelSpace::PushTypeface(void*) noexcept {}
void PixelSpace::PopTypeface() noexcept {}
uint32_t PixelSpace::BeginGroup() const noexcept { return 0u; }
void PixelSpace::EndGroup(uint32_t, float, float, float, float, float, float) noexcept {}
bool PixelSpace::Begin(SurfaceLayer, float, float, float) noexcept { return false; }
// ⚠️ A real width, not zero. Text measurement decides chip widths and the search field's caret, and a zero
//    width would silently collapse layouts the proof is meant to be checking.
PlanePoint PixelSpace::MeasureText(const char* Utf8, float FontSizePixels) const noexcept
{
    const float Size = FontSizePixels > 0.0f ? FontSizePixels : 13.0f;
    uint32_t Count = 0u; if (Utf8) while (Utf8[Count]) ++Count;
    return PlanePoint{ static_cast<float>(Count) * Size * 0.52f, Size };
}

void GlyphSpace::Stroke(PixelSpace&, std::string_view, const GlyphPlacement&, float) noexcept {}

std::string_view VectorCodec::QueryControlCentreSvgPath(ControlCentreIconCategory) noexcept { return {}; }

ThemeStructure::ThemeStructure() noexcept = default;

const ThemePalette& ThemeStructure::QueryPalette() const noexcept
{
    // ⚠️ A realistic DARK palette, not a zeroed struct. The slider colours are derived from ActiveBackground
    //    and TextMain, so a palette of black-on-black would make the derivation look correct while proving
    //    nothing about it. These are the Notch dark values the kit is written against.
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
