#!/usr/bin/env python3
"""Build the distributable Blender addon zip (frontier core bundled)."""

import os
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dist", "frontier_blender.zip")


def main():
    tmp = os.path.join(ROOT, "dist", "_addon")
    if os.path.isdir(tmp):
        shutil.rmtree(tmp)
    pkg = os.path.join(tmp, "frontier_blender")
    os.makedirs(pkg)
    shutil.copy(os.path.join(ROOT, "blender_addon", "__init__.py"), os.path.join(pkg, "__init__.py"))
    shutil.copytree(os.path.join(ROOT, "frontier"), os.path.join(pkg, "frontier"))
    # make bundled import work: rewrite `import frontier` fallback is already local
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, _, fns in os.walk(pkg):
            for fn in fns:
                if fn.endswith(".pyc"):
                    continue
                full = os.path.join(dp, fn)
                z.write(full, os.path.relpath(full, tmp))
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    sys.exit(main())
