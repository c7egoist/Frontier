/*==========================================================================================================================================
                                                              CONTROLTHEME.CPP
==========================================================================================================================================*/
// 🧩 Page colours after each stylesheet cascade (CloudInspector.css, SunInspector.css,
//    AtmosphereInspector.css …), one resolver per page family.

#include "Engine/Interface/Controls/ControlTheme.h"


namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                    THEMES
//------------------------------------------------------------------------------------------------------------------------

ControlTheme ControlTheme::ResolveCloud() noexcept
{
    // 📝 CloudInspector.css on its own (the cloud page's base, before its page rules).
    ControlTheme Theme;
    Theme.PageFill            = ResolveCssColour(0x151915FF);
    Theme.Ink                 = ResolveCssColour(0xE5EDDAFF);
    Theme.Muted               = ResolveCssColour(0x8F9A88FF);
    Theme.Accent              = ResolveCssColour(0xD5E6A5FF);
    Theme.Eyebrow             = ResolveCssColour(0x8E988CFF);
    Theme.Subtitle            = Theme.Muted;
    Theme.CardHeading         = ResolveCssColour(0xDCE1D4FF);
    Theme.Index               = ResolveCssColour(0x7F8D78FF);
    Theme.Label               = ResolveCssColour(0x929B8BFF);
    Theme.ReadoutUnit         = ResolveCssColour(0x909985FF);
    Theme.Caption             = ResolveCssColour(0x8F9A88FF);
    Theme.ControlLabel        = ResolveCssColour(0x8F9A88FF);
    Theme.CardBorder          = ResolveCssColour(0xFFFFFF07);
    Theme.TabRailFill         = ResolveCssColour(0x1C201CFF);
    Theme.TabRailBorder       = ResolveCssColour(0xFFFFFF07);
    Theme.TabText             = ResolveCssColour(0x8F988AFF);
    Theme.TabSelectedFill     = ResolveCssColour(0x30382DFF);
    Theme.TabSelectedText     = ResolveCssColour(0xE0E9CDFF);
    Theme.TabSelectedRing     = ResolveCssColour(0xD5E6A512);
    Theme.TabHoverFill        = ResolveCssColour(0x2C3329FF);
    Theme.TabHoverText        = ResolveCssColour(0xEEF1E7FF);
    Theme.MetricFill          = ResolveCssColour(0x20251FFF);
    Theme.MetricBorder        = ResolveCssColour(0xFFFFFF05);
    Theme.MetricLeadFill      = ResolveCssColour(0xD5E6A5FF);
    Theme.MetricLeadInk       = ResolveCssColour(0x222C19FF);
    Theme.MetricLeadMuted     = ResolveCssColour(0x576443FF);
    Theme.TagFill             = ResolveCssColour(0xD5E6A50A);
    Theme.TagBorder           = ResolveCssColour(0xD5E6A51A);
    Theme.TagText             = ResolveCssColour(0xCCD9B7FF);
    Theme.ModeFill            = ResolveCssColour(0xD5E6A514);
    Theme.ModeBorder          = ResolveCssColour(0x56624855);
    Theme.ModeText            = ResolveCssColour(0xD5E6A5FF);
    Theme.ModeHoverFill       = ResolveCssColour(0xD5E6A524);
    Theme.NextFill            = ResolveCssColour(0xD5E6A50D);
    Theme.NextBorder          = ResolveCssColour(0xD5E6A522);
    Theme.NextText            = ResolveCssColour(0xCBD8B5FF);
    Theme.NextHoverFill       = ResolveCssColour(0xD5E6A51C);
    Theme.NextHoverBorder     = ResolveCssColour(0xD5E6A555);
    Theme.SliderRule          = ResolveCssColour(0xFFFFFF0A);
    Theme.SliderEmpty         = ResolveCssColour(0xFFFFFF12);
    Theme.ThumbRing           = ResolveCssColour(0x24281FFF);
    Theme.ThumbHalo           = ResolveCssColour(0xFFFFFF22);
    Theme.SliderNumber        = Theme.Ink;
    Theme.SliderUnit          = Theme.Muted;
    Theme.FieldRowText         = ResolveCssColour(0xA2AC99FF);
    Theme.FieldRowRule         = ResolveCssColour(0xFFFFFF0A);
    Theme.SelectFill          = ResolveCssColour(0x161C14FF);
    Theme.SelectBorder        = ResolveCssColour(0x414B3866);
    Theme.SelectText          = ResolveCssColour(0xD8E2CCFF);
    Theme.PresetFill          = Theme.MetricFill;
    Theme.PresetBorder        = Theme.TagBorder;
    Theme.PresetText          = Theme.TagText;
    Theme.PresetPressedFill   = Theme.TabSelectedFill;
    Theme.PresetPressedBorder = Theme.NextHoverBorder;
    Theme.PresetPressedText   = Theme.TabSelectedText;
    Theme.ToggleFill          = ResolveCssColour(0x12181066);
    Theme.ToggleBorder        = ResolveCssColour(0xFFFFFF09);
    Theme.ToggleText          = ResolveCssColour(0xABB7A0FF);
    Theme.ToggleCaption       = ResolveCssColour(0x8E9889FF);
    Theme.ToggleCaptionOn     = ResolveCssColour(0xD5E6A5FF);
    Theme.FooterText          = ResolveCssColour(0x697760FF);
    Theme.FooterRule          = ResolveCssColour(0xFFFFFF0A);
    Theme.AtlasFooterText     = ResolveCssColour(0x8E9A8AFF);
    Theme.AtlasFooterRule     = ResolveCssColour(0xFFFFFF0B);
    return Theme;
}

