// PaintOutliner.js — the Texture Paint companion outliner (Project Zero outliner, single card).
//
// Mirrors TextureStudio TexturePaintWorkspace's left "Layers" panel (eye, lock, thumbnail, name, blend, drag to reorder,
// folders), re-cut as the shared OutlinerKit tree:
//   Mesh ▸ part list (the part filter targets)
//   Layers, top of the stack first ▸ folders ▸ their layers ▸ a layer's mask and stamps
// Each layer row reads  blend · opacity · n ch  with six channel peek dots, an eye and a lock.  Drag rows to reorder or
// drop onto a folder; F2 / double-click renames; Delete removes; Space toggles visibility.
// No state lives here; every edit goes through the inspector (PaintInspector.Mount → Inspector).

import { icon } from "../MaterialInspector/Icons.js";
import { Esc, Dropdown } from "../MaterialInspector/CardKit.js";
import { Shell, TreeRow, GroupRow, RowTool, CreateOutliner, Matches } from "../MaterialInspector/OutlinerKit.js";
import { PAINT_CHANNEL } from "../MaterialInspector/ChannelStack.js";

export function MountPaintOutliner(Host, Inspector) {
  const { State: S, Model: B } = Inspector;
  let Outliner;

  // Six peek dots: the first channels the layer writes, coloured by their value (or the channel tint).
  function Peek(L) {
    if (L.kind === "folder") return "";
    const Stack = B.LayerStack(L), Shown = Stack.on.slice(0, 6);
    const Dot = (Ch) => {
      const C = PAINT_CHANNEL[Ch], V = Stack.per[Ch]?.value;
      const Fill = C.Type === "colour" ? (typeof V === "string" ? V : C.Tint) : `color-mix(in srgb, ${C.Tint} ${Math.round(V ?? 100)}%, #1a1a1a)`;
      return `<i style="background:${Fill}" title="${Esc(C.Label)}"></i>`;
    };
    return `<span class="pi-peek">${Shown.map(Dot).join("")}${Stack.on.length > 6 ? `<em>+${Stack.on.length - 6}</em>` : ""}</span>`;
  }

  function Passes(L, St) {
    if (St.Filters.has("hidden") && L.visible) return false;
    if (St.Filters.has("locked") && !L.locked) return false;
    if (St.Filters.has("masked") && !L.mask) return false;
    for (const T of B.LAYER_TYPES) if (St.Filters.has(`type:${T.Id}`) && L.kind !== T.Id) return false;
    return Matches(St.Query, L.name, B.LAYER_TYPE[L.kind].Label, L.blend, ...B.LayerStack(L).on.map((Ch) => PAINT_CHANNEL[Ch].Label));
  }
  // A folder survives filtering when any layer inside it does.
  const Survives = (L, St) => Passes(L, St) || (L.kind === "folder" && B.TopFirst(S.P, L.id).some((K) => Survives(K, St)));

  function LayerRows(St, Filtering, EnclosingId = null, Depth = 1) {
    return B.TopFirst(S.P, EnclosingId).map((L) => {
      if (Filtering && !Survives(L, St)) return "";
      const T = B.LAYER_TYPE[L.kind], Folder = L.kind === "folder", Kids = Folder ? B.TopFirst(S.P, L.id) : [];
      const Extras = (L.mask ? 1 : 0) + (L.kind === "decal" || L.kind === "text" ? L.stamps.length : 0);
      const Expandable = Folder ? Kids.length > 0 : Extras > 0;
      const Open = Expandable && (Filtering ? Folder : Outliner.IsExpanded(`layer:${L.id}`, Folder));
      const Shown = B.Effective(S.P, L);
      let Html = TreeRow({
        Id: `layer:${L.id}`, Depth, Kind: `layer ${L.locked ? "locked" : ""}`, Draggable: true, Renaming: St.Renaming === `layer:${L.id}`,
        Icon: `<span class="pi-type" style="--c:${B.LAYER_TONES[L.kind]}">${icon(T.Icon, 14)}</span>`,
        Name: L.name, Selected: S.P.selectedLayerId === L.id, Muted: !Shown,
        Meta: Folder ? `${Kids.length} layer${Kids.length === 1 ? "" : "s"} · ${L.blend.toLowerCase()} · ${Math.round(L.opacity * 100)}%`
          : `${L.blend.toLowerCase()} · ${Math.round(L.opacity * 100)}% · ${B.LayerStack(L).on.length} ch${L.partFilter >= 0 ? ` · ${B.PartOptions(S.P).find(([, V]) => V === L.partFilter)?.[0] || "part"}` : ""}`,
        Badge: Peek(L) + (L.mask ? `<span class="ol-badge ${L.mask.enabled ? "" : "grey"}" title="Mask ${L.mask.enabled ? "on" : "off"}">MASK</span>` : ""),
        Tools: RowTool("layer-lock", `layer:${L.id}`, L.locked ? "lock" : "unlock", L.locked ? `Unlock ${L.name}` : `Lock ${L.name}`),
        Eye: L.visible, EyeAct: "layer-eye", Expandable, Expanded: Open, Title: `${L.name} — ${T.Label} layer${L.locked ? " (locked)" : ""}`,
      });
      if (!Open) return Html;
      if (Folder) return Html + LayerRows(St, Filtering, L.id, Depth + 1);
      if (L.mask) Html += TreeRow({ Id: `mask:${L.id}`, Depth: Depth + 1, Kind: "mask", Icon: icon("mask", 13), Name: "Mask", Muted: !L.mask.enabled,
        Meta: `${B.MASK_PRESETS.find(([, V]) => V === L.mask.preset)?.[0] || "Manual"}${L.mask.invert ? " · inverted" : ""} · ${Math.round(L.mask.opacity * 100)}%`,
        Status: L.mask.enabled, StatusAct: "mask-toggle", StatusTitle: `${L.mask.enabled ? "Disable" : "Enable"} the mask` });
      if (L.kind === "decal" || L.kind === "text") Html += L.stamps.map((E) => TreeRow({ Id: `stamp:${L.id}:${E.id}`, Depth: Depth + 1, Kind: "stamp",
        Icon: `<span class="pi-stamp-dot" style="background:${E.tint}"></span>`, Name: E.name, Meta: `${E.projection.toUpperCase()} · ${Math.round(E.scale * 100)}% · ${Math.round(E.rotation)}°`,
        Selected: S.P.selectedLayerId === L.id && (S.Stamp[L.id] || L.selectedStampId) === E.id })).join("");
      return Html;
    }).join("");
  }

  function MeshRows() {
    const M = B.MESHES.find((E) => E.id === S.P.meshId), Open = Outliner.IsExpanded("mesh", false);
    return TreeRow({ Id: "mesh", Depth: 0, Kind: "root", Icon: icon("cube", 15), Name: M?.label || S.P.meshId, Meta: `${M?.parts.length || 0} parts · ${S.P.resolution} px document`,
      Badge: `<span class="ol-badge grey">${S.P.resolution >= 1024 ? `${S.P.resolution / 1024}K` : S.P.resolution}</span>`, Expandable: true, Expanded: Open, Title: "Paint target mesh — layers can filter to one part" })
      + (Open ? (M?.parts || []).map((N, I) => TreeRow({ Id: `part:${I}`, Depth: 1, Kind: "part", Icon: icon("shape", 13), Name: N,
        Meta: `${S.P.layers.filter((L) => L.partFilter === I).length} layer${S.P.layers.filter((L) => L.partFilter === I).length === 1 ? "" : "s"} filtered` })).join("") : "");
  }

  function Html(St) {
    const P = S.P, N = B.Stats(P), Filtering = !!St.Query.trim() || St.Filters.size > 0;
    const Visible = P.layers.filter((L) => L.kind !== "folder" && B.Effective(P, L)).length, Total = P.layers.filter((L) => L.kind !== "folder").length;
    const Rows = LayerRows(St, Filtering);
    return Shell({
      Label: "Texture paint layer outliner", Title: "Layers", Meta: `Texture Paint · ${B.MeshLabel(P)}`,
      Tools: `<span class="pi-add">${Dropdown("layer-add", B.LAYER_TYPES.map((T) => [T.Label, T.Id, T.Icon, T.Hint]), null, { Label: "Add a layer", Placeholder: "Add", Class: "compact ol-add-dd", Search: false })}</span>`,
      Stats: [
        { Label: "Layers", Value: `${Visible}/${Total}`, Act: "stat-hidden", Tone: Visible ? "on" : "muted", Glyph: "layers", Title: "Visible / total — show hidden layers only" },
        { Label: "Channels", Value: `${N.Painted}/${B.PAINT_CHANNELS.length}`, Act: "stat-masked", Tone: N.Painted ? "on" : "muted", Glyph: "paint", Title: "Paint channels written by a visible layer — show masked layers" },
      ],
      Placeholder: "Search layers…",
      Filters: [...B.LAYER_TYPES.filter((T) => P.layers.some((L) => L.kind === T.Id)).map((T) => [T.Label, `type:${T.Id}`]), ["With mask", "masked"], ["Hidden", "hidden"], ["Locked", "locked"]],
      Rows: (Filtering ? "" : MeshRows()) + (Filtering ? Rows : GroupRow({ Id: "stack", Depth: 0, Icon: icon("layers", 15), Name: "Layer stack", Meta: "top of the stack first", Expandable: false, Expanded: true }) + Rows),
      Empty: "No layers match",
      Footer: [
        { Label: "Res", Value: P.resolution >= 1024 ? `${P.resolution / 1024}K` : String(P.resolution) },
        { Label: "Layers", Value: String(N.Layers) },
        { Label: "Masks", Value: String(N.Masks) },
        { Label: "Painted", Value: `${N.Painted}`, Tone: N.Painted ? "" : "warn" },
      ],
    }, St);
  }

  const Split = (RowId) => [RowId.slice(0, RowId.indexOf(":")), RowId.slice(RowId.indexOf(":") + 1)];
  const LayerId = (RowId) => { const [T, Id] = Split(RowId); return T === "layer" || T === "mask" ? Id : T === "stamp" ? Id.split(":")[0] : null; };
  const Flip = (Key) => { const F = Outliner.State.Filters; F.has(Key) ? F.delete(Key) : F.add(Key); Outliner.Render(); };

  function OnSelect(RowId) {
    const [T, Id] = Split(RowId);
    if (T === "layer" || T === "mask") Inspector.OpenLayer(Id);
    else if (T === "stamp") { const [L, E] = Id.split(":"); S.Stamp[L] = E; Inspector.OpenLayer(L); }
    else if (RowId === "mesh") { Outliner.State.Expanded.mesh = !Outliner.IsExpanded("mesh", false); Outliner.Render(); }
    else return;
    Outliner.FocusRow(RowId);
  }

  function OnAction(Act, El) {
    const Id = LayerId(El.dataset.id || ""), L = Id && B.Layer(S.P, Id);
    switch (Act) {
      case "layer-eye": if (L) Inspector.Edit(Id, { visible: !L.visible }); return true;
      case "layer-lock": if (L) { Inspector.Edit(Id, { locked: !L.locked }); Inspector.Flash(`${L.name} ${L.locked ? "unlocked" : "locked"}`); } return true;
      case "mask-toggle": if (L?.mask) { if (L.locked) return Inspector.Flash("Layer is locked"), true; Inspector.Edit(Id, { mask: { ...L.mask, enabled: !L.mask.enabled } }); } return true;
      case "layer-add": { const New = Inspector.Add(El.dataset.value); const At = B.Layer(S.P, New); if (At?.parentId) Outliner.State.Expanded[`layer:${At.parentId}`] = true; Outliner.Render(); Outliner.FocusRow(`layer:${New}`); return true; }
      case "stat-hidden": Flip("hidden"); return true;
      case "stat-masked": Flip("masked"); return true;
      default: return false;
    }
  }

  Outliner = CreateOutliner(Host, {
    Html, OnSelect, OnAction,
    OnSpace: (RowId) => (LayerId(RowId) && Split(RowId)[0] === "layer" ? OnAction("layer-eye", { dataset: { id: RowId } }) : false),
    CanRename: (RowId) => Split(RowId)[0] === "layer",
    OnRename: (RowId, Name) => Inspector.Rename(LayerId(RowId), Name),
    OnDelete: (RowId) => { if (Split(RowId)[0] === "layer") Inspector.Remove(LayerId(RowId)); },
    CanNest: (Drag, Target) => Split(Target)[0] === "layer" && B.Layer(S.P, LayerId(Target))?.kind === "folder" && !B.Descends(S.P, LayerId(Target), LayerId(Drag)),
    CanDrop: (Drag, Target) => Split(Drag)[0] === "layer" && Split(Target)[0] === "layer",
    OnDrop: (Drag, Target, Where) => { if (Inspector.Move(LayerId(Drag), LayerId(Target), Where) && Where === "inside") { Outliner.State.Expanded[Target] = true; Outliner.Render(); } },
  });

  Inspector.Subscribe(() => Outliner.Render());
  Outliner.Render();
  return Outliner;
}
