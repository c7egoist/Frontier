#!/usr/bin/env python3
# ======================================================================================================================
# DriveLevelPatch.py -- teach the engine's own ReSTIR host about the Project-Drive level.
#
# WHY A PATCH AND NOT A FORK.  MaterialLevelViewport.cpp is the CPU mirror of the shipped renderer: it transcribes
# ReSTIRViewport.slang's ResolveMaterial and compiles MaterialEvaluation.slang 1:1 as C++, so it is the only place
# a CPU render can show the finite-flake paint, the clearcoat and real glass refraction exactly as the product
# does.  Copying 3000 lines of it into the Slate overlay would fork the renderer and rot on the next engine bump,
# and writing a second renderer is explicitly out of bounds.  So the file is patched in place at seat time with
# three small, anchored edits, and the patch FAILS LOUDLY if an anchor moves.
#
# The edits are deliberately minimal because BuildLevel() is already level-agnostic below the Construct() call:
# DriveSceneAuthor exposes the same QueryTriangles / QueryCornerNormals / QueryMaterials / QuerySpans interface
# that MaterialSwatchStructure and ShowcaseStructure do.
# ======================================================================================================================
import sys

TARGET = 'Projects/Project-Zero/Host/MaterialLevelViewport.cpp'


# Each edit is (description, anchor, replacement).  A missing anchor is a hard error.
def edits():
    return [
        # 1 ------------------------------------------------------------------------------------------- include
        ("include the Drive level author",
         '#include "../../../Engine/GeometricRaster/SceneStructure.h"',
         '#include "../../../Engine/GeometricRaster/SceneStructure.h"\n'
         '#include "../../Project-Drive/Source/DriveSceneAuthor.h"'),

        # 2 ------------------------------------------------------------------------------------------- construct
        ("build the drive level alongside the two stock levels",
         '    MaterialSwatchStructure Library;\n'
         '    ShowcaseStructure       Showcase;\n'
         '    const bool IsShowcase = (g_Level == "showcase");\n'
         '    if (IsShowcase) Showcase.Construct(); else Library.Construct();',
         '    MaterialSwatchStructure Library;\n'
         '    ShowcaseStructure       Showcase;\n'
         '    // Project-Drive: the same authored soup the visibility-raster mirror draws, so the three render\n'
         '    // modes differ ONLY in the light transport, never in the geometry or the materials.\n'
         '    Frontier::Drive::DriveSceneAuthor Drive;\n'
         '    const bool IsDrive    = (g_Level == "drive");\n'
         '    const bool IsShowcase = (g_Level == "showcase");\n'
         '    if (IsDrive)         Drive.Construct(/*StaticPose=*/true);\n'
         '    else if (IsShowcase) Showcase.Construct();\n'
         '    else                 Library.Construct();'),

        # 3 ------------------------------------------------------------------------------------------- selectors
        ("select the drive level's soup",
         '    const std::vector<Frontier::TriangleIndex>&      Tris     = IsShowcase ? Showcase.QueryTriangles()     : Library.QueryTriangles();\n'
         '    const std::vector<Frontier::Vector3>&            Corners  = IsShowcase ? Showcase.QueryCornerNormals() : Library.QueryCornerNormals();\n'
         '    const std::vector<Frontier::MaterialDescriptor>& Authored = IsShowcase ? Showcase.QueryMaterials()     : Library.QueryMaterials();',
         '    const std::vector<Frontier::TriangleIndex>&      Tris     = IsDrive ? Drive.QueryTriangles()     : IsShowcase ? Showcase.QueryTriangles()     : Library.QueryTriangles();\n'
         '    const std::vector<Frontier::Vector3>&            Corners  = IsDrive ? Drive.QueryCornerNormals() : IsShowcase ? Showcase.QueryCornerNormals() : Library.QueryCornerNormals();\n'
         '    const std::vector<Frontier::MaterialDescriptor>& Authored = IsDrive ? Drive.QueryMaterials()     : IsShowcase ? Showcase.QueryMaterials()     : Library.QueryMaterials();'),

        # 4 ------------------------------------------------------------------------------------------- spans
        ("select the drive level's spans",
         '    const std::vector<Frontier::TriangleSpanRecord>& Spans = IsShowcase ? Showcase.QuerySpans() : Library.QuerySpans();',
         '    const std::vector<Frontier::TriangleSpanRecord>& Spans = IsDrive ? Drive.QuerySpans() : IsShowcase ? Showcase.QuerySpans() : Library.QuerySpans();'),

        # 5 ------------------------------------------------------------------------------------------- framings
        ("add the drive level's camera framings",
         'Viewpoint ShowcaseViewpointFor(const std::string& Name)\n{',
         '// Project-Drive framings.  The car rests at the origin with +X forward and +Z up.\n'
         '//\n'
         '// Yaw here is the host\'s own convention: CLOCKWISE FROM NORTH (+Y), so yaw 90 looks along +X.  That makes\n'
         '// the yaw needed to look from an eye at the car atan2(dx, dy) -- NOT atan2(dy, dx).  Getting that backwards\n'
         '// aims every camera away from the subject and renders an empty checkerboard, which is exactly what the\n'
         '// first attempt produced.  The values below are computed from the eye/target pairs, not guessed.\n'
         'Viewpoint DriveViewpointFor(const std::string& Name)\n'
         '{\n'
         '    if (Name == "front-quarter") return { Frontier::Vector3{  6.60f, -5.60f, 2.30f }, -10.5f, -49.7f, 46.0f };\n'
         '    if (Name == "side")          return { Frontier::Vector3{  0.20f, -8.20f, 1.55f },  -5.9f,  -1.4f, 42.0f };\n'
         '    if (Name == "wheel")         return { Frontier::Vector3{  2.90f, -2.60f, 0.85f },  -6.0f, -17.8f, 40.0f };\n'
         '    // Default: the rear three-quarter the material sheets use.\n'
         '    return { Frontier::Vector3{ -6.40f, -5.40f, 2.20f }, -10.2f, 49.8f, 46.0f };\n'
         '}\n\n'
         'Viewpoint ShowcaseViewpointFor(const std::string& Name)\n{'),
    ]


