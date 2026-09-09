# Frontier — Scene Outliner

A game-engine scene outliner: typed entities (folders, meshes, lights,
cameras, audio, particles, physics, scripts) in a fast keyboard-first
hierarchy. No build step, no dependencies — just open `index.html`
(or serve the folder).

## Run

```sh
# any static server, e.g.
python3 -m http.server 8000
# → http://localhost:8000
```

Your scene auto-saves to `localStorage` as you edit.

## Use

| Key | Action |
|---|---|
| `Enter` / `F2` | Rename selected entity |
| `↑` `↓` `←` `→` | Navigate · collapse / expand |
| `Tab` / `Shift+Tab` | Reparent (indent / outdent) |
| `Insert` | Add entity |
| `Ctrl+D` | Duplicate (with children) |
| `V` | Show / hide |
| `Del` | Delete (with children) |
| `Alt` + `↑`/`↓` | Reorder |
| `Ctrl+Enter` | Isolate subtree / back out |
| `/` | Search entities |
| `Ctrl+/` | Shortcut reference |

Mouse: click selects, double-click renames, click the eye to show/hide,
double-click a bullet to isolate a subtree, right-click for the
entity menu.

## Theme

All visuals derive from the **theme token block** at the top of
`styles.css` (`dark` signature theme + `light`). To re-skin the app,
only that block needs to change.
