import { useEffect, useRef, useState } from "react";
import { useStore } from "../store.js";
import * as A from "../actions.js";
import { NODE_TYPES, LOFT_TYPES, PLANES, KIND_LABEL } from "../model/nodeTypes.js";
import { CONTINUITY } from "../geometry/spline.js";
import { exportStl } from "../export.js";

const BOOL_OPS = [
  { value: "union", label: "Union" },
  { value: "subtract", label: "Subtract (first − rest)" },
  { value: "intersect", label: "Intersect" },
];

const SELECT_OPTIONS = { loftType: LOFT_TYPES, plane: PLANES, op: BOOL_OPS };

const OPERATION_BUTTONS = [
  "extrude", "revolve", "loft", "sweep", "boolean", "mirror",
  "fillet", "chamfer", "bevel", "pushpull",
  "planeSurface", "patch", "extrudeSurface", "revolveSurface", "loftSurface", "sweepSurface",
];

const round = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : "");

// Number field: keeps the text while typing and commits valid numbers immediately.
function NumberInput({ value, onChange, step = 0.5, min, title, className = "" }) {
  const [text, setText] = useState(String(round(value)));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(round(value)));
  }, [value]);
  return (
    <input
      type="number"
      className={`num ${className}`}
      value={text}
      step={step}
      min={min}
      title={title}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(String(round(value)));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && (min === undefined || v >= min)) onChange(v);
      }}
    />
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-value">{children}</span>
    </label>
  );
}

function Vec3({ value, onChange, step = 0.5, coalesce }) {
  const v = value ?? [0, 0, 0];
  return (
    <div className="vec3">
      {[0, 1, 2].map((i) => (
        <NumberInput
          key={i}
          value={v[i] ?? 0}
          step={step}
          title={"xyz"[i].toUpperCase()}
          onChange={(x) => {
            const next = [...v];
            next[i] = x;
            onChange(next, coalesce);
          }}
        />
      ))}
    </div>
  );
}

function PointsEditor({ node, field }) {
  const isKnots = field.kind === "knots";
  const list = node.params[field.key] ?? [];
  return (
    <div className="points">
      {list.map((item, i) => {
        const p = isKnots ? item.p : item;
        return (
          <div className="point-row" key={i}>
            <span className="idx">{i}</span>
            <div className="vec3">
              {[0, 1, 2].map((axis) => (
                <NumberInput
                  key={axis}
                  value={p[axis] ?? 0}
                  title={"xyz"[axis].toUpperCase()}
                  onChange={(x) => A.setPointCoord(node.id, i, axis, x)}
                />
              ))}
            </div>
            {isKnots && (
              <>
                <select
                  className="cont"
                  value={item.cont ?? "G0"}
                  title="Continuity at this knot"
                  onChange={(e) => A.setKnotCont(node.id, i, e.target.value)}
                >
                  {CONTINUITY.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <NumberInput
                  value={item.scale ?? 1}
                  step={0.1}
                  min={0.05}
                  title="Tangent handle scale"
                  className="scale"
                  onChange={(x) => A.setKnotScale(node.id, i, x)}
                />
              </>
            )}
            <button className="icon small" title="Remove point" onClick={() => A.removePoint(node.id, i)} disabled={list.length <= 2}>
              ×
            </button>
          </div>
        );
      })}
      <button className="link" onClick={() => A.addPoint(node.id)}>
        + Add {isKnots ? "knot" : "point"}
      </button>
    </div>
  );
}

function ParamFields({ node }) {
  const meta = NODE_TYPES[node.type];
  return (
    <section className="section">
      <h3>{meta.label.replace(/\s*\(.*\)$/, "")}</h3>
      {(meta.fields ?? []).map((f) => {
        const value = node.params[f.key];
        const set = (v, coalesce) => A.setParam(node.id, f.key, v, { coalesce: coalesce !== false });
        if (f.kind === "number") {
          return (
            <Field key={f.key} label={f.label ?? f.key}>
              <NumberInput value={value} min={f.min ?? undefined} step={f.step ?? 0.5} onChange={(v) => set(v)} />
            </Field>
          );
        }
        if (f.kind === "vec3") {
          return (
            <Field key={f.key} label={f.label ?? f.key}>
              <Vec3 value={value} onChange={(v) => set(v)} />
            </Field>
          );
        }
        if (f.kind === "bool") {
          return (
            <Field key={f.key} label={f.label ?? f.key}>
              <input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked, false)} />
            </Field>
          );
        }
        if (f.kind === "select") {
          const options = SELECT_OPTIONS[f.key] ?? f.options ?? [];
          return (
            <Field key={f.key} label={f.label ?? f.key}>
              <select value={value} onChange={(e) => set(e.target.value, false)}>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          );
        }
        if (f.kind === "points" || f.kind === "knots") {
          return (
            <div key={f.key} className="block">
              <div className="field-label">{f.label ?? f.key}</div>
              <PointsEditor node={node} field={f} />
            </div>
          );
        }
        if (f.kind === "edges") {
          return (
            <Field key={f.key} label="Edges">
              <span className="muted">{(value ?? []).length} selected in kernel order</span>
            </Field>
          );
        }
        if (f.kind === "face") {
          return (
            <Field key={f.key} label="Face index">
              <span className="muted">{value >= 0 ? value : "none"}</span>
            </Field>
          );
        }
        return null;
      })}
      {node.type === "spline" && (
        <p className="hint">
          G0 = position, G1 = matching tangent direction, G2 = matching curvature. The scale sets how far the handle
          reaches along the tangent.
        </p>
      )}
    </section>
  );
}