ControlTheme ControlTheme::ResolveSolar() noexcept
{
    // 📝 SunInspector.css over CloudInspector.css; its second block (the neutral olive page) wins where both set a rule.
    ControlTheme Theme    = ResolveCloud();
    Theme.PageFill            = ResolveCssColour(0x191917FF);
    Theme.Ink                 = ResolveCssColour(0xE8E7DFFF);
    Theme.Muted               = ResolveCssColour(0x9A988EFF);
    Theme.Accent              = ResolveCssColour(0xE3D2A6FF);
    Theme.Eyebrow             = ResolveCssColour(0xA09680FF);
    Theme.Subtitle            = ResolveCssColour(0xA19786FF);
    Theme.CardHeading         = ResolveCssColour(0xE7DFCDFF);
    Theme.Index               = ResolveCssColour(0xA0967DFF);
    Theme.Label               = ResolveCssColour(0xAD9F83FF);
    Theme.ReadoutUnit         = ResolveCssColour(0xA09478FF);
    Theme.Caption             = ResolveCssColour(0xA3977EFF);
    Theme.ControlLabel        = ResolveCssColour(0xB3A58AFF);
    Theme.CardBorder          = ResolveCssColour(0xF0D99C09);
    Theme.TabRailFill         = 0;
    Theme.TabRailBorder       = 0;
    Theme.TabText             = ResolveCssColour(0xA79D87FF);
    Theme.TabSelectedFill     = ResolveCssColour(0x343329FF);
    Theme.TabSelectedText     = ResolveCssColour(0xE7DFC8FF);
    Theme.TabSelectedRing     = ResolveCssColour(0xE8C78B1A);
    Theme.TabHoverFill        = ResolveCssColour(0x352F24FF);
    Theme.TabHoverText        = ResolveCssColour(0xF4DFB9FF);
    Theme.MetricFill          = ResolveCssColour(0x262720FF);
    Theme.MetricLeadFill      = ResolveCssColour(0xD7DBB8FF);
    Theme.MetricLeadInk       = ResolveCssColour(0x292E20FF);
    Theme.MetricLeadMuted     = ResolveCssColour(0x626B51FF);
    Theme.TagFill             = ResolveCssColour(0xE8C78B0C);
    Theme.TagBorder           = ResolveCssColour(0xE8C78B28);
    Theme.TagText             = ResolveCssColour(0xE8C78BFF);
    Theme.ModeFill            = ResolveCssColour(0xE8C78B0B);   // .so-reset
    Theme.ModeBorder          = ResolveCssColour(0xE8C78B22);
    Theme.ModeText            = ResolveCssColour(0xD5BF95FF);
    Theme.ModeHoverFill       = ResolveCssColour(0xE8C78B1C);
    Theme.NextFill            = ResolveCssColour(0xE8C78B0C);
    Theme.NextBorder          = ResolveCssColour(0xE8C78B22);
    Theme.NextText            = ResolveCssColour(0xE8C78BFF);
    Theme.NextHoverFill       = ResolveCssColour(0xE8C78B20);
    Theme.NextHoverBorder     = ResolveCssColour(0xE8C78B55);
    Theme.SliderNumber        = Theme.Ink;
    Theme.SliderUnit          = Theme.Muted;
    Theme.FieldRowText         = ResolveCssColour(0xB8AD96FF);
    Theme.FieldRowRule         = ResolveCssColour(0xE8C78B10);
    Theme.SelectFill          = ResolveCssColour(0x211E17FF);
    Theme.SelectBorder        = ResolveCssColour(0xE8C78B22);
    Theme.SelectText          = ResolveCssColour(0xE9D7B6FF);
    Theme.PresetFill          = ResolveCssColour(0x25231CFF);
    Theme.PresetBorder        = ResolveCssColour(0xE8C78B12);
    Theme.PresetText          = ResolveCssColour(0xBBAE91FF);
    Theme.PresetPressedFill   = ResolveCssColour(0x4E3E23FF);
    Theme.PresetPressedBorder = ResolveCssColour(0xE8C78B44);
    Theme.PresetPressedText   = ResolveCssColour(0xF4D6A0FF);
    Theme.FooterText          = ResolveCssColour(0xA29473FF);
    Theme.FooterRule          = ResolveCssColour(0xE8C78B10);
    Theme.AtlasFooterText     = ResolveCssColour(0xAD9F83FF);
    Theme.AtlasFooterRule     = ResolveCssColour(0xE8C78B12);
    return Theme;
}

