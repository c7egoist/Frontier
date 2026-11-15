#!/usr/bin/env python3
"""Exhibit proof gallery: converts the ctest captures in Exhibits/Images/**/*.png into 1280 px JPEGs under
Exhibits/Gallery/ and writes Exhibits/Gallery/README.md + index.html. The PNGs stay out of git (about 450 MB); the
gallery (about 7 MB) is committed so the proofs can be seen without a build.

    ctest --test-dir Build/Editor            # writes Exhibits/Images/
    python3 Automation/BuildExhibitGallery.py   # needs Pillow (pip install pillow)
"""
from datetime import date
from pathlib import Path
import json, os, re, shutil, sys

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
SOURCE, TARGET = REPO / "Exhibits" / "Images", REPO / "Exhibits" / "Gallery"
WIDTH, QUALITY = 1280, 80
TEMPLATE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Exhibit Proof Gallery · Frontier</title>\n<style>\n@font-face{font-family:"DM Sans";font-weight:300;src:url("../../Experimental/Shared/Studio/Fonts/dm-sans-latin-300-normal.woff2") format("woff2")}\n@font-face{font-family:"DM Sans";font-weight:500;src:url("../../Experimental/Shared/Studio/Fonts/dm-sans-latin-500-normal.woff2") format("woff2")}\n*{box-sizing:border-box}body{margin:0;background:#090909;color:#e8e8e8;font:300 13px "DM Sans",system-ui,sans-serif}\nheader{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:14px;padding:12px 18px;background:#0a0a0a;border-bottom:1px solid #1c1c1c}\n.mark{width:34px;height:34px;border-radius:12px;background:#ffb238;color:#111;display:flex;align-items:center;justify-content:center;font-weight:500}\nheader b{display:block;font-weight:500;font-size:15px}header small{color:#6e6e6e}.sp{flex:1}\nselect,input{background:#171717;color:#e8e8e8;border:1px solid #2a2a2a;border-radius:10px;height:34px;padding:0 12px;font:inherit}\nmain{padding:8px 18px 40px}h2{font-weight:500;font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:#8a8a8a;margin:26px 0 10px}\nh2 span{color:#ffb238;margin-left:6px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}\nfigure{margin:0;background:#121212;border:1px solid #1f1f1f;border-radius:14px;overflow:hidden;cursor:zoom-in;min-width:0}\nfigure:hover{border-color:#3a3a3a}figure img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#151518}\nfigcaption{padding:9px 12px 11px;min-width:0}figcaption b{display:block;font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\nfigcaption small{display:block;color:#6e6e6e;font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n#Box{position:fixed;inset:0;z-index:5;background:#000000e6;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:24px;cursor:zoom-out}\n#Box.open{display:flex}#Box img{max-width:96vw;max-height:86vh;border-radius:10px;border:1px solid #2a2a2a}#Box small{color:#9a9a9a}\n</style></head><body>\n<header><span class="mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg></span><div><b>Exhibit Proof Gallery</b><small id="Cap"></small></div><span class="sp"></span>\n<input id="Q" type="search" placeholder="Search captures or tests"><select id="D"><option value="">All domains</option></select></header>\n<main id="M"></main><div id="Box"><img alt=""><small></small></div>\n<script>\nconst ITEMS=__ITEMS__;\nconst M=document.getElementById(\'M\'),Q=document.getElementById(\'Q\'),D=document.getElementById(\'D\'),Box=document.getElementById(\'Box\');\nconst doms=[...new Set(ITEMS.map(i=>i.domain))];\nfor(const d of doms)D.append(new Option(d,d));\ndocument.getElementById(\'Cap\').textContent=`${ITEMS.length} captures · ${new Set(ITEMS.map(i=>i.test)).size} tests · ${doms.length} domains · Editor build, ctest 2026-11-15`;\nfunction render(){const q=Q.value.toLowerCase(),d=D.value;M.innerHTML=\'\';\n for(const dom of doms){if(d&&dom!==d)continue;const its=ITEMS.filter(i=>i.domain===dom&&(!q||(i.name+\' \'+i.test).toLowerCase().includes(q)));if(!its.length)continue;\n  const h=document.createElement(\'h2\');h.innerHTML=`${dom}<span>${its.length}</span>`;const g=document.createElement(\'div\');g.className=\'grid\';\n  for(const i of its){const f=document.createElement(\'figure\');f.innerHTML=`<img loading="lazy" src="${i.src}" alt=""><figcaption><b title="${i.name}">${i.name}</b><small>${i.test} · ${i.w}×${i.h}</small></figcaption>`;\n   f.onclick=()=>{Box.querySelector(\'img\').src=i.src;Box.querySelector(\'small\').textContent=`${dom} / ${i.name} · ${i.test} · full PNG: Exhibits/Images/${i.src.replace(/\\.jpg$/,\'.png\')}`;Box.classList.add(\'open\')};g.append(f)}\n  M.append(h,g)}}\nBox.onclick=()=>Box.classList.remove(\'open\');addEventListener(\'keydown\',e=>{if(e.key===\'Escape\')Box.classList.remove(\'open\')});\nQ.oninput=render;D.onchange=render;render();\n</script></body></html>'


def producer(name, sources, cmake):
    stem = Path(name).stem
    for test, text in sources.items():
        if stem in text:
            return test
    m = re.match(r"(Frontier\w+?)_DesktopExecutable", name)
    if m:
        return m.group(1) + "ExecutableSmoke"
    m = re.search(r"add_test\(NAME (\w+)[^)]*?" + re.escape(name), cmake, re.S)
    return m.group(1) if m else "—"


def main():
    pngs = sorted(SOURCE.rglob("*.png"))
    if not pngs:
        sys.exit("No captures in Exhibits/Images — run ctest --test-dir Build/Editor first.")
    sources = {p.stem: p.read_text(errors="ignore") for p in (REPO / "Exhibits").glob("*.cpp")}
    cmake = (REPO / "CMakeLists.txt").read_text()
    for old in TARGET.iterdir() if TARGET.exists() else []:
        if old.is_dir():
            shutil.rmtree(old)
    items, total = [], 0
    for png in pngs:
        rel = png.relative_to(SOURCE)
        out = TARGET / rel.with_suffix(".jpg")
        out.parent.mkdir(parents=True, exist_ok=True)
        im = Image.open(png).convert("RGB")
        w, h = im.size
        if w > WIDTH:
            im = im.resize((WIDTH, round(h * WIDTH / w)), Image.LANCZOS)
        im.save(out, quality=QUALITY, optimize=True, progressive=True)
        total += out.stat().st_size
        items.append(dict(domain=rel.parts[0], src=rel.with_suffix(".jpg").as_posix(), name=png.stem, w=w, h=h,
                          test=producer(png.name, sources, cmake), mb=round(png.stat().st_size / 1e6, 1)))
    domains = sorted({i["domain"] for i in items})
    tests = sorted({i["test"] for i in items})
    raw = sum(p.stat().st_size for p in pngs) / 1e6
    md = ["# 🏆 Exhibit Proof Gallery", "",
          f"> **TL;DR:** {len(items)} proof captures from this repo's own engine build (`ctest --test-dir Build/Editor`, "
          f"gallery built {date.today().isoformat()}). They come from {len(tests)} tests in {len(domains)} domains. Shown as {WIDTH} px JPEGs "
          f"({total / 1e6:.0f} MB). The full-size PNGs ({raw:.0f} MB) are written to `Exhibits/Images/` by every test run and kept out of git.", "",
          "🌐 Grid view: `Exhibits/Gallery/index.html` (served at `:8095/Exhibits/Gallery/`).", "",
          "🐞 `MaterialWorkspaceUIValidation` aborts on an ImGui assert from the imported tree (51/52 pass). "
          "The Material images below come from the other Material tests.", "",
          "```text", " cmake --build Build/Editor && ctest --test-dir Build/Editor     # regenerates Exhibits/Images/*.png",
          " python3 Automation/BuildExhibitGallery.py                        # refreshes this gallery", "```", "",
          "| Domain | Captures | Tests |", "| :--- | :---: | :--- |"]
    for d in domains:
        its = [i for i in items if i["domain"] == d]
        md.append(f"| [{d}](#{d.lower()}) | {len(its)} | {', '.join(sorted({'`' + i['test'] + '`' for i in its}))} |")
    md.append("")
    for d in domains:
        md += ["---", "", f"## {d}", ""]
        for i in (i for i in items if i["domain"] == d):
            md += [f"**{i['name']}** · `{i['test']}` · {i['w']}×{i['h']}", "", f"![{i['name']}]({i['src']})", ""]
    (TARGET / "README.md").write_text("\n".join(md))
    (TARGET / "index.html").write_text(TEMPLATE.replace("__ITEMS__", json.dumps(items)))
    print(f"[BuildExhibitGallery] {len(items)} captures, {len(tests)} tests -> Exhibits/Gallery ({total / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
