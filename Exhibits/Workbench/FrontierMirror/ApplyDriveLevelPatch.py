#!/usr/bin/env python3
# ======================================================================================================================
# ApplyDriveLevelPatch.py -- teach Project-Zero's MaterialLevelViewport to build the Project-Drive level.
#
# WHY THIS EXISTS.  The Drive gallery was rendered with Engine/GeometricRaster/VisibilityRaster, the shipped
# GI-off / RT-off path.  That path has no specular lobe, no transmission and no flake evaluation, so a metallic
# flake basecoat under a clearcoat and a transmissive glazing cannot appear under it no matter how they are
# authored -- the car necessarily reads flat.  The renderer that DOES evaluate them is already in the engine:
# Projects/Project-Zero/Host/MaterialLevelViewport.cpp, which carries the CPU mirror of the reference path tracer
# and the ReSTIR DI estimator, and which already reads SlateGlintDensity / SlateGlintUvScale per material.
#
# WHAT IT CHANGES.  MaterialLevelViewport::BuildLevel is already level-agnostic: it consumes a Structure through
# QueryTriangles / QueryCornerNormals / QueryMaterials / QuerySpans and everything downstream is generic.
# DriveSceneAuthor exposes that same four-method interface, because it was written to the ShowcaseStructure
# pattern.  So this adds a third level alongside `materials` and `showcase` rather than forking the renderer.
# Nothing about the shading, sampling or estimator is touched -- the point is to run the engine's own renderer
# over the Drive scene, not to write one.
#
# The patch is applied to the SEATED copy under _AgentScratch, never to the pinned checkout, and is idempotent.
# ======================================================================================================================
import sys, pathlib

TARGET = 'Projects/Project-Zero/Host/MaterialLevelViewport.cpp'
MARK = '// [drive-level]'


def patch(text: str) -> str:
    if MARK in text:
        return text

    # ---- 1. the level's builder ------------------------------------------------------------------------------
    anchor = '#include "ContentInterchange/ShowcaseStructure.h"'
    if anchor not in text:
        # fall back to the first ShowcaseStructure include spelling the checkout happens to use
        for cand in ('#include "ShowcaseStructure.h"', '#include "ContentInterchange/MaterialSwatchStructure.h"'):
            if cand in text:
                anchor = cand
                break
        else:
            raise SystemExit('ApplyDriveLevelPatch: no ShowcaseStructure include to anchor against')
    text = text.replace(anchor, anchor + '\n#include "DriveSceneAuthor.h"   %s' % MARK, 1)

    # ---- 2. construct the drive level -------------------------------------------------------------------------
    old = ('    MaterialSwatchStructure Library;\n'
           '    ShowcaseStructure       Showcase;\n'
           '    const bool IsShowcase = (g_Level == "showcase");\n'
           '    if (IsShowcase) Showcase.Construct(); else Library.Construct();')
    new = ('    MaterialSwatchStructure Library;\n'
           '    ShowcaseStructure       Showcase;\n'
           '    Frontier::Drive::DriveSceneAuthor Drive;   %s\n'
           '    const bool IsShowcase = (g_Level == "showcase");\n'
           '    const bool IsDrive = (g_Level == "drive");   %s\n'
           '    if (IsDrive) Drive.Construct(); else if (IsShowcase) Showcase.Construct(); else Library.Construct();'
           % (MARK, MARK))
    if old not in text:
        raise SystemExit('ApplyDriveLevelPatch: BuildLevel construct block did not match')
    text = text.replace(old, new, 1)

    # ---- 3. three-way source selection ------------------------------------------------------------------------
    for query, kind in (('QueryTriangles', 'Frontier::TriangleIndex'),
                        ('QueryCornerNormals', 'Frontier::Vector3'),
                        ('QueryMaterials', 'Frontier::MaterialDescriptor'),
                        ('QuerySpans', 'Frontier::TriangleSpanRecord')):
        hit = [l for l in text.splitlines() if query + '()' in l and 'IsShowcase ?' in l]
        if not hit:
            raise SystemExit('ApplyDriveLevelPatch: no selector line for %s' % query)
        line = hit[0]
        text = text.replace(line, line.replace('IsShowcase ?', 'IsDrive ? Drive.%s() : IsShowcase ?' % query, 1), 1)

    # ---- 4. the interface panel is a showcase fixture; the drive level has its own HUD -------------------------
    text = text.replace('if (IsShowcase && !BuildInterfacePanel',
                        'if (IsShowcase && !IsDrive && !BuildInterfacePanel', 1)

    # ---- 5. viewpoints ----------------------------------------------------------------------------------------
    # Framings chosen to put the paint, the glazing and the wheels across the frame at a legible distance.
    # They are plain Viewpoints in the host's existing struct; no new camera code.
    vp = '''
%s Drive-level framings.  The car is ~6.2 m long, +X forward / +Y left / +Z up, with its CoM 0.53 m up.
// Rather than hand-writing pitch/yaw pairs (which is how the first attempt put the car off-frame entirely),
// derive them from an eye and a look-at target.  Yaw convention is the host's own: 0 deg = +Y forward,
// +90 deg = +X forward.
static Viewpoint DriveLookAt(float EyeX, float EyeY, float EyeZ, float AtX, float AtY, float AtZ, float Fov)
{
    const float Dx = AtX - EyeX, Dy = AtY - EyeY, Dz = AtZ - EyeZ;
    const float Flat = std::sqrt(Dx * Dx + Dy * Dy);
    const float Degrees = 57.29577951f;
    return { Frontier::Vector3{ EyeX, EyeY, EyeZ },
             std::atan2(Dz, Flat) * Degrees, std::atan2(Dx, Dy) * Degrees, Fov };
}

static Viewpoint DriveViewpointFor(const std::string& Name)
{
    if (Name == "rear-quarter")  return DriveLookAt(-6.90f, -5.00f, 2.50f,  0.00f, 0.0f, 0.60f, 44.0f);
    if (Name == "side")          return DriveLookAt( 0.20f, -9.20f, 1.55f,  0.20f, 0.0f, 0.70f, 40.0f);
    if (Name == "front")         return DriveLookAt( 9.40f, -0.30f, 1.70f,  0.00f, 0.0f, 0.70f, 40.0f);
    if (Name == "paint")         return DriveLookAt( 2.30f, -3.30f, 1.45f,  0.00f, 0.0f, 0.80f, 36.0f);
    if (Name == "glass")         return DriveLookAt( 1.10f, -4.10f, 2.30f,  0.00f, 0.0f, 1.00f, 38.0f);
    if (Name == "wheel")         return DriveLookAt( 3.10f, -2.60f, 0.85f,  1.73f, 0.0f, 0.50f, 34.0f);
    return DriveLookAt(6.60f, -5.20f, 2.60f, 0.0f, 0.0f, 0.60f, 44.0f);   // front-quarter
}
''' % MARK
    # place it directly before the showcase viewpoint chooser so both live together
    for fn in ('static Viewpoint ShowcaseViewpointFor', 'Viewpoint ShowcaseViewpointFor'):
        if fn in text:
            text = text.replace(fn, vp + fn, 1)
            break
    else:
        raise SystemExit('ApplyDriveLevelPatch: no ShowcaseViewpointFor to anchor the drive framings against')

    old_pick = 'const Viewpoint VP = (g_Level == "showcase") ? ShowcaseViewpointFor(View) : ViewpointFor(View);'
    if old_pick not in text:
        raise SystemExit('ApplyDriveLevelPatch: viewpoint selection did not match')
    text = text.replace(old_pick,
                        'const Viewpoint VP = (g_Level == "drive")     ? DriveViewpointFor(View)   %s\n'
                        '                     : (g_Level == "showcase") ? ShowcaseViewpointFor(View)\n'
                        '                     :                           ViewpointFor(View);' % MARK, 1)

    # ---- 6. usage string ---------------------------------------------------------------------------------------
    text = text.replace('[--level materials|showcase]', '[--level materials|showcase|drive]')
    return text