ControlTheme ControlTheme::ResolveAtmosphere() noexcept
{
    // 📝 AtmosphereInspector.css over CloudInspector.css.
    ControlTheme Theme = ResolveCloud();
    Theme.Eyebrow          = ResolveCssColour(0x8C9783FF);
    Theme.Subtitle         = ResolveCssColour(0x9AA38FFF);
    Theme.ModeFill         = ResolveCssColour(0xD6E3A60C);
    Theme.ModeBorder       = ResolveCssColour(0xD6E3A626);
    Theme.ModeText         = ResolveCssColour(0xD6E3A6FF);
    Theme.TabRailFill      = 0;
    Theme.TabRailBorder    = 0;
    Theme.TabSelectedFill  = ResolveCssColour(0x343A2CFF);
    Theme.TabSelectedText  = ResolveCssColour(0xE0E9C7FF);
    Theme.TabSelectedRing  = 0;
    Theme.TabHoverFill     = ResolveCssColour(0x2A3125FF);
    Theme.TabHoverText     = ResolveCssColour(0xE0E9C7FF);
    Theme.CardBorder       = 0;
    Theme.Index            = ResolveCssColour(0x8C9A7DFF);
    Theme.CardHeading      = ResolveCssColour(0xDDE5D0FF);
    Theme.Caption          = ResolveCssColour(0x96A18BFF);
    Theme.TagFill          = ResolveCssColour(0xD6E3A608);
    Theme.TagText          = ResolveCssColour(0xC1D3A3FF);
    Theme.TagBorder        = ResolveCssColour(0xD6E3A620);
    Theme.Label            = ResolveCssColour(0x95A383FF);
    Theme.ReadoutUnit      = ResolveCssColour(0x95A383FF);
    Theme.MetricFill       = ResolveCssColour(0x252B21FF);
    Theme.MetricBorder     = 0;
    Theme.MetricLeadFill   = ResolveCssColour(0xD7E3ADFF);
    Theme.MetricLeadInk    = ResolveCssColour(0x2D3823FF);
    Theme.MetricLeadMuted  = ResolveCssColour(0x687951FF);
    Theme.ToggleFill       = ResolveCssColour(0x171D14FF);
    Theme.ToggleText       = ResolveCssColour(0xBCC9ABFF);
    Theme.ToggleBorder     = ResolveCssColour(0xD6E3A615);
    Theme.ToggleCaptionOn  = ResolveCssColour(0xD6E3A6FF);
    Theme.FooterText       = ResolveCssColour(0x7C8E69FF);
    Theme.FooterRule       = ResolveCssColour(0xD6E3A615);
    Theme.ControlLabel     = ResolveCssColour(0x9CAB8BFF);
    return Theme;
}

} // namespace Frontier
