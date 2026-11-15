// BakeOutliner.js — the Map Baking companion outliner (Project Zero outliner, single card).
//
// Mirrors TextureStudio's BakingWorkspace left panel (quick-select chips, grouped map tiles with a preview, check toggle and
// "Ready" state), re-cut as a tree:
//   Study (low / high sources) ▸ map groups (queue check, size) ▸ maps (preview swatch, queue check, Ready / Stale / Baking)
//   Studies ▸ the study library
// With a bake set (one character, many meshes) the tree becomes
//   Character ▸ Body / Clothing / Props ▸ part (enable, state, per-part progress) ▸ that part's maps
//   Set queue ▸ map groups ▸ maps (the default queue every part follows)
//   Targets ▸ set templates + single studies
// No state lives here; edits go through the inspector Hub, and bake progress re-renders this card live.

import { icon } from "../MaterialInspector/Icons.js";
import { Esc, Dropdown } from "../MaterialInspector/CardKit.js";
import { Shell, TreeRow, GroupRow, CreateOutliner, Matches } from "../MaterialInspector/OutlinerKit.js";

const GLYPH = { Normals: "normal", Surface: "surface", "Masks & IDs": "id", "Volume & Distance": "volume" };

// A look-alike preview per map (the real tile shows the baked texture; before a bake this reads as the map's character).
const PREVIEW = {
  normalTangent: "radial-gradient(circle at 40% 35%, #b4b4ff, #8080ff 55%, #5a5ad8)",
  normalWorld: "conic-gradient(from 200deg, #ff8080, #80ff80, #8080ff, #ff8080)",
  normalObject: "linear-gradient(135deg, #e07a7a, #7ae07a 50%, #7a7ae0)",
  bentNormal: "radial-gradient(circle at 60% 30%, #c0d0ff, #6a78d8 60%, #3a3a90)",
  bevelNormal: "linear-gradient(90deg, #6060e0, #8080ff 20% 80%, #a0a0ff)",
  ao: "radial-gradient(circle at 50% 45%, #f2f2f2, #9a9a9a 55%, #2a2a2a)",
  secondaryAo: "radial-gradient(circle at 50% 50%, #fafafa 40%, #6a6a6a 75%, #1a1a1a)",
  curvature: "linear-gradient(135deg, #3a3a3a, #808080 40% 60%, #e8e8e8)",
  convexity: "radial-gradient(circle at 30% 30%, #ffffff, #7a7a7a 35%, #3a3a3a)",
  concavity: "radial-gradient(circle at 70% 70%, #0a0a0a, #6a6a6a 40%, #9a9a9a)",
  thickness: "radial-gradient(circle at 50% 50%, #ff9a60, #a0301a 60%, #300a06)",
  height: "linear-gradient(180deg, #ececec, #6a6a6a 60%, #1a1a1a)",
  topDust: "linear-gradient(180deg, #e8dfc8, #8a8270 45%, #2a2824)",
  uvIslandId: "conic-gradient(#ff6b5e 0 25%, #46d267 0 50%, #4d9bff 0 75%, #ffb238 0)",
  partId: "linear-gradient(90deg, #c48cff 0 33%, #46d267 0 66%, #ff6b5e 0)",
  position: "linear-gradient(135deg, #000 0%, #f00 30%, #ff0 60%, #fff)",
  wireframe: "repeating-linear-gradient(45deg, #1a1a1a 0 4px, #4d9bff 4px 5px)",
  volumeSdf: "repeating-radial-gradient(circle at 50% 50%, #c48cff 0 2px, #2a1a40 2px 6px)",
};