def apply(text):
    applied = []
    for name, anchor, replacement in edits():
        if anchor not in text:
            raise SystemExit('DriveLevelPatch: anchor moved, refusing to patch blindly -- "%s"' % name)
        if replacement.split('\n')[0] in text and name == 'include the Drive level author' \
                and '../../Project-Drive/Source/DriveSceneAuthor.h' in text:
            applied.append(name + ' (already present)')
            continue
        text = text.replace(anchor, replacement, 1)
        applied.append(name)
    return text, applied


def patch_viewpoint_dispatch(text):
    """Route --view through DriveViewpointFor when the drive level is selected."""
    anchor = 'const Viewpoint VP = (g_Level == "showcase") ? ShowcaseViewpointFor(View) : ViewpointFor(View);'
    if anchor not in text:
        raise SystemExit('DriveLevelPatch: viewpoint dispatch anchor moved')
    return text.replace(anchor,
                        'const Viewpoint VP = (g_Level == "drive")    ? DriveViewpointFor(View)\n'
                        '                   : (g_Level == "showcase") ? ShowcaseViewpointFor(View)\n'
                        '                   :                           ViewpointFor(View);')


def main(seat):
    import pathlib, os
    path = pathlib.Path(seat) / TARGET
    text = path.read_text()
    if 'DriveViewpointFor' in text:
        print('[drive-level] already patched')
        return 0
    text, applied = apply(text)
    text = patch_viewpoint_dispatch(text)
    # ⚠️ The seat is hardlinked to the pinned Frontier checkout (`cp -al`), so writing through the path would
    # edit the ENGINE, not the seat -- silently, and in a directory that is supposed to be a pristine mirror of
    # a fixed revision.  Unlink first so the write lands on a fresh inode belonging to the seat alone.
    if path.exists() and path.stat().st_nlink > 1:
        os.unlink(path)
    path.write_text(text)
    for a in applied:
        print('[drive-level] %s' % a)
    print('[drive-level] patched %s' % TARGET)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
