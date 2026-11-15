// BakeOutliner.js — the Map Baking companion outliner (Project Zero outliner, single card).
//
// Mirrors TextureStudio's BakingWorkspace left panel (quick-select chips, grouped map tiles with a preview, check toggle and
// "Ready" state), re-cut as a tree:
//   Study (low / high sources) ▸ map groups (queue check, size) ▸ maps (preview swatch, queue check, Ready / Stale / Baking)
//   Studies ▸ the study library
// No state lives here; edits go through the inspector Hub, and bake progress re-renders this card live.

import { icon } from "../MaterialInspector/Icons.js";
import { Esc } from "../MaterialInspector/CardKit.js";
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

  function MapRows(St, Filtering) {
    return B.GROUPS.map((G) => {
      const All = B.BAKE_MAP_CATALOG.filter((M) => M.group === G), Maps = All.filter((M) => Passes(M, St));
      if (Filtering && !Maps.length) return "";
      const On = All.filter((M) => S.P.selected.includes(M.id)), GroupId = `grp:${G}`;
      const Open = Filtering ? true : Outliner.IsExpanded(GroupId, On.length > 0 || All.some((M) => M.id === S.Open));
      const Bytes = On.reduce((A, M) => A + B.MapCost(S.P, M.id).Bytes, 0);
      const Head = GroupRow({
        Id: GroupId, Depth: 0, Kind: "bake-group", Icon: `<span class="ol-group-glyph" style="--c:${B.GROUP_COLOURS[G]}">${icon(GLYPH[G], 14)}</span>`,
        Name: G, Meta: `${On.length}/${All.length} queued${On.length ? ` · ${B.Bytes(Bytes)}` : ""}`, Expandable: true, Expanded: Open,
        Status: On.length === All.length, StatusAct: "group-toggle", StatusTitle: On.length === All.length ? `Skip all ${G}` : `Queue all ${G}`,
        Badge: On.length && On.length < All.length ? `<span class="ol-partial" title="Some queued"></span>` : "",
      });
      if (!Open) return Head;
      return Head + Maps.map((M) => {
        const Queued = S.P.selected.includes(M.id), State = MapState(M.id), C = B.MapCost(S.P, M.id);
        return TreeRow({
          Id: `map:${M.id}`, Depth: 1, Kind: `map ${State?.Badge === "BAKING" ? "running" : ""}`, Name: M.label,
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

  function LibraryHtml(St) {
    const Items = B.BAKE_STUDY_SHAPES.filter((E) => Matches(St.Query, E.name, E.family, E.role, E.desc));
    if (!Items.length || St.Filters.size) return "";
    const Open = St.Query ? true : Outliner.IsExpanded("studies", false);
    return GroupRow({ Id: "studies", Depth: 0, Icon: icon("folder", 15), Name: "Studies", Meta: `${B.BAKE_STUDY_SHAPES.length} high / low pairs`, Expandable: true, Expanded: Open })
      + (Open ? Items.map((E) => TreeRow({ Id: `studyset:${E.id}`, Depth: 1, Kind: "study", Icon: icon("cube", 13), Name: E.name, Meta: `${E.role} · ${E.complexity}`, Selected: E.id === S.P.studyId, Title: E.desc })).join("") : "");
  }

  function Html(St) {
    const P = S.P, E = B.Estimate(P), R = Hub.ResultState(), Filtering = !!St.Query.trim() || St.Filters.size > 0;
    const Ready = S.Result && R.Label === "Fresh" ? S.Result.Maps.length : 0, Match = B.PresetMatch(P);
    return Shell({
      Label: "Bake queue outliner", Title: "Queue", Meta: "Map Baking · high → low",
      Tools: `<button type="button" class="ol-round ${S.Run ? "on" : ""}" data-act="${S.Run ? "bake-cancel" : "bake-run"}" ${!S.Run && !E.Maps ? "disabled" : ""} title="${S.Run ? "Cancel bake" : `Bake ${E.Maps} maps`}" aria-label="${S.Run ? "Cancel bake" : "Bake"}">${icon(S.Run ? "stop" : "play", 13)}</button>`,
      Stats: [
        { Label: "Queued", Value: `${E.Maps}/${B.BAKE_MAP_CATALOG.length}`, Act: "stat-queued", Tone: E.Maps ? "on" : "muted", Glyph: "layers", Title: "Show queued maps only" },
        { Label: S.Run ? "Baking" : R.Label, Value: S.Run ? `${Math.round(S.Run.Progress * 100)}%` : `${Ready}/${E.Maps}`, Act: "stat-ready", Tone: S.Run ? "warn" : R.Label === "Fresh" ? "on" : "muted",
          Glyph: S.Run ? "ray" : R.Label === "Stale" ? "reset" : "check", Title: S.Run ? S.Run.Text : "Show maps with a fresh result" },
      ],
      Placeholder: "Search maps…",
      Filters: [["Queued", "queued"], ["Skipped", "skipped"], ["Ready", "ready"], ["Ray-traced", "rays"], ["Rasterised (free)", "free"]],
      Chips: Filtering ? "" : `<span class="ol-chip-row">${B.PRESETS.map((Pr) => `<button type="button" class="${Match === Pr.Id ? "on" : ""}" data-act="preset" data-value="${Pr.Id}" ${S.Run ? "disabled" : ""} title="${Esc(Pr.Maps.map((M) => B.MAP[M].label).join(", "))}">${Esc(Pr.Label)}</button>`).join("")}
        <button type="button" data-act="preset-none" ${S.Run || !P.selected.length ? "disabled" : ""}>None</button></span>`,
      Rows: (Filtering ? "" : StudyRows(St)) + MapRows(St, Filtering) + LibraryHtml(St), Empty: "No maps match",
      Footer: [
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
    else if (Kind === "studyset") { if (Id !== S.P.studyId) Commit(B.SetValue(S.P, "studyId", Id), `Study: ${B.BAKE_STUDY_SHAPES.find((E) => E.id === Id)?.name}`); }
    else if (Kind === "src") return;
    else { Outliner.State.Expanded[RowId] = Host.querySelector(`[data-row="${CSS.escape(RowId)}"]`)?.getAttribute("aria-expanded") !== "true"; Outliner.Render(); }
    Outliner.FocusRow(RowId);
  }

  function OnAction(Act, El) {
    const Id = El.dataset.id || "";
    switch (Act) {
      case "map-toggle": Commit(B.ToggleMap(S.P, Id.slice(4))); return true;
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
    OnSpace: (RowId) => (RowId.startsWith("map:") || RowId.startsWith("grp:")) && OnAction(RowId.startsWith("map:") ? "map-toggle" : "group-toggle", { dataset: { id: RowId } }),
  });

  Hub.Subscribe(() => Outliner.Render());
  Outliner.Render();
  return Outliner;
}
