import { useState } from "react";
import { useStore } from "../store.js";
import * as A from "../actions.js";
import { NODE_TYPES, KIND_LABEL } from "../model/nodeTypes.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "body", label: "Solids" },
  { id: "surface", label: "Surfaces" },
  { id: "curve", label: "Curves" },
  { id: "hidden", label: "Hidden" },
];

const GROUPS = [
  { kind: "body", label: "Solids" },
  { kind: "surface", label: "Surfaces" },
  { kind: "curve", label: "Curves" },
];

function kindOf(node) {
  return NODE_TYPES[node.type]?.kind ?? "body";
}

export default function Outliner() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const results = useStore((s) => s.results);
  const outliner = useStore((s) => s.outliner);
  const [renaming, setRenaming] = useState(null);

  const q = outliner.query.trim().toLowerCase();
  const visibleIds = doc.order.filter((id) => {
    const node = doc.nodes[id];
    if (!node) return false;
    if (outliner.filter === "hidden") {
      if (node.visible) return false;
    } else if (outliner.filter !== "all" && kindOf(node) !== outliner.filter) {
      return false;
    }
    if (q && !`${node.name} ${node.type} ${KIND_LABEL[kindOf(node)]}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const selected = new Set(selection);
  const onRowClick = (e, id) => {
    if (e.ctrlKey || e.metaKey) A.selectNodes([id], { toggle: true });
    else if (e.shiftKey) A.selectNodes([id], { add: true });
    else A.selectNodes([id]);
  };

  const commitName = (id, value) => {
    setRenaming(null);
    const name = value.trim();
    if (name && name !== doc.nodes[id]?.name) A.renameNode(id, name);
  };

  return (
    <aside className="panel outliner" aria-label="Outliner">
      <header className="panel-head">
        <span className="title">Outliner</span>
        <span className="count">{doc.order.length}</span>
        <button className="icon" title="Add (Shift+A)" onClick={() => A.setPalette("add")}>+</button>
      </header>

      <div className="search-row">
        <input
          className="search"
          placeholder="Search items"
          value={outliner.query}
          onChange={(e) => A.setOutliner({ query: e.target.value })}
          aria-label="Search items"
        />
        <select value={outliner.filter} onChange={(e) => A.setOutliner({ filter: e.target.value })} aria-label="Filter">
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="tree">
        {doc.order.length === 0 && (
          <div className="empty">
            <p>Empty document.</p>
            <button onClick={() => A.addSample()}>Add sample car pod</button>
            <p className="muted">Or press Shift+A to add a primitive, curve or operation.</p>
          </div>
        )}
        {GROUPS.map((g) => {
          const ids = visibleIds.filter((id) => kindOf(doc.nodes[id]) === g.kind);
          if (!ids.length) return null;
          return (
            <section key={g.kind} className="group">
              <div className="group-label">
                {g.label} <span className="muted">{ids.length}</span>
              </div>
              {ids.map((id) => {
                const node = doc.nodes[id];
                const r = results[id];
                const bad = r && !r.ok;
                const isSel = selected.has(id);
                return (
                  <div
                    key={id}
                    className={`row ${isSel ? "sel" : ""} ${node.visible ? "" : "hidden"}`}
                    onClick={(e) => onRowClick(e, id)}
                    onDoubleClick={() => setRenaming(id)}
                    title={bad ? r.error : NODE_TYPES[node.type]?.label}
                  >
                    <button
                      className={`status ${bad ? "bad" : node.visible ? "on" : "off"}`}
                      title={node.visible ? "Hide" : "Show"}
                      onClick={(e) => {
                        e.stopPropagation();
                        A.toggleVisible(id);
                      }}
                      aria-label={node.visible ? "Hide" : "Show"}
                    />
                    <span className={`kind kind-${kindOf(node)}`} aria-hidden="true">
                      {kindOf(node) === "curve" ? "~" : kindOf(node) === "surface" ? "◇" : "■"}
                    </span>
                    {renaming === id ? (
                      <input
                        className="rename"
                        autoFocus
                        defaultValue={node.name}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => commitName(id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitName(id, e.currentTarget.value);
                          if (e.key === "Escape") setRenaming(null);
                          e.stopPropagation();
                        }}
                      />
                    ) : (
                      <span className="name">{node.name}</span>
                    )}
                    <span className="type">{NODE_TYPES[node.type]?.label.replace(/\s*\(.*\)$/, "")}</span>
                  </div>
                );
              })}
            </section>
          );
        })}
        {doc.order.length > 0 && visibleIds.length === 0 && <div className="empty muted">No items match.</div>}
      </div>
    </aside>
  );
}
