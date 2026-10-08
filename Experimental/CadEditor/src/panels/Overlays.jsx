import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store.js";
import * as A from "../actions.js";
import { COMMANDS, paletteCommands, prettyChord } from "../commands.js";

// Command palette: Search (F / F3) lists every command; Add (Shift+A) lists creatable items.
export function Palette() {
  const palette = useStore((s) => s.palette);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = paletteCommands(palette);
    if (!q) return base;
    return base.filter((c) => `${c.label} ${c.group} ${c.chord ?? ""}`.toLowerCase().includes(q));
  }, [palette, query]);

  useEffect(() => {
    if (palette) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [palette]);

  useEffect(() => setIndex(0), [query]);

  if (!palette) return null;

  const run = (cmd) => {
    A.setPalette(null);
    cmd.run();
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[index]) run(items[index]);
    } else if (e.key === "Escape") {
      A.setPalette(null);
    }
  };

  return (
    <div className="overlay" onMouseDown={() => A.setPalette(null)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder={palette === "add" ? "Add a primitive, curve, surface or operation…" : "Search commands…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <ul className="palette-list">
          {items.map((c, i) => (
            <li key={c.id} className={i === index ? "active" : ""} onMouseEnter={() => setIndex(i)} onClick={() => run(c)}>
              <span className="group">{c.group}</span>
              <span className="label">{c.label}</span>
              {c.chord && <kbd>{prettyChord(c.chord)}</kbd>}
            </li>
          ))}
          {!items.length && <li className="muted">No matching commands</li>}
        </ul>
      </div>
    </div>
  );
}

const KEY_LABEL = {
  space: "Space",
  home: "Home",
  delete: "Delete",
  tab: "Tab",
  "numpad.": "Numpad .",
};

function keyLabel(chord) {
  return chord
    .split("+")
    .map((p) => KEY_LABEL[p] ?? (p.startsWith("numpad") ? `Numpad ${p.slice(6)}` : p.length === 1 ? p.toUpperCase() : p.replace(/^./, (c) => c.toUpperCase())))
    .join(" + ");
}

export function Help() {
  const help = useStore((s) => s.help);
  if (!help) return null;
  const groups = {};
  for (const c of COMMANDS) {
    if (!c.chord) continue;
    (groups[c.group] ??= []).push(c);
  }
  return (
    <div className="overlay" onMouseDown={() => A.toggleHelp()}>
      <div className="help" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <header className="panel-head">
          <span className="title">Keyboard shortcuts</span>
          <button className="icon" onClick={() => A.toggleHelp()} aria-label="Close">
            ×
          </button>
        </header>
        <div className="help-grid">
          {Object.entries(groups).map(([group, list]) => (
            <section key={group}>
              <h3>{group}</h3>
              <table>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <kbd>{keyLabel(c.chord)}</kbd>
                        {c.chord2 && (
                          <>
                            {" "}
                            <kbd>{keyLabel(c.chord2)}</kbd>
                          </>
                        )}
                      </td>
                      <td>{c.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        <p className="hint">
          Shift = add to selection · Ctrl = toggle · Esc clears selection. Operations read the current selection and hide their
          inputs. Bevel is an asymmetric chamfer (distance and setback).
        </p>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.tone}`} key={toast.id} role="status">
      {toast.message}
    </div>
  );
}

