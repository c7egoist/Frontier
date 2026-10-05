import React from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';

// CliffSequence-style inspector controls: details sections, amber-fill
// sliders with output pills, checkbox rows, segmented buttons.

export function Section({
  title,
  icon,
  open = true,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="rw-section" open={open}>
      <summary>
        {icon && <span className="sec-icon">{icon}</span>}
        {title}
        <span className="sec-chev"><ChevronRight size={14} /></span>
      </summary>
      <div className="rw-section-body">{children}</div>
    </details>
  );
}

export function Divider() {
  return <div className="rw-divider" />;
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
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="rw-field">
      <div className="rw-field-head">
        <label>{label}</label>
        <output>{fmt(value, step)}{unit}</output>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--Fill': `${fill}%` } as React.CSSProperties}
      />
      <div className="rw-range-ends">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
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
    <label className="rw-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="box">{value && <Check size={11} />}</span>
      <span className="check-text">
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
    <div className="rw-field">
      {label && (
        <div className="rw-field-head">
          <label>{label}</label>
        </div>
      )}
      <div className="rw-seg">
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
    </div>
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
    <div className="rw-field">
      <div className="rw-field-head">
        <label>{label}</label>
      </div>
      <div className="rw-select-wrap">
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} />
      </div>
    </div>
  );
}
