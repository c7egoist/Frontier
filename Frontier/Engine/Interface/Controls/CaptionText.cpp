/*==========================================================================================================================================
                                                              CAPTIONTEXT.CPP
==========================================================================================================================================*/
// 🧩 .co-caption: the small note under a diagram or a control group.

#include "Engine/Interface/Controls/CaptionText.h"

#include "Engine/Interface/Controls/ControlColumn.h"
#include "Engine/Interface/Controls/GlyphRun.h"
#include "Engine/Interface/InspectorControls.h"

#include <imgui_internal.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                    CAPTION TEXT
//------------------------------------------------------------------------------------------------------------------------

void CaptionText::Construct(ControlColumn& Column, const char* Text, float MarginTop, float MarginBottom)
{
    const ControlTheme&    Theme    = Column.QueryTheme();
    const EditorTypefaces& Faces    = Column.QueryFaces();
    const float            Scale    = Column.QueryScale();
    const float            Width    = Column.QueryWidth();
    // 📝 .co-caption: 10 px / 1.6.
    const float  Height = ParagraphBlock::Construct(Column, Faces.Regular, 10.0f * Scale, 1.6f, Column.QueryCursor(), Width, Theme.Caption, Text, true) / Scale;
    const ImVec2 Top    = Column.Space(Height, MarginTop, MarginBottom);
    (void)ParagraphBlock::Construct(Column, Faces.Regular, 10.0f * Scale, 1.6f, Top, Width, Theme.Caption, Text);
}

} // namespace Frontier