export function MountBakeOutliner(Host, Hub) {
  const { State: S, Model: B } = Hub;
  let Outliner;

  function MapState(Id) {
    if (S.P.set) return null;
    if (S.Run) {
      const At = S.Run.Queue.indexOf(Id);
      if (At > -1 && At === S.Run.Index) return { Badge: "BAKING", Tone: "" };
      if (At > -1 && At < S.Run.Index) return { Badge: "DONE", Tone: "green" };
      if (At > -1) return { Badge: `#${At + 1}`, Tone: "grey" };
      return null;
    }
    if (!S.Result?.Maps?.includes(Id)) return null;
    const Fresh = S.Result.Fingerprint === B.Fingerprint(S.P);
    return Fresh ? { Badge: "READY", Tone: "green" } : { Badge: "STALE", Tone: "" };
  }

  function Passes(M, St) {
    const On = S.P.selected.includes(M.id), State = MapState(M.id), Cost = B.MapCost(S.P, M.id);
    if (St.Filters.has("queued") && !On) return false;
    if (St.Filters.has("skipped") && On) return false;
    if (St.Filters.has("ready") && State?.Badge !== "READY") return false;
    if (St.Filters.has("rays") && !Cost.Rays) return false;
    if (St.Filters.has("free") && Cost.Rays) return false;
    return Matches(St.Query, M.label, M.short, M.group, M.id);
  }

  function MapRows(St, Filtering, Base = 0) {
    return B.GROUPS.map((G) => {
      const All = B.BAKE_MAP_CATALOG.filter((M) => M.group === G), Maps = All.filter((M) => Passes(M, St));
      if (Filtering && !Maps.length) return "";
      const On = All.filter((M) => S.P.selected.includes(M.id)), GroupId = `grp:${G}`;
      const Open = Filtering ? true : Outliner.IsExpanded(GroupId, On.length > 0 || All.some((M) => M.id === S.Open));
      const Bytes = On.reduce((A, M) => A + B.MapCost(S.P, M.id).Bytes, 0);
      const Head = GroupRow({
        Id: GroupId, Depth: Base, Kind: "bake-group", Icon: `<span class="ol-group-glyph" style="--c:${B.GROUP_COLOURS[G]}">${icon(GLYPH[G], 14)}</span>`,
        Name: G, Meta: `${On.length}/${All.length} queued${On.length ? ` · ${B.Bytes(Bytes)}` : ""}`, Expandable: true, Expanded: Open,
        Status: On.length === All.length, StatusAct: "group-toggle", StatusTitle: On.length === All.length ? `Skip all ${G}` : `Queue all ${G}`,
        Badge: On.length && On.length < All.length ? `<span class="ol-partial" title="Some queued"></span>` : "",
      });
      if (!Open) return Head;
      return Head + Maps.map((M) => {
        const Queued = S.P.selected.includes(M.id), State = MapState(M.id), C = B.MapCost(S.P, M.id);
        return TreeRow({
          Id: `map:${M.id}`, Depth: Base + 1, Kind: `map ${State?.Badge === "BAKING" ? "running" : ""}`, Name: M.label,
          Meta: `${M.short}${Queued ? ` · ${B.Bytes(C.Bytes)}${C.Rays ? ` · ${B.Count(C.Rays)} rays` : ""}` : ""}`,
          Icon: `<span class="ol-map-preview" style="background:${PREVIEW[M.id] || "#333"}"></span>`, Selected: S.Open === M.id, Muted: !Queued,
          Status: Queued, StatusAct: "map-toggle", StatusTitle: `${Queued ? "Skip" : "Queue"} ${M.label}`,
          Badge: State ? `<span class="ol-badge ${State.Tone}">${State.Badge}</span>` : "",
          Title: `${M.label} — ${M.short}`,
        });
      }).join("");
    }).join("");
  }

  function StudyRows(St) {
    const Study = B.Study(S.P), Open = Outliner.IsExpanded("study", false);
    const Src = (Slot, Label) => TreeRow({
      Id: `src:${Slot}`, Depth: 1, Kind: "source", Icon: icon("cube", 14), Name: `${Label} mesh`,
      Meta: S.P[Slot] ? `${S.P[Slot].name}${S.P[Slot].size ? ` · ${Math.max(1, Math.round(S.P[Slot].size / 1024))} KB` : ""}` : `Study mesh · ${Study.complexity}`,
      Badge: `<span class="ol-badge ${S.P[Slot] ? "blue" : "grey"}">${S.P[Slot] ? "CUSTOM" : "STUDY"}</span>`,
    });
    return TreeRow({ Id: "study", Depth: 0, Kind: "root", Icon: icon("bake", 15), Name: Study.name, Meta: `${Study.family} · ${Study.complexity} · ${Study.topo}`,
      Badge: `<span class="ol-badge grey">${S.P.resolution >= 1024 ? `${S.P.resolution / 1024}K` : S.P.resolution}</span>`, Expandable: true, Expanded: Open, Title: Study.desc })
      + (Open ? Src("highSource", "High") + Src("lowSource", "Low") : "");
  }

  // ---------------------------------------------------------------------------------------------- bake set rows
  function PartPasses(P, St) {
    if (St.Filters.has("enabled") && !P.enabled) return false;
    if (St.Filters.has("stale") && Hub.PartBadge(P)?.Badge !== "STALE") return false;
    return Matches(St.Query, P.name, B.KIND[P.kind].Label, B.KIND[P.kind].Category, ...B.PartMaps(S.P, P).map((M) => B.MAP[M].label));
  }

  function SetRows(St, Filtering) {
    const Set = S.P.set, E = B.Estimate(S.P), Open = Filtering || Outliner.IsExpanded("set", true);
    const Out = Set.output === "atlas" ? `ATLAS ${Set.atlasRes / 1024}K` : Set.output === "udim" ? "UDIM" : "PER PART";
    let Html = TreeRow({ Id: "set", Depth: 0, Kind: "root", Icon: icon("person", 15), Name: Set.name, Meta: `${E.Parts}/${E.TotalParts} parts · ${E.Files} files · ${B.ISOLATIONS.find((I) => I.Id === Set.isolation).Label.toLowerCase()}`,
      Badge: `<span class="ol-badge grey">${Out}</span>`, Expandable: true, Expanded: Open, Title: "Bake set — every enabled part is baked in one run" });
    if (!Open) return Html;
    for (const C of B.PART_CATEGORIES) {
      const All = Set.parts.filter((P) => B.KIND[P.kind].Category === C), Parts = All.filter((P) => PartPasses(P, St));
      if (!All.length || (Filtering && !Parts.length)) continue;
      const On = All.filter((P) => P.enabled), GroupId = `cat:${C}`, GOpen = Filtering || Outliner.IsExpanded(GroupId, true);
      const Bytes = On.reduce((A, P) => A + (E.PerPart[P.id]?.Bytes || 0), 0);
      Html += GroupRow({ Id: GroupId, Depth: 1, Kind: "bake-cat", Icon: `<span class="ol-group-glyph" style="--c:${B.CATEGORY_COLOURS[C]}">${icon(B.CATEGORY_GLYPH[C], 14)}</span>`,
        Name: C, Meta: `${On.length}/${All.length} baking${On.length && Set.output !== "atlas" ? ` · ${B.Bytes(Bytes)}` : ""}`, Expandable: true, Expanded: GOpen,
        Status: On.length === All.length, StatusAct: "cat-toggle", StatusTitle: On.length === All.length ? `Skip all ${C}` : `Bake all ${C}`,
        Badge: On.length && On.length < All.length ? `<span class="ol-partial" title="Some enabled"></span>` : "" });
      if (!GOpen) continue;
      for (const P of Parts) {
        const K = B.KIND[P.kind], Maps = B.PartMaps(S.P, P), POpen = Outliner.IsExpanded(`part:${P.id}`, false), Bd = Hub.PartBadge(P);
        const Res = Set.output === "atlas" ? `${Math.round(B.AtlasShare(S.P, P) * 100)}% atlas` : Set.output === "udim" ? `tile ${P.enabled ? B.UdimTile(S.P, P) : "—"} · ${B.PartRes(S.P, P)}` : `${B.PartRes(S.P, P)} px`;
        Html += TreeRow({ Id: `part:${P.id}`, Depth: 2, Kind: `part ${Bd?.Badge?.endsWith("%") ? "running" : ""}`, Name: P.name,
          Meta: `${B.Count(B.PartTris(P))} tris · ${Res} · ${Maps.length} maps${P.maps ? " (own)" : ""}${P.highSource ? "" : " · no high mesh"}`,
          Icon: `<span class="ol-part-glyph" style="--c:${B.CATEGORY_COLOURS[C]}">${icon(K.Glyph, 14)}</span>`, Selected: S.Part === P.id && !S.Open?.startsWith?.("_"), Muted: !P.enabled,
          Expandable: true, Expanded: POpen, Status: P.enabled, StatusAct: "part-toggle", StatusTitle: `${P.enabled ? "Skip" : "Bake"} ${P.name}`,
          Badge: Bd ? `<span class="ol-badge ${Bd.Tone}">${Bd.Badge}</span>` : "", Title: `${P.name} — ${K.Label}` });
        if (POpen) Html += B.BAKE_MAP_CATALOG.filter((M) => Maps.includes(M.id) || P.maps).map((M) => {
          const On = Maps.includes(M.id), J = Hub.JobState(P.id, M.id);
          return TreeRow({ Id: `pmap:${P.id}:${M.id}`, Depth: 3, Kind: `map ${J?.State === "running" ? "running" : ""}`, Name: M.label, Meta: On ? B.Bytes(B.MapCost(S.P, M.id, P).Bytes) : "skipped",
            Icon: `<span class="ol-map-preview" style="background:${PREVIEW[M.id] || "#333"}"></span>`, Muted: !On, Status: On, StatusAct: "pmap-toggle", StatusTitle: `${On ? "Skip" : "Bake"} ${M.label} on ${P.name}`,
            Badge: J ? `<span class="ol-badge ${J.State === "done" ? "green" : J.State === "queued" ? "grey" : ""}">${J.State === "running" ? "BAKING" : J.State === "done" ? "DONE" : `#${J.At}`}</span>` : "" });
        }).join("");
      }
    }
    return Html;
  }

  function QueueRows(St, Filtering) {
    const Open = Filtering || Outliner.IsExpanded("queue", false), Inner = Open ? MapRows(St, Filtering, 1) : "";
    if (Filtering && !Inner) return "";
    return GroupRow({ Id: "queue", Depth: 0, Icon: icon("layers", 15), Name: "Set queue", Meta: `${S.P.selected.length} maps · parts follow it unless they have their own`, Expandable: true, Expanded: Open })
      + Inner;
  }

  function LibraryHtml(St) {
    const Items = B.BAKE_STUDY_SHAPES.filter((E) => Matches(St.Query, E.name, E.family, E.role, E.desc));
    const Sets = B.SET_TEMPLATES.filter((T) => Matches(St.Query, T.Label, T.Hint, "character"));
    if ((!Items.length && !Sets.length) || St.Filters.size) return "";
    const Open = St.Query ? true : Outliner.IsExpanded("studies", false);
    return GroupRow({ Id: "studies", Depth: 0, Icon: icon("folder", 15), Name: "Targets", Meta: `${B.SET_TEMPLATES.length} bake sets · ${B.BAKE_STUDY_SHAPES.length} studies`, Expandable: true, Expanded: Open })
      + (Open ? Sets.map((T) => TreeRow({ Id: `tpl:${T.Id}`, Depth: 1, Kind: "study", Icon: icon("person", 13), Name: T.Label, Meta: T.Hint, Selected: S.P.set?.template === T.Id, Title: T.Hint })).join("")
        + Items.map((E) => TreeRow({ Id: `studyset:${E.id}`, Depth: 1, Kind: "study", Icon: icon("cube", 13), Name: E.name, Meta: `${E.role} · ${E.complexity}`, Selected: !S.P.set && E.id === S.P.studyId, Title: E.desc })).join("") : "");
  }

  function Html(St) {
    const P = S.P, E = B.Estimate(P), R = Hub.ResultState(), Filtering = !!St.Query.trim() || St.Filters.size > 0;
    const Ready = S.Result && R.Label === "Fresh" ? S.Result.Maps.length : 0, Match = B.PresetMatch(P), Set = P.set;
    const SetStats = Set && [
      { Label: "Parts", Value: `${E.Parts}/${E.TotalParts}`, Act: "stat-enabled", Tone: E.Parts ? "on" : "muted", Glyph: "person", Title: "Show enabled parts only" },
      { Label: S.Run ? "Baking" : R.Stale ? `${R.Stale} stale` : "Fresh", Value: S.Run ? `${Math.round(S.Run.Progress * 100)}%` : R.Stale != null ? `${E.Parts - R.Stale}/${E.Parts}` : `0/${E.Parts}`, Act: "stat-stale", Tone: S.Run ? "warn" : R.Label === "Fresh" ? "on" : "muted",
        Glyph: S.Run ? "ray" : R.Label === "Stale" ? "reset" : "check", Title: S.Run ? S.Run.Text : "Show stale parts only" },
    ];
    return Shell({
      Label: "Bake queue outliner", Title: Set ? "Bake set" : "Queue", Meta: Set ? "Map Baking · one character, many parts" : "Map Baking · high → low",
      Tools: `<button type="button" class="ol-round ${S.Run ? "on" : ""}" data-act="${S.Run ? "bake-cancel" : "bake-run"}" ${!S.Run && !E.Maps ? "disabled" : ""} title="${S.Run ? "Cancel bake" : `Bake ${E.Maps} maps`}" aria-label="${S.Run ? "Cancel bake" : "Bake"}">${icon(S.Run ? "stop" : "play", 13)}</button>`,
      Stats: SetStats || [
        { Label: "Queued", Value: `${E.Maps}/${B.BAKE_MAP_CATALOG.length}`, Act: "stat-queued", Tone: E.Maps ? "on" : "muted", Glyph: "layers", Title: "Show queued maps only" },
        { Label: S.Run ? "Baking" : R.Label, Value: S.Run ? `${Math.round(S.Run.Progress * 100)}%` : `${Ready}/${E.Maps}`, Act: "stat-ready", Tone: S.Run ? "warn" : R.Label === "Fresh" ? "on" : "muted",
          Glyph: S.Run ? "ray" : R.Label === "Stale" ? "reset" : "check", Title: S.Run ? S.Run.Text : "Show maps with a fresh result" },
      ],
      Placeholder: Set ? "Search parts and maps…" : "Search maps…",
      Filters: Set ? [["Enabled parts", "enabled"], ["Stale parts", "stale"], ["Queued maps", "queued"], ["Ray-traced maps", "rays"]] : [["Queued", "queued"], ["Skipped", "skipped"], ["Ready", "ready"], ["Ray-traced", "rays"], ["Rasterised (free)", "free"]],
      Chips: Filtering ? "" : `${Set ? `<div class="ol-add-part">${Dropdown("part-add", B.PART_CATEGORIES.flatMap((C) => [{ Group: C }, ...B.PART_KINDS.filter((K) => K.Category === C).map((K) => [K.Label, K.Id, K.Glyph, K.Hint])]), null, { Label: "Add a part", Placeholder: "Add part…", Class: "compact", Search: true, Disabled: !!S.Run })}</div>` : ""}<span class="ol-chip-row">${B.PRESETS.map((Pr) => `<button type="button" class="${Match === Pr.Id ? "on" : ""}" data-act="preset" data-value="${Pr.Id}" ${S.Run ? "disabled" : ""} title="${Esc(Pr.Maps.map((M) => B.MAP[M].label).join(", "))}">${Esc(Pr.Label)}</button>`).join("")}
        <button type="button" data-act="preset-none" ${S.Run || !P.selected.length ? "disabled" : ""}>None</button></span>`,
      Rows: Set ? SetRows(St, Filtering) + QueueRows(St, Filtering) + LibraryHtml(St) : (Filtering ? "" : StudyRows(St)) + MapRows(St, Filtering) + LibraryHtml(St), Empty: Set ? "No parts or maps match" : "No maps match",
      Footer: Set ? [
        { Label: "Output", Value: B.Bytes(E.Bytes) },
        { Label: "Files", Value: String(E.Files) },
        { Label: "ETA", Value: E.Maps ? B.Duration(E.Seconds) : "—", Tone: E.Seconds > 20 ? "warn" : "" },
        { Label: "Device", Value: E.Device.toUpperCase() },
      ] : [
        { Label: "Output", Value: B.Bytes(E.Bytes) },
        { Label: "Rays", Value: B.Count(E.Rays) },
        { Label: "ETA", Value: E.Maps ? B.Duration(E.Seconds) : "—", Tone: E.Seconds > 20 ? "warn" : "" },
        { Label: "Device", Value: E.Device.toUpperCase() },
      ],
    }, St);
  }

  function Commit(Next, Message) { if (S.Run) return Hub.Flash("Wait for the bake to finish"); Hub.Apply(Next); Hub.Render(); if (Message) Hub.Flash(Message); }

  function OnSelect(RowId) {
    const [Kind, Id] = [RowId.slice(0, RowId.indexOf(":")), RowId.slice(RowId.indexOf(":") + 1)];
    if (Kind === "map") Hub.OpenMap(Id);
    else if (Kind === "part") Hub.OpenPart(Id);
    else if (Kind === "pmap") { const [PartId, Map] = Id.split(":"); Hub.OpenPart(PartId, Map); }
    else if (Kind === "tpl") { if (S.Run) return Hub.Flash("Wait for the bake to finish"); const App = Hub.UseTarget(`set:${Id}`); if (App) Outliner.State.Expanded.set = true; }
    else if (Kind === "studyset") { if (Id !== S.P.studyId || S.P.set) { if (S.Run) return Hub.Flash("Wait for the bake to finish"); Hub.UseTarget(Id); } }
    else if (Kind === "src") return;
    else { Outliner.State.Expanded[RowId] = Host.querySelector(`[data-row="${CSS.escape(RowId)}"]`)?.getAttribute("aria-expanded") !== "true"; Outliner.Render(); }
    Outliner.FocusRow(RowId);
  }

  function OnAction(Act, El) {
    const Id = El.dataset.id || "";
    switch (Act) {
      case "map-toggle": Commit(B.ToggleMap(S.P, Id.slice(4))); return true;
      case "part-toggle": Commit(B.TogglePart(S.P, Id.slice(5))); return true;
      case "cat-toggle": { const C = Id.slice(4), All = S.P.set.parts.filter((P) => B.KIND[P.kind].Category === C); Commit(B.SetCategory(S.P, C, !All.every((P) => P.enabled))); return true; }
      case "pmap-toggle": { const [, PartId, Map] = Id.split(":"); Commit(B.TogglePartMap(S.P, PartId, Map)); return true; }
      case "part-add": { if (S.Run) return true; const { Next, Id: NewId } = B.AddPart(S.P, El.dataset.value); Hub.Apply(Next); Hub.OpenPart(NewId); Hub.Flash(`${B.FindPart(S.P, NewId).name} added`); Outliner.FocusRow(`part:${NewId}`); return true; }
      case "stat-enabled": Outliner.State.Filters.has("enabled") ? Outliner.State.Filters.delete("enabled") : Outliner.State.Filters.add("enabled"); Outliner.Render(); return true;
      case "stat-stale": Outliner.State.Filters.has("stale") ? Outliner.State.Filters.delete("stale") : Outliner.State.Filters.add("stale"); Outliner.Render(); return true;
      case "group-toggle": { const G = Id.slice(4), All = B.BAKE_MAP_CATALOG.filter((M) => M.group === G); Commit(B.SetGroup(S.P, G, !All.every((M) => S.P.selected.includes(M.id)))); return true; }
      case "preset": Commit(B.ApplyPreset(S.P, El.dataset.value), `${B.PRESETS.find((P) => P.Id === El.dataset.value).Label} queued`); return true;
      case "preset-none": Commit(B.Normalise({ ...S.P, selected: [] }), "Queue cleared"); return true;
      case "bake-run": Hub.Bake(); return true;
      case "bake-cancel": Hub.Cancel(); return true;
      case "stat-queued": Outliner.State.Filters.has("queued") ? Outliner.State.Filters.delete("queued") : Outliner.State.Filters.add("queued"); Outliner.Render(); return true;
      case "stat-ready": Outliner.State.Filters.has("ready") ? Outliner.State.Filters.delete("ready") : Outliner.State.Filters.add("ready"); Outliner.Render(); return true;
      default: return false;
    }
  }

  Outliner = CreateOutliner(Host, {
    Html, OnSelect, OnAction,
    OnSpace: (RowId) => {
      const Act = { map: "map-toggle", grp: "group-toggle", part: "part-toggle", cat: "cat-toggle", pmap: "pmap-toggle" }[RowId.slice(0, RowId.indexOf(":"))];
      return Act ? OnAction(Act, { dataset: { id: RowId } }) : false;
    },
  });

  Hub.Subscribe(() => Outliner.Render());
  Outliner.Render();
  return Outliner;
}
