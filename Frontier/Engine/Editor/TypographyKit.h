#pragma once
/*==========================================================================================================================================
                                                             TYPOGRAPHYKIT.H
==========================================================================================================================================*/
// 🧩 CSS-calibrated DM Sans typography helpers for Frontier Editor and FluidEditor ImGui surfaces.
//    DM Sans hhea ascent (992) + |descent| (310) = 1302 / 1000 em, so multiplying a CSS pixel font-size by 1.302
//    matches browser line-boxes and glyph metrics across ImGui 1.91+ and 1.92+.

#include <imgui.h>

#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstring>

namespace Frontier::Typography
{

constexpr float PiConstant    = 3.14159265358979323846f;
constexpr float EmScale       = 1.302f;   // [-] - (992 + 310) / 1000 for DM Sans
constexpr float AscentShare   = 0.992f;   // [-] - baseline offset inside line box

enum class TextAnchor : uint8_t
{
    Start  = 0,
    Middle = 1,
    End    = 2,
};

inline float Grind(float CssPx) noexcept
{
    return CssPx * EmScale;
}

inline ImFont* FallbackFont(ImFont* Preferred) noexcept
{
    return Preferred ? Preferred : ImGui::GetFont();
}

inline float MeasureTextWidth(ImFont* Face, float CssPx, const char* Body) noexcept
{
    if (!Body || !*Body)
        return 0.0f;
    ImFont* Resolved = FallbackFont(Face);
    if (!Resolved)
        return static_cast<float>(std::strlen(Body)) * CssPx * 0.55f;
    return Resolved->CalcTextSizeA(Grind(CssPx), FLT_MAX, 0.0f, Body).x;
}

inline void DrawBaselineText(ImDrawList* Draw, ImFont* Face, float X, float BaselineY, float CssPx,
                             ImU32 Colour, const char* Body, TextAnchor Side = TextAnchor::Start) noexcept
{
    if (!Draw || !Body || !*Body)
        return;
    ImFont* Resolved = FallbackFont(Face);
    ImVec2 Spot{ X, BaselineY - CssPx * AscentShare };
    if (Side != TextAnchor::Start)
    {
        const float Width = MeasureTextWidth(Resolved, CssPx, Body);
        Spot.x -= (Side == TextAnchor::Middle) ? (Width * 0.5f) : Width;
    }
    Draw->AddText(Resolved, Grind(CssPx), Spot, Colour, Body);
}

inline void DrawBoxText(ImDrawList* Draw, ImFont* Face, float X, float BoxTop, float BoxTall, float CssPx,
                        ImU32 Colour, const char* Body, TextAnchor Side = TextAnchor::Start) noexcept
{
    DrawBaselineText(Draw, Face, X, BoxTop + (BoxTall - Grind(CssPx)) * 0.5f + AscentShare * CssPx,
                     CssPx, Colour, Body, Side);
}

inline int DecodeUtf8Char(const char* Text, unsigned int& OutCodepoint) noexcept
{
    const unsigned char C0 = static_cast<unsigned char>(Text[0]);
    if (C0 == 0) { OutCodepoint = 0; return 0; }
    if (C0 < 0x80u) { OutCodepoint = C0; return 1; }
    if ((C0 & 0xE0u) == 0xC0u && Text[1])
    {
        OutCodepoint = ((C0 & 0x1Fu) << 6) | (static_cast<unsigned char>(Text[1]) & 0x3Fu);
        return 2;
    }
    if ((C0 & 0xF0u) == 0xE0u && Text[1] && Text[2])
    {
        OutCodepoint = ((C0 & 0x0Fu) << 12)
                     | ((static_cast<unsigned char>(Text[1]) & 0x3Fu) << 6)
                     | (static_cast<unsigned char>(Text[2]) & 0x3Fu);
        return 3;
    }
    if ((C0 & 0xF8u) == 0xF0u && Text[1] && Text[2] && Text[3])
    {
        OutCodepoint = ((C0 & 0x07u) << 18)
                     | ((static_cast<unsigned char>(Text[1]) & 0x3Fu) << 12)
                     | ((static_cast<unsigned char>(Text[2]) & 0x3Fu) << 6)
                     | (static_cast<unsigned char>(Text[3]) & 0x3Fu);
        return 4;
    }
    OutCodepoint = '?';
    return 1;
}

inline float MeasureTrackedWidth(ImFont* Face, float CssPx, const char* Body, float LetterSpacing) noexcept
{
    if (!Body || !*Body)
        return 0.0f;
    ImFont* Resolved = FallbackFont(Face);
    const float FontSize = Grind(CssPx);
    float Run = 0.0f;
    for (const char* Scan = Body; *Scan;)
    {
        unsigned int Point = 0u;
        const int Used = DecodeUtf8Char(Scan, Point);
        if (Used <= 0)
            break;
        if (Resolved)
            Run += Resolved->CalcTextSizeA(FontSize, FLT_MAX, 0.0f, Scan, Scan + Used).x + LetterSpacing;
        else
            Run += CssPx * 0.55f + LetterSpacing;
        Scan += Used;
    }
    return Run;
}

inline float DrawTrackedText(ImDrawList* Draw, ImFont* Face, float X, float BoxTop, float BoxTall,
                             float CssPx, ImU32 Colour, const char* Body, float LetterSpacing) noexcept
{
    if (!Draw || !Body || !*Body)
        return 0.0f;
    ImFont* Resolved     = FallbackFont(Face);
    const float FontSize = Grind(CssPx);
    const float TopY     = BoxTop + (BoxTall - FontSize) * 0.5f;
    float Pen            = X;
    for (const char* Scan = Body; *Scan;)
    {
        unsigned int Point = 0u;
        const int Used = DecodeUtf8Char(Scan, Point);
        if (Used <= 0)
            break;
        Draw->AddText(Resolved, FontSize, { Pen, TopY }, Colour, Scan, Scan + Used);
        Pen += Resolved->CalcTextSizeA(FontSize, FLT_MAX, 0.0f, Scan, Scan + Used).x + LetterSpacing;
        Scan += Used;
    }
    return Pen - X;
}

struct WrappedSpan
{
    const char* From = nullptr;
    const char* To   = nullptr;
};

inline int WrapProseLines(ImFont* Face, float CssPx, const char* Body, float MaxWidth,
                          WrappedSpan* OutLines, int MaxLines) noexcept
{
    if (!Body || !*Body || MaxLines <= 0)
        return 0;
    int Count = 0;
    const char* Start = Body;
    while (*Start && Count < MaxLines)
    {
        const char* Best = nullptr;
        for (const char* Scan = Start;; ++Scan)
        {
            const bool EndOfText = (*Scan == '\0');
            if (*Scan == ' ' || EndOfText)
            {
                char Piece[256];
                const size_t Taken = std::min(sizeof(Piece) - 1u, static_cast<size_t>(Scan - Start));
                std::memcpy(Piece, Start, Taken);
                Piece[Taken] = '\0';
                if (MeasureTextWidth(Face, CssPx, Piece) <= MaxWidth || !Best)
                    Best = Scan;
                else
                    break;
                if (EndOfText)
                    break;
            }
        }
        OutLines[Count++] = { Start, Best };
        Start = Best;
        while (*Start == ' ')
            ++Start;
    }
    return Count;
}

} // namespace Frontier::Typography
