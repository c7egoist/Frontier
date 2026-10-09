// Inspector building blocks. They reproduce the FrontierEditor card, slider and pill language.
import React from 'react';

export function Card({ title, icon: Icon, accent, wide, children, actions }) {
  return (
    <section className={`card ${wide ? 'wide-card' : ''}`} style={accent ? { '--card-icon': accent } : undefined}>
      <div className="card-heading">
        <span>
          {Icon && <Icon size={16} />}
          {title}
        </span>
        {actions}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

const format = (value, step) => {
  if (step >= 1) return Math.round(value).toLocaleString('en-US');
  const digits = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: Math.min(Math.max(digits, 1), 3) });
};

// A labelled slider with a live readout. `onChange(value)` receives the number.
export function Slider({ label, value, min, max, step = 1, unit = '', onChange, hint }) {
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <div className="ls-slider">
      <div className="control-line">
        <span>{label}</span>
        <span className="ls-readout">
          {format(value, step)}
          {unit && <small> {unit}</small>}
        </span>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--progress': `${Math.max(0, Math.min(100, pct))}%` }}
      />
      {hint && <p className="ls-hint">{hint}</p>}
    </div>
  );
}

// Dropdown for choosing a type, a blend mode or a mask target.
export function Select({ label, value, options, onChange, ariaLabel }) {
  return (
    <label className="ls-select-row">
      {label && <span className="ls-select-label">{label}</span>}
      <select aria-label={ariaLabel || label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <button type="button" className={`enabled-pill ls-toggle ${checked ? '' : 'disabled'}`} aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span />
      {label}
    </button>
  );
}

export function Pill({ children, tone }) {
  return <span className={`small-pill ls-pill ${tone || ''}`}>{children}</span>;
}
