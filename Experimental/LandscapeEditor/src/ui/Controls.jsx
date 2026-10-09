import React from "react";

// Slider + number field pill, the same control the reference editor uses.
export function Slider({ def, value, onChange }) {
  const v = typeof value === "number" ? value : def.def;
  const fill = ((v - def.min) / (def.max - def.min || 1)) * 100;
  const step = def.step || 0.01;
  const decimals = step >= 1 ? 0 : String(step).split(".")[1]?.length || 0;
  return (
    <label className="field">
      <span className="field-label">{def.label}</span>
      <span className="slider-pill">
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={step}
          value={v}
          style={{ "--fill": `${fill}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          className="num"
          type="number"
          min={def.min}
          max={def.max}
          step={step}
          value={Number(v.toFixed(decimals))}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(def.max, Math.max(def.min, n)));
          }}
        />
        <span className="unit">{def.unit || ""}</span>
      </span>
    </label>
  );
}

export function Select({ label, value, options, onChange, grouped }) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {grouped
          ? grouped.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </optgroup>
            ))
          : options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
      </select>
    </label>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <button type="button" className={`toggle ${checked ? "on" : ""}`} aria-pressed={checked} onClick={() => onChange(!checked)}>
        <span className="knob" />
      </button>
    </label>
  );
}

// Build every control for a parameter schema from its descriptors.
export function ParamForm({ schema, values, onChange }) {
  return (
    <div className="param-form">
      {schema.map((def) => {
        const v = values[def.key] ?? def.def;
        if (def.type === "enum") {
          return (
            <Select
              key={def.key}
              label={def.label}
              value={v}
              options={def.options}
              onChange={(x) => onChange(def.key, x)}
            />
          );
        }
        if (def.type === "bool") {
          return <Toggle key={def.key} label={def.label} checked={!!v} onChange={(x) => onChange(def.key, x)} />;
        }
        return <Slider key={def.key} def={def} value={v} onChange={(x) => onChange(def.key, x)} />;
      })}
    </div>
  );
}

export function Card({ title, caption, children, note, className = "" }) {
  return (
    <section className={`pcard ${className}`}>
      {caption && <div className="section-caption">{caption}</div>}
      {title && <h3 className="card-title">{title}</h3>}
      {note && <p className="card-note">{note}</p>}
      {children}
    </section>
  );
}
