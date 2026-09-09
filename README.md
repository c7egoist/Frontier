# Frontier — Outliner

A calm, fast, keyboard-first outliner. No build step, no dependencies —
just open `index.html` (or serve the folder) and start thinking.

## Run

```sh
# any static server, e.g.
python3 -m http.server 8000
# → http://localhost:8000
```

Your outline auto-saves to `localStorage` as you type.

## Use

| Key | Action |
|---|---|
| `Enter` | New bullet below (splits text at cursor) |
| `Tab` / `Shift+Tab` | Indent / outdent |
| `⌫` at line start | Merge with bullet above |
| `↑` / `↓` | Move between bullets |
| `Alt` + `↑`/`↓` | Move bullet (with children) up / down |
| `Alt` + `←`/`→` | Collapse / expand |
| `Ctrl` + `Enter` | Zoom in / out of bullet |
| `Esc` | Zoom out one level |
| `Ctrl` + `/` | Shortcut reference |

Mouse: click a bullet to collapse, double-click (or `Alt`-click) to zoom.
Paste multi-line text to get one bullet per line.

## Theme

All visuals derive from the **theme token block** at the top of
`styles.css` (`dark` default + `light`). To re-skin the app to match a
brand, only that block needs to change.
