// Global keyboard handling. Chords are normalised to "ctrl+shift+alt+key" strings and
// looked up in the command registry. Text fields keep their keys (except Escape).

import { COMMANDS } from "./commands.js";
import { getState } from "./store.js";
import { clearSelection, setPalette, toggleHelp } from "./actions.js";

const CODE_KEYS = {
  Space: "space",
  Tab: "tab",
  Delete: "delete",
  Backspace: "backspace",
  Home: "home",
  Escape: "escape",
  F3: "f3",
  F9: "f9",
};

// Map a keyboard event to a chord string. Numpad keys are read by physical code so
// they work with NumLock on or off.
export function chordOf(e) {
  let key;
  if (e.code.startsWith("Numpad")) {
    const rest = e.code.slice(6);
    key = /^\d$/.test(rest) ? `numpad${rest}` : rest === "Decimal" ? "numpad." : rest === "Add" ? "numpad+" : rest === "Subtract" ? "numpad-" : null;
  } else if (CODE_KEYS[e.code]) {
    key = CODE_KEYS[e.code];
  } else if (/^Digit\d$/.test(e.code)) {
    key = e.code.slice(5);
  } else if (/^Key[A-Z]$/.test(e.code)) {
    key = e.code.slice(3).toLowerCase();
  } else {
    key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  }
  if (!key) return null;
  // "?" needs Shift on most layouts; treat it as its own key.
  if (key === "/" && e.shiftKey) key = "?";
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.shiftKey && key !== "?") parts.push("shift");
  if (e.altKey) parts.push("alt");
  parts.push(key);
  return parts.join("+");
}

const byChord = new Map();
for (const cmd of COMMANDS) {
  for (const c of [cmd.chord, cmd.chord2]) if (c) byChord.set(c, cmd);
}

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function installHotkeys(onCommand = () => {}) {
  const onKeyDown = (e) => {
    const s = getState();
    if (e.key === "Escape") {
      if (s.palette || s.help) {
        setPalette(null);
        if (s.help) toggleHelp();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (s.selection.length) clearSelection();
      return;
    }
    if (isTypingTarget(e.target)) return;
    const chord = chordOf(e);
    if (!chord) return;
    // Command palette: arrows / enter are handled by the palette itself.
    if (s.palette) return;
    const cmd = byChord.get(chord);
    if (!cmd) return;
    e.preventDefault();
    cmd.run();
    onCommand(cmd);
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

// Undo/redo should also work when the viewport owns focus; they are in the registry.
export function describeChords() {
  return COMMANDS.filter((c) => c.chord).map((c) => ({ id: c.id, label: c.label, group: c.group, chord: c.chord, chord2: c.chord2 ?? null }));
}