function TransformFields({ node }) {
  const xf = node.xf ?? { t: [0, 0, 0], r: [0, 0, 0], s: 1 };
  // Typing in one field merges into a single undo step per field.
  const set = (patch) => A.setXf(node.id, patch, { coalesce: `xf:${node.id}:${Object.keys(patch)[0]}` });
  return (
    <section className="section">
      <h3>Transform</h3>
      <Field label="Position">
        <Vec3 value={xf.t} onChange={(t) => set({ t })} />
      </Field>
      <Field label="Rotation °">
        <Vec3 value={xf.r} step={1} onChange={(r) => set({ r })} />
      </Field>
      <Field label="Scale">
        <NumberInput value={xf.s} step={0.05} min={0.01} onChange={(s) => set({ s })} />
      </Field>
      <div className="row-actions">
        <button className="link" onClick={() => A.setXf(node.id, { t: [0, 0, 0], r: [0, 0, 0], s: 1 })}>
          Reset transform
        </button>
      </div>
    </section>
  );
}

function StatsBlock({ node, result }) {
  if (!result) return <p className="muted">Waiting for kernel…</p>;
  if (!result.ok) return <p className="error">{result.error}</p>;
  const rows = [];
  if (result.volume !== undefined) rows.push(["Volume", `${fmt(result.volume)} mm³`]);
  if (result.area !== undefined) rows.push(["Area", `${fmt(result.area)} mm²`]);
  if (result.length !== undefined) rows.push(["Length", `${fmt(result.length)} mm`]);
  if (result.faceCount !== undefined) rows.push(["Faces", result.faceCount]);
  if (result.edgeCount !== undefined) rows.push(["Edges", result.edgeCount]);
  const b = result.bbox;
  if (b) rows.push(["Size", [0, 1, 2].map((i) => fmt(b.max[i] - b.min[i])).join(" × ") + " mm"]);
  return (
    <dl className="stats">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      <div>
        <dt>Kind</dt>
        <dd>{KIND_LABEL[node.kind ?? result.kind] ?? result.kind}</dd>
      </div>
    </dl>
  );
}

const fmt = (v) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Number(v.toFixed(2)).toString());

function SubSelection({ node, sub }) {
  const faces = sub?.faces ?? [];
  const edges = sub?.edges ?? [];
  if (!faces.length && !edges.length) return null;
  return (
    <section className="section">
      <h3>Selection</h3>
      {faces.length > 0 && <p>{faces.length} face{faces.length > 1 ? "s" : ""} selected</p>}
      {edges.length > 0 && <p>{edges.length} edge{edges.length > 1 ? "s" : ""} selected</p>}
      <div className="button-grid">
        {edges.length > 0 && (
          <>
            <button onClick={() => A.createOperation("fillet")}>Fillet</button>
            <button onClick={() => A.createOperation("chamfer")}>Chamfer</button>
            <button onClick={() => A.createOperation("bevel")}>Bevel</button>
          </>
        )}
        {faces.length === 1 && <button onClick={() => A.createOperation("pushpull")}>Push / pull face</button>}
      </div>
      <p className="hint">Operations use the current selection. The source solid is hidden and kept as an input.</p>
    </section>
  );
}

function OperationList({ title = "Operations" }) {
  return (
    <section className="section">
      <h3>{title}</h3>
      <div className="button-grid">
        {OPERATION_BUTTONS.map((type) => (
          <button key={type} onClick={() => A.createOperation(type)} title={NODE_TYPES[type].label}>
            {NODE_TYPES[type].label.replace(/\s*\(.*\)$/, "")}
          </button>
        ))}
      </div>
    </section>
  );
}

