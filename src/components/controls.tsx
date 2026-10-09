import React from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';

// Frontier development-editor controls: tree sections, black-pill sliders
// with the value drawn on the track, round checks, pill radios.

export function Section({
  title,
  open = true,
  children,
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="fw-sec" open={open}>
      <summary>
        <span className="caret"><ChevronRight size={13} /></span>
        {title}
      </summary>
      <div className="fw-sec-body">{children}</div>
    </details>
  );
}

export function Divider() {
  return <div className="fw-div" />;
}

const fmt = (v: number, step: number) =>
  Number(v).toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="fw-slider">
      <label>{label}</label>
      <div className="track">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="val">{fmt(value, step)}{unit}</span>
      </div>
    </div>
  );
}

export function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="fw-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="box">{value && <Check size={10} />}</span>
      <span className="ct">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: Array<{ value: T; label: React.ReactNode; title?: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <>
      {label && <div className="fw-fieldlab">{label}</div>}
      <div className="fw-seg">
        {options.map((o) => (
          <button
            key={o.value}
            title={o.title}
            className={o.value === value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <div className="fw-fieldlab">{label}</div>
      <div className="fw-select">
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} />
      </div>
    </>
  );
}