MAKE_TARGET = 'Projects/Project-Zero/Host/Makefile'
# DriveSceneAuthor pulls VehicleGeometry in for the frame contract (CoMModelZ / ModelGroundOffset).
DRIVE_SOURCES = ['../../../Projects/Project-Drive/Source/DriveSceneAuthor.cpp',
                 '../../../Engine/PhysicalDynamics/Vehicle/VehicleGeometry.cpp']
DRIVE_INCLUDES = ['-I../../../Projects/Project-Drive/Source',
                  '-I../../../Engine/PhysicalDynamics/Vehicle']


def patch_makefile(text: str) -> str:
    """Add the Drive translation units to the MaterialLevelViewport target."""
    if '[drive-level]' in text:
        return text
    anchor = '\t\t../../../Engine/GeometricRaster/CameraProjection.cpp \\\n'
    if anchor not in text:
        raise SystemExit('ApplyDriveLevelPatch: no CameraProjection line in the Makefile target')
    added = anchor + ''.join('\t\t%s \\\n' % s for s in DRIVE_SOURCES)
    text = text.replace(anchor, added)
    # include paths: extend the compile line's first -I group
    inc_anchor = '-I../../../Engine/GeometricRaster '
    if inc_anchor not in text:
        raise SystemExit('ApplyDriveLevelPatch: no GeometricRaster include in the Makefile target')
    text = text.replace(inc_anchor, inc_anchor + ' '.join(DRIVE_INCLUDES) + ' ', 1)
    return text.replace('# Project Zero Host harness',
                        '# [drive-level] the MaterialLevelViewport target also builds the Project-Drive level\n'
                        '# Project Zero Host harness', 1)


def main() -> int:
    if len(sys.argv) < 2:
        print('usage: ApplyDriveLevelPatch.py <seated-engine-root> [--verify]')
        return 2
    root = pathlib.Path(sys.argv[1])
    path = root / TARGET
    if not path.exists():
        print('[drive-level] %s not found' % path)
        return 1
    text = path.read_text()
    if '--verify' in sys.argv:
        ok = MARK in text
        print('[drive-level] %s' % ('patched' if ok else 'NOT PATCHED'))
        return 0 if ok else 1
    out = patch(text)
    if out == text:
        print('[drive-level] already patched')
        return 0
    # The seat is hard-linked off the pinned checkout (RunDriveMirror seats it with `cp -al`), so writing in
    # place would write THROUGH the link and mutate the shared pinned engine.  Break the link first, exactly as
    # seat_overlay does for every overlaid file.
    path.unlink()
    path.write_text(out)
    print('[drive-level] added the drive level to %s' % TARGET)

    mk = root / MAKE_TARGET
    if mk.exists():
        mtext = mk.read_text()
        mout = patch_makefile(mtext)
        if mout != mtext:
            mk.unlink()
            mk.write_text(mout)
            print('[drive-level] added the Drive translation units to %s' % MAKE_TARGET)
    return 0


if __name__ == '__main__':
    sys.exit(main())
