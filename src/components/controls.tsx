import React from 'react';
import { ChevronDown } from 'lucide-react';

// Slate-editor-style inspector controls.

export function Card({
  title,
  icon,
  color,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card" style={color ? ({ '--card-icon': color } as React.CSSProperties) : undefined}>
      <div className="card-heading">
        <span>
          {icon}
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accent?: string;
  onChange: (v: number) => void;
}) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <div className="control-block">
      <div className="control-line">
        <span>{label}</span>
        <span className="val">
          {Number(value).toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : 2)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--progress': `${progress}%`, ...(accent ? { '--accent': accent } : {}) } as React.CSSProperties}
      />
      <div className="range-labels">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
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
    <div className="toggle-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-label={label}>
        <span />
      </button>
    </div>
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
    <div className="control-block">
      {label && (
        <div className="control-line">
          <span>{label}</span>
        </div>
      )}
      <div className="seg">
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
    <div className="control-block">
      <div className="control-line">
        <span>{label}</span>
      </div>
      <div className="select-wrap">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
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

export function NumInput({
  value,
  onChange,
  step = 0.1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      className="num-input"
      type="number"
      step={step}
      value={Number(value).toFixed(2)}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}