function DocumentSummary() {
  const doc = useStore((s) => s.doc);
  const results = useStore((s) => s.results);
  const nodes = doc.order.map((id) => doc.nodes[id]).filter(Boolean);
  const volume = nodes.reduce((sum, n) => sum + (results[n.id]?.ok && results[n.id].volume && n.visible ? results[n.id].volume : 0), 0);
  const count = (k) => nodes.filter((n) => (NODE_TYPES[n.type]?.kind ?? "body") === k).length;
  return (
    <section className="section">
      <h3>Document</h3>
      <dl className="stats">
        <div>
          <dt>Solids</dt>
          <dd>{count("body")}</dd>
        </div>
        <div>
          <dt>Surfaces</dt>
          <dd>{count("surface")}</dd>
        </div>
        <div>
          <dt>Curves</dt>
          <dd>{count("curve")}</dd>
        </div>
        <div>
          <dt>Visible volume</dt>
          <dd>{volume ? `${fmt(volume)} mm³` : "—"}</dd>
        </div>
      </dl>
      <div className="button-grid">
        <button onClick={() => A.addSample()}>Add sample car pod</button>
        <button onClick={() => exportStl()}>Export STL</button>
        <button onClick={() => A.newDocument()}>New document</button>
      </div>
      <p className="hint">Select a curve to edit its points, or pick solids and press a hotkey, e.g. B for fillet. Shift+A opens the add menu.</p>
    </section>
  );
}

export default function Inspector() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const sub = useStore((s) => s.sub);
  const results = useStore((s) => s.results);
  const mode = useStore((s) => s.mode);
  const gizmo = useStore((s) => s.gizmo);
  const nodes = selection.map((id) => doc.nodes[id]).filter(Boolean);

  if (!nodes.length) {
    return (
      <aside className="panel inspector" aria-label="Inspector">
        <header className="panel-head">
          <span className="title">Inspector</span>
        </header>
        <div className="scroll">
          <DocumentSummary />
          <OperationList title="Add" />
        </div>
      </aside>
    );
  }

  if (nodes.length > 1) {
    const kinds = [...new Set(nodes.map((n) => NODE_TYPES[n.type]?.kind))];
    return (
      <aside className="panel inspector" aria-label="Inspector">
        <header className="panel-head">
          <span className="title">{nodes.length} selected</span>
          <span className="count">{kinds.map((k) => KIND_LABEL[k]).join(" + ")}</span>
        </header>
        <div className="scroll">
          <section className="section">
            <h3>Selection</h3>
            <ul className="sel-list">
              {nodes.map((n) => (
                <li key={n.id}>{n.name}</li>
              ))}
            </ul>
            <div className="button-grid">
              <button onClick={() => A.createOperation("boolean")}>Boolean</button>
              <button onClick={() => A.createOperation("loft")}>Loft</button>
              <button onClick={() => A.createOperation("sweep")}>Sweep</button>
              <button onClick={() => A.deleteSelection()} className="danger">Delete</button>
            </div>
          </section>
          <OperationList />
        </div>
      </aside>
    );
  }

  const node = nodes[0];
  const meta = NODE_TYPES[node.type];
  const result = results[node.id];
  const inputs = (node.inputs ?? []).map((id) => doc.nodes[id]?.name).filter(Boolean);
  return (
    <aside className="panel inspector" aria-label="Inspector">
      <header className="panel-head">
        <span className={`kind-pill kind-${meta?.kind}`}>{KIND_LABEL[meta?.kind] ?? "Item"}</span>
        <input
          className="title-input"
          value={node.name}
          onChange={(e) => A.renameNode(node.id, e.target.value)}
          aria-label="Name"
        />
      </header>
      <div className="scroll">
        <div className="mode-line muted">
          Mode: {mode} · Gizmo: {gizmo}
        </div>
        <SubSelection node={node} sub={sub[node.id]} />
        <ParamFields node={node} />
        {inputs.length > 0 && (
          <section className="section">
            <h3>Inputs</h3>
            <p>{inputs.join(", ")}</p>
          </section>
        )}
        <TransformFields node={node} />
        <section className="section">
          <h3>Stats</h3>
          <StatsBlock node={node} result={result} />
        </section>
        <section className="section">
          <div className="button-grid">
            <button onClick={() => A.duplicateSelection()}>Duplicate</button>
            <button onClick={() => A.toggleVisible(node.id)}>{node.visible ? "Hide" : "Show"}</button>
            <button className="danger" onClick={() => A.deleteSelection()}>
              Delete
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
