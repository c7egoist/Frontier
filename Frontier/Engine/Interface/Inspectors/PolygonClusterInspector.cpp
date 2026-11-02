/*==========================================================================================================================================
                                                        POLYGONCLUSTERINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 PolygonClusterConfiguration: the cluster hierarchy, with its PolygonClusterEditor.

#include "Engine/Interface/Inspectors/PolygonClusterInspector.h"

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

#include "Engine/Interface/DiagramControls.h"
#include "Engine/Interface/InspectorControls.h"
#include "Engine/Interface/PolygonClusterEditor.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>

#endif

namespace Frontier
{

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

void PolygonClusterInspector::ConstructEditor(RecordToken Token)
{
    PolygonClusterEditor::ConstructInterface(Token, *this);
}

void PolygonClusterInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Hi-Z Occlusion", "Pyramid cull", &Parameters.HiZOcclusionCulling});
    OutSwitches.push_back({"Freeze Frustum", "Lock cut", &Parameters.FreezeCullingFrustum});
}

void PolygonClusterInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    char VisBuf[32]{};
    char CullBuf[32]{};
    std::snprintf(VisBuf, sizeof(VisBuf), "%u", Parameters.VisibleClusterCount);
    std::snprintf(CullBuf, sizeof(CullBuf), "%u", Parameters.CulledClusterCount);
    const std::array<InspectorReadoutCell, 2> Cells = {{
        {"VISIBLE CLUSTERS", VisBuf},
        {"HI-Z CULLED", CullBuf},
    }};
    InspectorControls::ConstructReadoutStrip(Palette, Faces, Cells.data(), Cells.size());

    bool Changed = false;
    Changed |= InspectorControls::ConstructIntegerSliderRow(Palette, Faces, "##DagDepth", "Hierarchy Depth", Parameters.HierarchyDepth, 2u, 12u);
    Changed |= InspectorControls::ConstructIntegerSliderRow(Palette, Faces, "##MaxTris", "Triangles / Cluster", Parameters.MaxClusterTriangles, 32u, 256u);
    Changed |= InspectorControls::ConstructIntegerSliderRow(Palette, Faces, "##LodErr", "Error Threshold", Parameters.LodErrorThresholdPx, 1u, 8u, " px");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void PolygonClusterInspector::ConstructEditor(RecordToken) {}
void PolygonClusterInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void PolygonClusterInspector::ConstructInspector() {}

#endif

} // namespace Frontier
