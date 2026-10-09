// Parameter descriptors. The UI builds every slider, dropdown and toggle from these,
// so a new erosion or mask type gets its controls by declaring its params here.
export const num = (key, label, min, max, step, def, unit = "") => ({ key, label, type: "num", min, max, step, def, unit });
export const int = (key, label, min, max, def, unit = "") => ({ key, label, type: "int", min, max, step: 1, def, unit });
export const choice = (key, label, options, def) => ({ key, label, type: "enum", options, def });
export const flag = (key, label, def) => ({ key, label, type: "bool", def });

export function defaultsOf(list) {
  const out = {};
  for (const p of list) out[p.key] = p.def;
  return out;
}

// Parameters every base generator shares: how strong it is, and where its zero sits.
export const GENERATOR_COMMON = [
  num("amplitude", "Amplitude", 0, 1, 0.01, 1, "×"),
  num("base", "Base level", 0, 1, 0.01, 0, "×"),
  int("seed", "Seed offset", 0, 999, 0),
];
