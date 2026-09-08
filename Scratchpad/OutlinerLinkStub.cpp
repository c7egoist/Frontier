// Link stub for the headless outliner proof. Record() draws, and drawing reaches ImGui through PixelSpace and
//    ControlKit's glyph raster. The proof only exercises tree structure, search, twirl and rename — all of which
//    are computed before anything is painted — so the paint entry points are satisfied here rather than dragging
//    an immediate-mode UI and a font atlas into a build-time test.
#include "DisplayPresentation/ControlKit.h"
#include "DisplayPresentation/PixelSpace.h"

namespace Frontier {

void PixelSpace::PushClip(const PlaneExtent&) noexcept {}
void PixelSpace::PopClip() noexcept {}
void PixelSpace::FillRectangle(const PlaneExtent&, ColorQuad, float) noexcept {}
void PixelSpace::Text(float, float, ColorQuad, const char*, float) noexcept {}
PlanePoint PixelSpace::MeasureText(const char* Utf8, float FontSizePixels) const noexcept
{
    // Monospace approximation: enough for caret arithmetic, and the proof never asserts on pixel widths.
    unsigned int N = 0u; if (Utf8) while (Utf8[N]) ++N;
    const float Size = FontSizePixels > 0.0f ? FontSizePixels : 12.5f;
    return PlanePoint{ static_cast<float>(N) * Size * 0.5f, Size };
}

ControlKitPalette ControlKit::ActivePalette{};
void ControlKit::GlyphCentred(PixelSpace&, const PlaneExtent&, float, ColorQuad, ControlCentreIconCategory, float) noexcept {}
void ControlKit::OutlineRounded(PixelSpace&, const PlaneExtent&, ColorQuad, float, float) noexcept {}
ControlHit ControlKit::TextEntry(PixelSpace&, const PlaneExtent& Extent, TextEntryState&,
                                 const ControlPointer& Pointer, float, float) noexcept
{
    ControlHit Hit{};
    Hit.Hovered = Over(Extent, Pointer);
    Hit.Pressed = Hit.Hovered && Pointer.Pressed;
    Hit.Clicked = Hit.Hovered && Pointer.Released;
    return Hit;
}

} // namespace Frontier
