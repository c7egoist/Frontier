// ArtworkOutliner.js — the Pattern Studio / Stamp Studio companion outliner (Project Zero outliner, single card).
//
// Mirrors TextureStudio's ArtworkStackWorkspace layer panel (LayerStackKit), re-cut as a tree:
//   Canvas tile (resolution · seamless / decal) ▸ groups ▸ layers (eye, lock, reorder, duplicate, delete)
//                                                     ▸ modifiers (bypass check) · mask · surface
//   Starters ▸ the starter library, by group
// No document state lives here; edits go through the inspector Hub (Apply → Render) so undo / storage stay whole.

import { icon } from "../MaterialInspector/Icons.js";
import { Esc } from "../MaterialInspector/CardKit.js";
import { Shell, TreeRow, GroupRow, RowTool, CreateOutliner, Matches } from "../MaterialInspector/OutlinerKit.js";

const MAX_LAYERS = 32;   // TextureStudio's LayerStackKit cap

export function MountArtworkOutliner(Host, Hub) {
  const { State: S, Model: A } = Hub;
  let Outliner;
  const Glyph = (L) => (L.kind === "folder" ? "folder" : A.LAYER_KINDS.find((K) => K.Kind === L.kind)?.Glyph || "motif");
  const ModDef = (M) => A.MODIFIER_DEFINITIONS.find((D) => D.type === M.type) || { label: M.type, badge: "" };
  const Mods = (L) => L.modifiers || [];

  // ---------------------------------------------------------------------------------------------- filtering
  function Passes(L, St) {
    const F = St.Filters;
    if (F.has("visible") && L.visible === false) return false;
    if (F.has("hidden") && L.visible !== false) return false;
    if (F.has("motif") && L.kind !== "motif") return false;
    if (F.has("text") && L.kind !== "text") return false;
    if (F.has("gradient") && L.kind !== "gradient") return false;
    if (F.has("mods") && !Mods(L).length) return false;
    if (F.has("masked") && !L.mask?.enabled) return false;
    if (F.has("locked") && !L.locked) return false;
    return Matches(St.Query, L.name, L.kind, L.blend, A.LayerCaption(L), ...Mods(L).map((M) => ModDef(M).label));
  }

  // ---------------------------------------------------------------------------------------------- rows
  function LayerRow(L, Depth, St, Filtering) {
    const Sel = A.Selected(S.Doc), Active = L.id === Sel.id, Folder = L.kind === "folder";
    const Kids = Folder ? S.Doc.layers.filter((E) => E.parentId === L.id).reverse() : [];
    const Children = Folder ? Kids.filter((K) => !Filtering || Passes(K, St)) : [];
    const RowId = `layer:${L.id}`;
    const HasDetail = !Folder && (Mods(L).length || L.mask?.enabled || true);
    const Open = Filtering ? Folder : Outliner.IsExpanded(RowId, Folder || (Active && Mods(L).length > 0));
    const Opacity = Math.round((L.opacity ?? 1) * 100);
    const OnCount = Mods(L).filter((M) => M.enabled !== false).length;
    const Loose = S.Doc.layers.filter((E) => E.kind !== "folder").length;
    const At = S.Doc.layers.indexOf(L);
    const Meta = Folder ? `Group · ${Kids.length} layer${Kids.length === 1 ? "" : "s"}`
      : `${A.LayerCaption(L).split(" · ")[0].toLowerCase().replace(/^./, (C) => C.toUpperCase())} · ${L.blend || "Normal"}${Opacity < 100 ? ` ${Opacity}%` : ""}${Mods(L).length ? ` · ${OnCount}/${Mods(L).length} mods` : ""}`;
    const Head = TreeRow({
      Id: RowId, Depth, Kind: Folder ? "folder" : `layer layer-${L.kind}`, Name: L.name, Meta,
      Icon: Folder ? icon("folder", 15) : `<span class="ol-layer-chip" style="--c:${A.LayerColour(L)}">${icon(Glyph(L), 12)}</span>`,
      Selected: Active && !S.Open?.startsWith?.("mod:") && S.Open !== "mask" && S.Open !== "surface",
      Muted: L.visible === false, Expandable: Folder ? Kids.length > 0 : HasDetail, Expanded: Open,
      Eye: L.visible !== false, EyeAct: "layer-vis", Draggable: !L.locked, Renaming: St.Renaming === RowId,
      Badge: (L.locked ? `<span class="ol-lock" title="Locked">${icon("lock", 11)}</span>` : "") + (L.mask?.enabled ? `<span class="ol-badge grey">MASK</span>` : ""),
      Tools: (Folder ? "" : RowTool("layer-up", L.id, "up", "Raise", At === S.Doc.layers.length - 1) + RowTool("layer-down", L.id, "down", "Lower", At === 0) + RowTool("layer-dup", L.id, "duplicate", "Duplicate", S.Doc.layers.length >= MAX_LAYERS))
        + RowTool("layer-lock", L.id, L.locked ? "lock" : "unlock", L.locked ? "Unlock" : "Lock")
        + RowTool("layer-remove", L.id, "trash", `Delete ${L.name}`, !Folder && Loose <= 1),
      Title: `${L.name}${L.locked ? " · locked" : ""} · double-click or F2 to rename`,
    });
    if (!Open) return Head;
    if (Folder) return Head + Children.map((K) => LayerRow(K, Depth + 1, St, Filtering)).join("");
    return Head + DetailRows(L, Depth + 1, Active);
  }

  function DetailRows(L, Depth, Active) {
    const Rows = Mods(L).map((M, I) => TreeRow({
      Id: `mod:${L.id}:${M.id}`, Depth, Kind: "modifier", Name: ModDef(M).label, Meta: `${ModDef(M).badge ? `${ModDef(M).badge} · ` : ""}#${I + 1} · ${A.ModifierReadout(M)}`,
      Icon: icon(A.MODIFIER_GLYPH[M.type] || "modifier", 14), Selected: Active && S.Open === `mod:${M.id}`, Muted: M.enabled === false,
      Status: M.enabled !== false, StatusAct: "mod-toggle", StatusTitle: `${M.enabled === false ? "Enable" : "Bypass"} ${ModDef(M).label}`,
      Tools: RowTool("mod-up", `${L.id}:${M.id}`, "up", "Earlier", I === 0) + RowTool("mod-down", `${L.id}:${M.id}`, "down", "Later", I === Mods(L).length - 1) + RowTool("mod-remove", `${L.id}:${M.id}`, "trash", "Remove modifier"),
    }));
    const Info = Object.fromEntries(A.LayerRows(S.Doc, L).map((R) => [R.Id, R]));
    if (L.mask?.enabled) Rows.push(TreeRow({ Id: `prop:${L.id}:mask`, Depth, Kind: "mask", Name: "Mask", Meta: Info.mask?.Text || "", Icon: icon("mask", 14), Selected: Active && S.Open === "mask", Status: true, StatusAct: "mask-toggle", StatusTitle: "Disable mask" }));
    if (Info.surface) Rows.push(TreeRow({ Id: `prop:${L.id}:surface`, Depth, Kind: "surface", Name: "Surface", Meta: Info.surface.Text, Icon: icon("layers", 14), Selected: Active && S.Open === "surface" }));
    return Rows.join("");
  }

  function StartersHtml(St) {
    const Cat = A.Catalog(S.Mode), Items = Cat.filter((E) => Matches(St.Query, E.Name, E.Group, E.Description));
    if (!Items.length || St.Filters.size) return "";
    const Open = St.Query ? true : Outliner.IsExpanded("starters", false);
    const Groups = [...new Set(Items.map((E) => E.Group))];
    return GroupRow({ Id: "starters", Depth: 0, Icon: icon("folder", 15), Name: "Starters", Meta: `${Cat.length} ${S.Mode === "pattern" ? "patterns" : "stamps"} · ${new Set(Cat.map((E) => E.Group)).size} groups`, Expandable: true, Expanded: Open })
      + (Open ? Groups.map((G) => {
        const GroupId = `sg:${G}`, GroupOpen = St.Query ? true : Outliner.IsExpanded(GroupId, Items.some((E) => E.Group === G && E.Id === S.Doc.starterId));
        const In = Items.filter((E) => E.Group === G);
        return GroupRow({ Id: GroupId, Depth: 1, Icon: icon(S.Mode === "pattern" ? "pattern" : "stamp", 14), Name: G, Meta: `${In.length}`, Expandable: true, Expanded: GroupOpen })
          + (GroupOpen ? In.map((E) => TreeRow({ Id: `starter:${E.Id}`, Depth: 2, Kind: "starter", Name: E.Name, Meta: E.Description, Icon: icon(S.Mode === "pattern" ? "pattern" : "stamp", 13), Selected: E.Id === S.Doc.starterId, Title: E.Description })).join("") : "");
      }).join("") : "");
  }

  function Html(St) {
    const D = S.Doc, St2 = Hub.CurrentStats(), Mode = A.MODES[S.Mode];
    const Filtering = !!St.Query.trim() || St.Filters.size > 0;
    const Pattern = S.Mode === "pattern";
    const Visible = D.layers.filter((L) => L.kind !== "folder" && L.visible !== false).length, Total = D.layers.filter((L) => L.kind !== "folder").length;
    const AllMods = D.layers.flatMap(Mods), OnMods = AllMods.filter((M) => M.enabled !== false).length;
    const Top = D.layers.filter((L) => !L.parentId || !A.FindLayer(D, L.parentId)).reverse();
    const RootOpen = Outliner ? Outliner.IsExpanded("canvas", true) : true;
    let Body = "";
    if (Filtering) {
      // Flat, but folders still show when any child matches.
      Body = Top.map((L) => (L.kind === "folder"
        ? (D.layers.some((K) => K.parentId === L.id && Passes(K, St)) || Passes(L, St) ? LayerRow(L, 1, St, true) : "")
        : Passes(L, St) ? LayerRow(L, 1, St, true) : "")).join("");
    } else if (RootOpen) Body = Top.map((L) => LayerRow(L, 1, St, false)).join("");
    const Canvas = TreeRow({
      Id: "canvas", Depth: 0, Kind: "root", Icon: `<span class="ol-thumb" style="background-image:${Hub.ThumbUrl()}"></span>`, Name: D.name,
      Meta: `${Pattern ? "Canvas tile" : "Decal"} · ${D.resolution || 1024} px · ${D.background?.enabled ? "ground on" : "no ground"}`,
      Badge: `<span class="ol-badge ${Pattern ? "green" : "blue"}">${Pattern ? "SEAMLESS" : "CUTOUT"}</span>`,
      Expandable: true, Expanded: RootOpen || Filtering, Selected: false,
    });
    const Full = D.layers.length >= MAX_LAYERS;
    return Shell({
      Label: `${Mode.Title} outliner`, Title: "Layers", Meta: `${Mode.Title} · ${Mode.Tag.toLowerCase()}`,
      Tools: `<button type="button" class="ol-round" data-act="add-folder" ${Full ? "disabled" : ""} title="Group the selected layer" aria-label="New group">${icon("folder", 14)}</button>`,
      Stats: [
        { Label: "Visible", Value: `${Visible}/${Total}`, Act: "stat-visible", Tone: Visible === Total ? "on" : "muted", Glyph: "eye", Title: "Show visible layers only" },
        { Label: "Modifiers", Value: `${OnMods}/${AllMods.length}`, Act: "stat-mods", Tone: OnMods ? "on" : "muted", Glyph: "modifier", Title: "Show layers with modifiers" },
      ],
      Placeholder: "Search layers, modifiers…",
      Filters: [["Visible", "visible"], ["Hidden", "hidden"], ["Motifs", "motif"], ["Text", "text"], ["Gradients", "gradient"], ["With modifiers", "mods"], ["Masked", "masked"], ["Locked", "locked"]],
      Chips: Filtering ? "" : `<span class="ol-chip-row">${A.LAYER_KINDS.map((K) => `<button type="button" data-act="add-layer" data-kind="${K.Kind}" ${Full ? "disabled" : ""} title="${Esc(K.Hint)}">${icon("plus", 10)}${K.Label}</button>`).join("")}</span>`,
      Rows: Canvas + Body + StartersHtml(St), Empty: "No layers match",
      Footer: [
        { Label: "Layers", Value: `${D.layers.length}`, Unit: `/ ${MAX_LAYERS}`, Tone: Full ? "warn" : "" },
        { Label: "Instances", Value: St2.Instances >= 1000 ? `${(St2.Instances / 1000).toFixed(1)}k` : `${St2.Instances}` },
        { Label: "Coverage", Value: `${Math.round(St2.Coverage * 100)}`, Unit: "%" },
        Pattern ? { Label: "Seam", Value: St2.Wraps ? `${St2.Wraps} wrap` : "Clean", Tone: "" }
          : { Label: "Margin", Value: St2.Clipped ? `−${Math.round(-St2.Margin)}` : `${Math.round(St2.Margin)}`, Unit: "px", Tone: St2.Clipped ? "warn" : "" },
      ],
    }, St);
  }

  // ---------------------------------------------------------------------------------------------- actions
  function OnSelect(RowId) {
    const [Kind, A1, A2] = RowId.split(":");
    if (Kind === "layer") Hub.SelectLayer(A1, null);
    else if (Kind === "mod") Hub.SelectLayer(A1, `mod:${A2}`);
    else if (Kind === "prop") Hub.SelectLayer(A1, A2);
    else if (Kind === "starter") { if (A1 !== S.Doc.starterId) Hub.Load(RowId.slice(8)); }
    else { Outliner.State.Expanded[RowId] = Host.querySelector(`[data-row="${CSS.escape(RowId)}"]`)?.getAttribute("aria-expanded") !== "true"; Outliner.Render(); }
    Outliner.FocusRow(RowId);
  }

  function Commit(Next, Message) { Hub.Apply(Next); Hub.Render(); if (Message) Hub.Flash(Message); }

  function Remove(Id) {
    const L = A.FindLayer(S.Doc, Id);
    if (!L) return;
    if (L.locked) return Hub.Flash(`${L.name} is locked`);
    const Next = A.RemoveLayer(S.Doc, Id);
    if (Next === S.Doc) return Hub.Flash("A document keeps at least one layer");
    S.Open = null;
    Commit(Next, `${L.name} deleted`);
  }

  function OnAction(Act, El) {
    const Id = El.dataset.id?.replace(/^layer:/, ""), D = S.Doc;
    switch (Act) {
      case "layer-vis": { const L = A.FindLayer(D, Id); Commit(A.EditLayer(D, Id, (E) => { E.visible = E.visible === false; }), `${L.name} ${L.visible === false ? "shown" : "hidden"}`); return true; }
      case "layer-lock": { const L = A.FindLayer(D, Id); Commit(A.SetLocked(D, Id, !L.locked), `${L.name} ${L.locked ? "unlocked" : "locked"}`); return true; }
      case "layer-up": Commit(A.MoveLayer(D, Id, 1)); Outliner.FocusRow(`layer:${Id}`); return true;
      case "layer-down": Commit(A.MoveLayer(D, Id, -1)); Outliner.FocusRow(`layer:${Id}`); return true;
      case "layer-dup": { const R = A.DuplicateLayer(D, Id); Commit(R.Doc, "Layer duplicated"); return true; }
      case "layer-remove": Remove(Id); return true;
      case "add-layer": {
        if (D.layers.length >= MAX_LAYERS) return Hub.Flash(`Layer limit reached (${MAX_LAYERS})`), true;
        const R = A.AddLayer(D, El.dataset.kind);
        S.Open = El.dataset.kind === "text" ? "text" : El.dataset.kind === "motif" ? "shape" : "fill";
        Commit(R.Doc, `${El.dataset.kind[0].toUpperCase()}${El.dataset.kind.slice(1)} layer added`);
        return true;
      }
      case "add-folder": { const R = A.AddFolder(D); Outliner.State.Expanded[`layer:${R.Id}`] = true; Commit(R.Doc, "Group created"); return true; }
      case "mod-toggle": { const [L, M] = Id.split(":").slice(1); Commit(A.EditLayer(D, L, (E) => { const X = E.modifiers.find((Q) => Q.id === M); X.enabled = X.enabled === false; })); return true; }
      case "mod-up": case "mod-down": { const [L, M] = Id.split(":"); Commit(A.MoveModifier(D, L, M, Act === "mod-up" ? -1 : 1)); return true; }
      case "mod-remove": { const [L, M] = Id.split(":"); if (S.Open === `mod:${M}`) S.Open = null; Commit(A.RemoveModifier(D, L, M), "Modifier removed"); return true; }
      case "mask-toggle": { const L = Id.split(":")[1]; Commit(A.EditLayer(D, L, (E) => { E.mask = { ...E.mask, enabled: !E.mask?.enabled }; }), "Mask disabled"); return true; }
      case "stat-visible": Outliner.State.Filters.has("visible") ? Outliner.State.Filters.delete("visible") : Outliner.State.Filters.add("visible"); Outliner.Render(); return true;
      case "stat-mods": Outliner.State.Filters.has("mods") ? Outliner.State.Filters.delete("mods") : Outliner.State.Filters.add("mods"); Outliner.Render(); return true;
      default: return false;
    }
  }

  Outliner = CreateOutliner(Host, {
    Html, OnSelect, OnAction,
    CanRename: (RowId) => RowId.startsWith("layer:"),
    OnRename: (RowId, Name) => Commit(A.EditLayer(S.Doc, RowId.slice(6), (E) => { E.name = Name; })),
    OnDelete: (RowId) => RowId.startsWith("layer:") && Remove(RowId.slice(6)),
    OnSpace: (RowId) => RowId.startsWith("layer:") && OnAction("layer-vis", { dataset: { id: RowId } }),
    CanNest: (Drag, Target) => Drag && Target.startsWith("layer:") && A.CanNest(S.Doc, Drag.slice(6), Target.slice(6)),
    CanDrop: (Drag, Target) => Drag.startsWith("layer:") && Target.startsWith("layer:"),
    OnDrop: (Drag, Target, Where) => Commit(A.PlaceLayer(S.Doc, Drag.slice(6), Target.slice(6), Where)),
  });

  Hub.Subscribe(() => Outliner.Render());
  Outliner.Render();
  return Outliner;
}
