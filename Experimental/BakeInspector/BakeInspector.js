// BakeInspector.js — the single Map Baking inspector card (TextureStudio BakingWorkspace), Project Zero styling, same
// language as the Material and Pattern / Stamp cards.
//
// One card, top to bottom:
//   identity (study · low / high sources) → statistics (output · ray budget · result state) → bake bar (device, progress)
//   → maps, grouped; each map row opens only the settings that shape it → output fold (resolution, padding, cage) → export.
// The old inspector split this across a left checklist of 18 maps and a right column of always-open "Ray Execution &
// Surface Settings", "3D Volume SDF" and "Export" cards, so it was never clear which slider affected which map.
//
// Bake sets (one character = body parts + clothes + props): the identity picks a set template or a single study; a
// Parts section holds output (per part / atlas / UDIM), isolation, and the open part's editor (own low / high meshes,
// resolution, cage, contact AO, map queue).  Bake runs every enabled part with progress per part; "Stale only" re-bakes
// just the parts whose settings changed since the last bake.
//
// The card does not bake.  It hands Model.Request(settings) to Options.Bake(request, { Progress, Signal }); without a host
// it runs a clearly labelled dry run that walks the queue on the estimated timings.

import * as B from "./BakeModel.js";
import { icon } from "../MaterialInspector/Icons.js";
import { KeyReaches, Esc, Knob, SwitchRow, Segments, Dropdown, StatTile, SyncSiblings, Download, Rebuild, History } from "../MaterialInspector/CardKit.js";

const S = {
  P: null, Open: null, Part: null, Groups: {}, Folds: {}, Status: "", StatusTimer: 0,
  Run: null,      // { Progress, Text, Index, Total, Controller } while baking
  Result: null,   // { Fingerprint, Parts: { id: fingerprint }, Ms, Device, Maps, Dry, At }
  Docked: false,  // an outliner card owns the map checklist (the card keeps only the open map's editor)
};
const Peers = new Set();   // outliner re-render hooks: Fn(Live)
const Notify = (Live) => { for (const Fn of Peers) Fn(Live); };
const H = History();
let Root = null, Host = {};
const Store = (() => { try { return globalThis.localStorage; } catch { return null; } })();
const GLYPH = { Normals: "normal", Surface: "surface", "Masks & IDs": "id", "Volume & Distance": "volume" };

// ------------------------------------------------------------------------------------------------ plumbing
function Save() { try { Store?.setItem(B.STORAGE_KEY, JSON.stringify(S.P)); } catch { /* private mode */ } }

function Apply(Next, Live = false) {
  if (!Next) return;
  H.Begin(S.P);
  S.P = Next;
  if (!Live) Settle();
}
function Settle() { if (H.Settle(S.P)) Save(); }

function Step(Back) {
  Settle();
  const Prev = H.Step(Back, S.P);
  if (!Prev) return;
  S.P = B.Normalise(Prev);
  Save();
  Render();
  Flash(Back ? "Undone" : "Redone");
}

function Flash(Text) {
  S.Status = Text;
  const El = Root?.querySelector("[data-status]");
  if (El) { El.textContent = Text; El.classList.add("on"); }
  clearTimeout(S.StatusTimer);
  S.StatusTimer = setTimeout(() => { S.Status = ""; const E = Root?.querySelector("[data-status]"); if (E) { E.classList.remove("on"); E.textContent = "Saved locally"; } }, 1800);
}

// ------------------------------------------------------------------------------------------------ statistics
function ResultState() {
  if (S.Run) return { Label: "Baking", Tone: "", Caption: `${S.Run.Index + 1} of ${S.Run.Total} · ${Math.round(S.Run.Progress * 100)}%` };
  if (!S.Result) return { Label: "Unbaked", Tone: "", Caption: "No results yet" };
  if (S.P.set) {
    const Parts = B.EnabledParts(S.P), Stale = StaleParts();
    const Fresh = Parts.length > 0 && !Stale.length;
    return { Label: Fresh ? "Fresh" : "Stale", Tone: Fresh ? "ok" : "warn", Stale: Stale.length,
      Caption: Fresh ? `${Parts.length} parts · ${S.Result.Dry ? "dry run" : S.Result.Device} ${B.Duration(S.Result.Ms / 1000)}` : `${Stale.length} of ${Parts.length} parts stale` };
  }
  const Fresh = S.Result.Fingerprint === B.Fingerprint(S.P);
  return { Label: Fresh ? "Fresh" : "Stale", Tone: Fresh ? "ok" : "warn", Caption: `${Fresh ? "" : "Settings changed · "}${S.Result.Dry ? "dry run" : S.Result.Device} ${B.Duration(S.Result.Ms / 1000)}` };
}

// ------------------------------------------------------------------------------------------------ bake-set state
const Part = () => (S.P.set && B.FindPart(S.P, S.Part)) || null;
const PartFresh = (P) => !!S.Result?.Parts && S.Result.Parts[P.id] === B.PartFingerprint(S.P, P);
const StaleParts = () => B.EnabledParts(S.P).filter((P) => !PartFresh(P)).map((P) => P.id);
// Where a (part, map) job sits in the running queue: "running" | "done" | queue position | null.
function JobState(PartId, Map) {
  if (!S.Run) return null;
  const At = S.Run.Queue.findIndex((J) => J.Part === (PartId ?? null) && (Map == null || J.Map === Map));
  if (At < 0) return null;
  if (Map == null) {
    const Mine = S.Run.Queue.map((J, I) => (J.Part === PartId ? I : -1)).filter((I) => I > -1);
    if (Mine.includes(S.Run.Index)) return { State: "running", Share: (Mine.indexOf(S.Run.Index) + (S.Run.Progress * S.Run.Total - S.Run.Index)) / Mine.length };
    return Mine[Mine.length - 1] < S.Run.Index ? { State: "done" } : { State: "queued", At: S.Run.Parts.indexOf(PartId) + 1 };
  }
  return At === S.Run.Index ? { State: "running" } : At < S.Run.Index ? { State: "done" } : { State: "queued", At: At + 1 };
}
function PartBadge(P) {
  if (!P.enabled) return { Badge: "OFF", Tone: "grey" };
  const J = JobState(P.id);
  if (J) return J.State === "running" ? { Badge: `${Math.round(Math.max(0, Math.min(1, J.Share)) * 100)}%`, Tone: "" } : J.State === "done" ? { Badge: "DONE", Tone: "green" } : { Badge: `#${J.At}`, Tone: "grey" };
  if (S.Run) return null;
  if (!S.Result?.Parts || !(P.id in S.Result.Parts)) return null;
  return PartFresh(P) ? { Badge: "READY", Tone: "green" } : { Badge: "STALE", Tone: "" };
}

// Docked beside the queue outliner (which already shows queued / unbaked counts and output · rays · ETA in its footer),
// the card trades the three statistic tiles for one quiet line under the Bake button.
function MetricsHtml() {
  if (!S.Docked) return StatsHtml();
  const E = B.Estimate(S.P), R = ResultState();
  return `${S.P.set ? `<span class="bi-line-stat"><b>${E.Parts}</b> parts · <b>${E.Files}</b> files</span>` : ""}<span class="bi-line-stat"><b>${Esc(B.Bytes(E.Bytes))}</b> output</span><span class="bi-line-stat"><b>${Esc(B.Count(E.Rays))}</b> rays</span><span class="bi-line-stat">${E.Maps ? `≈ <b>${Esc(B.Duration(E.Seconds))}</b> on ${Esc(E.Device.toUpperCase())}` : "nothing queued"}</span><span class="bi-line-state tone-${R.Tone || "muted"}" title="${Esc(R.Caption)}">${Esc(R.Label)}</span>`;
}

function StatsHtml() {
  const E = B.Estimate(S.P), R = ResultState();
  const ResLabel = S.P.resolution >= 1024 ? `${S.P.resolution / 1024}K` : `${S.P.resolution}`;
  return StatTile({ Key: "output", Label: "Output", Value: B.Bytes(E.Bytes).split(" ")[0], Unit: B.Bytes(E.Bytes).split(" ")[1] || "", Hot: true,
      Caption: S.P.set ? `${E.Files} files · ${S.P.set.output === "atlas" ? `atlas ${S.P.set.atlasRes / 1024}K` : S.P.set.output === "udim" ? `${E.Parts} UDIM tiles` : `${E.Parts} texture sets`}`
        : `${E.Maps} map${E.Maps === 1 ? "" : "s"} · ${ResLabel}${S.P.selected.includes("volumeSdf") ? ` + ${S.P.sdfRes}³` : ""}`,
      Meter: { Kind: "stack", Parts: B.GROUPS.map((G) => ({ Share: E.ByGroup[G], Colour: B.GROUP_COLOURS[G], Title: `${G}: ${B.Bytes(E.ByGroup[G])}` })) },
      Title: "Memory the baked results occupy (RGBA8 maps, float32 SDF voxels), split by map group." })
    + StatTile({ Key: "rays", Label: "Ray budget", Value: B.Count(E.Rays).split(" ")[0], Unit: B.Count(E.Rays).split(" ")[1] || "",
      Tone: E.Seconds > 20 ? "warn" : "", Caption: E.Maps ? `≈ ${B.Duration(E.Seconds)} on ${E.Device.toUpperCase()}` : "Nothing queued",
      Meter: { Kind: "fill", At: Math.min(1, Math.log10(1 + E.Seconds * 10) / 3), Colour: E.Seconds > 20 ? "#ff6b5e" : E.Seconds > 3 ? "#ffb238" : "#46d267" },
      Title: "Rays traced across the covered UV area (≈72 % of the atlas) plus SDF distance queries, and the estimated wall time on the chosen device." })
    + StatTile({ Key: "state", Label: "Result", Value: R.Label, Tone: R.Tone, Caption: R.Caption,
      Meter: S.P.set ? { Kind: "steps", Count: Math.max(1, E.Parts), Done: S.Run ? S.Run.Parts.filter((Id) => JobState(Id)?.State === "done").length : E.Parts - (R.Stale ?? (S.Result ? 0 : E.Parts)), Active: !!S.Run }
        : { Kind: "steps", Count: S.Run ? S.Run.Total : Math.max(1, S.P.selected.length), Done: S.Run ? S.Run.Index : S.Result && R.Label === "Fresh" ? S.P.selected.length : 0, Active: !!S.Run },
      Title: "Whether the last bake still matches the current settings." });
}

// ------------------------------------------------------------------------------------------------ sections
function MapEditor(Id) {
  const P = B.MAP_PARAMS[Id], M = B.MAP[Id];
  const Knobs = P.Keys.map((K) => {
    const Spec = B.SETTINGS[K], Shared = B.SharedWith(S.P, K, Id);
    return Knob({ Bind: `set:${K}`, Label: Spec.Label, Value: S.P[K], Min: Spec.Min, Max: Spec.Max, Step: Spec.Step, Unit: Spec.Unit, Hint: Shared.length ? `shared · ${Shared.length}` : Spec.Hint });
  });
  const Shared = [...new Set(P.Keys.flatMap((K) => B.SharedWith(S.P, K, Id)))];
  let Extra = "";
  if (P.Convention) Extra += Segments("normal-y", [["OpenGL +Y", "+Y"], ["DirectX −Y", "-Y"]], S.P.normalY, { Label: "Tangent convention" });
  if (P.Volume) Extra += `<div class="mi-sub-label">Voxel grid</div>` + Segments("sdf-res", B.SDF_DIMS.map((D) => [`${D}³`, D]), S.P.sdfRes, { Label: "Voxel grid" })
    + SwitchRow("sdf-signed", S.P.sdfSigned, "Signed interior", S.P.sdfSigned ? "Negative inside the mesh" : "Distance magnitude only");
  const C = B.MapCost(S.P, Id);
  return `<div class="mi-editor" data-editor="${Id}">
    ${Extra}
    ${Knobs.length ? `<div class="mi-knob-grid">${Knobs.join("")}</div>` : ""}
    ${P.Note ? `<p class="mi-note">${Esc(P.Note)}</p>` : ""}
    ${Shared.length ? `<p class="mi-note">Also drives ${Esc(Shared.join(", "))}.</p>` : ""}
    <div class="mi-editor-foot"><code>${Esc(Id)} · ${P.Volume ? `${C.Voxels.toLocaleString("en")} voxels` : `${B.MAP_PARAMS[Id].Rays(S.P)} ray${B.MAP_PARAMS[Id].Rays(S.P) === 1 ? "" : "s"}/texel`}</code><span class="bi-cost">${B.Bytes(C.Bytes)}${C.Rays ? ` · ${B.Count(C.Rays)} rays` : ""}</span></div>
  </div>`;
}

function MapRow(M) {
  const On = S.P.selected.includes(M.id), Open = S.Open === M.id, C = B.MapCost(S.P, M.id);
  const J = S.P.set ? null : JobState(null, M.id), Running = J?.State === "running", Done = J?.State === "done";
  return `<div class="mi-row bi-map ${Open ? "open" : ""} ${On ? "" : "off"} ${Running ? "running" : ""} ${Done ? "done" : ""}" data-row="${M.id}">
    <div class="ai-mod-line">
      <button type="button" class="mi-dot" data-act="map-toggle" data-map="${M.id}" role="switch" aria-checked="${On}" title="${On ? "Skip" : "Bake"} ${Esc(M.label)}" aria-label="${On ? "Skip" : "Bake"} ${Esc(M.label)}"></button>
      <button type="button" class="mi-row-head" data-act="open" data-id="${M.id}" data-fid="row:${M.id}" aria-expanded="${Open}">
        <span class="mi-row-name">${Esc(M.label)}<small>${Esc(M.short)}</small></span>
        <span class="mi-readout">${On ? `${B.Bytes(C.Bytes)}${C.Rays ? ` · ${B.Count(C.Rays)}` : ""}` : "Skipped"}</span>
      </button>
    </div>
    ${Open ? MapEditor(M.id) : ""}
  </div>`;
}

function MapGroups() {
  return B.GROUPS.map((G) => {
    const Maps = B.BAKE_MAP_CATALOG.filter((M) => M.group === G), On = Maps.filter((M) => S.P.selected.includes(M.id)).length;
    const Open = S.Groups[G] ?? (On > 0 || Maps.some((M) => M.id === S.Open));
    return `<div class="mi-group ${Open ? "open" : ""}" data-group="${Esc(G)}">
      <div class="bi-group-line">
        <button type="button" class="mi-group-head" data-act="group" data-group="${Esc(G)}" data-open="${Open}" aria-expanded="${Open}">
          <span class="mi-chev">${icon("chevron", 11)}</span><i class="bi-group-dot" style="background:${B.GROUP_COLOURS[G]}"></i><span>${Esc(G)}</span><small>${On} / ${Maps.length}</small>
        </button>
        <button type="button" class="mi-text-btn bi-all" data-act="group-all" data-group="${Esc(G)}" data-on="${On < Maps.length}">${On < Maps.length ? "All" : "None"}</button>
      </div>
      ${Open ? Maps.map(MapRow).join("") : ""}
    </div>`;
  }).join("");
}

// With the outliner docked, the queue checklist lives there; the card shows only the map being inspected.
function DockedMap() {
  const M = S.Open && B.MAP[S.Open];
  if (!M) return `<p class="mi-empty">Pick a map in the bake queue to see the settings that shape it.</p>`;
  return MapRow(M);
}

function Source(Slot, Label, P = null) {
  const Src = P ? P[Slot] : S.P[Slot], Fallback = P ? "Not assigned" : "Study mesh", PartAttr = P ? `data-part="${P.id}"` : "";
  return `<label class="bi-source ${Src ? "custom" : ""} ${P && !Src ? "missing" : ""}" title="${Src ? `${Esc(Src.name)} · click to replace` : `Use a custom ${Label.toLowerCase()} mesh (.obj / .stl / .fbx)`}">
    ${icon("upload", 12)}<span><b>${Label}</b><small>${Src ? Esc(Src.name) : Fallback}</small></span>
    <input type="file" accept=".obj,.stl,.fbx,.glb" data-act="source" data-slot="${Slot}" ${PartAttr} hidden>
    ${Src ? `<button type="button" class="mi-x" data-act="source-clear" data-slot="${Slot}" ${PartAttr} aria-label="Clear the ${Label.toLowerCase()} mesh">${icon("close", 10)}</button>` : ""}
  </label>`;
}

// ------------------------------------------------------------------------------------------------ bake set: parts
const KindOptions = () => B.PART_CATEGORIES.flatMap((C) => [{ Group: C }, ...B.PART_KINDS.filter((K) => K.Category === C).map((K) => [K.Label, K.Id, K.Glyph, K.Hint])]);
const ResLabel = (R) => (R >= 1024 ? `${R / 1024}K` : String(R));

function PartEditor(P) {
  const Set = S.P.set, Maps = B.PartMaps(S.P, P), C = B.PartCost(S.P, P), Own = !!P.cage, Follow = P.maps === null;
  const Kind = B.KIND[P.kind];
  const Res = Set.output === "atlas"
    ? `<div class="bi-part-note">${icon("atlas", 12)}<span>Atlas share <b>${Math.round(B.AtlasShare(S.P, P) * 100)}%</b> of ${ResLabel(Set.atlasRes)} · ≈ ${Math.round(Math.sqrt(B.PartTexels(S.P, P)))} px square</span></div>`
    : Dropdown("part-res", [["Set default · " + ResLabel(S.P.resolution), ""], ...B.RESOLUTIONS.map((R) => [ResLabel(R), R, "", R === S.P.resolution ? "set default" : ""])], P.resolution ?? "", { Label: "Part resolution", Search: false });
  return `<div class="mi-editor bi-part-editor" data-editor="part:${P.id}">
    <div class="bi-part-top">
      <input class="bi-part-name" data-act="part-name" data-fid="part-name:${P.id}" value="${Esc(P.name)}" maxlength="60" spellcheck="false" aria-label="Part name">
      <button type="button" class="icon-btn" data-act="part-dup" title="Duplicate part" aria-label="Duplicate part">${icon("duplicate", 13)}</button>
      <button type="button" class="icon-btn" data-act="part-remove" title="Remove part" aria-label="Remove part">${icon("trash", 13)}</button>
    </div>
    <div class="bi-part-grid">
      <div><div class="mi-sub-label">Kind</div>${Dropdown("part-kind", KindOptions(), P.kind, { Label: "Part kind", Search: false })}</div>
      <div><div class="mi-sub-label">${Set.output === "atlas" ? "Texel share" : Set.output === "udim" ? `Tile ${P.enabled ? B.UdimTile(S.P, P) : "—"} · resolution` : "Resolution"}</div>${Res}</div>
    </div>
    <div class="bi-sources">${Source("lowSource", "Low", P)}${icon("ray", 12)}${Source("highSource", "High", P)}</div>
    ${SwitchRow("part-cage", Own, "Own cage", Own ? "This part's projection distances" : `Set cage · front ${S.P.frontDistance} m · rear ${S.P.rearDistance} m`)}
    ${Own ? `<div class="mi-knob-grid">${["frontDistance", "rearDistance"].map((K) => Knob({ Bind: `part-cage:${K}`, Label: B.SETTINGS[K].Label, Value: P.cage[K], Min: B.SETTINGS[K].Min, Max: B.SETTINGS[K].Max, Step: B.SETTINGS[K].Step, Unit: "m" })).join("")}</div>` : ""}
    ${Set.isolation === "name" ? SwitchRow("part-contact", P.contactAo, "Contact AO", P.contactAo ? "Other parts darken this one (collar on neck)" : "Only this part occludes itself") : ""}
    ${SwitchRow("part-follow", Follow, "Follow set queue", Follow ? `${Maps.length} maps from the set queue` : `Own queue · ${Maps.length} maps`)}
    ${Follow ? "" : `<div class="bi-pmaps" role="group" aria-label="${Esc(P.name)} maps">${B.GROUPS.map((G) => `<div class="bi-pmap-group"><i style="background:${B.GROUP_COLOURS[G]}"></i>${B.BAKE_MAP_CATALOG.filter((M) => M.group === G).map((M) => `<button type="button" class="bi-pmap ${Maps.includes(M.id) ? "on" : ""}" data-act="part-map" data-map="${M.id}" aria-pressed="${Maps.includes(M.id)}" title="${Esc(M.short)}">${Esc(M.label.replace(" / Displacement", "").replace("Ambient Occlusion", "AO"))}</button>`).join("")}</div>`).join("")}</div>`}
    <div class="mi-editor-foot"><code>${Esc(B.FileName(S.P, P, Maps.find((Id) => !B.MAP[Id].isVolume) || "normalTangent"))}</code><span class="bi-cost">${Esc(Kind.Category)} · ${B.Count(B.PartTris(P))} tris · ${B.Bytes(C.Bytes)} · ${B.Count(C.Rays)} rays</span></div>
  </div>`;
}

function PartRow(P) {
  const Open = S.Part === P.id, K = B.KIND[P.kind], C = B.PartCost(S.P, P), St = PartBadge(P);
  return `<div class="mi-row bi-part ${Open ? "open" : ""} ${P.enabled ? "" : "off"} ${JobState(P.id)?.State === "running" ? "running" : ""}" data-part="${P.id}">
    <div class="ai-mod-line">
      <button type="button" class="mi-dot" data-act="part-toggle" data-part="${P.id}" role="switch" aria-checked="${P.enabled}" title="${P.enabled ? "Skip" : "Bake"} ${Esc(P.name)}" aria-label="${P.enabled ? "Skip" : "Bake"} ${Esc(P.name)}"></button>
      <button type="button" class="mi-row-head" data-act="part-open" data-part="${P.id}" data-fid="part:${P.id}" aria-expanded="${Open}">
        <span class="bi-part-glyph" style="--c:${B.CATEGORY_COLOURS[K.Category]}">${icon(K.Glyph, 14)}</span>
        <span class="mi-row-name">${Esc(P.name)}<small>${Esc(K.Label)} · ${B.PartMaps(S.P, P).length} maps${P.maps ? " (own)" : ""}</small></span>
        <span class="bi-part-badge ol-badge ${St?.Tone || ""}">${St?.Badge || ""}</span>
        <span class="mi-readout">${!P.enabled ? "Skipped" : S.P.set.output === "atlas" ? `${Math.round(B.AtlasShare(S.P, P) * 100)}% atlas` : B.Bytes(C.Bytes)}</span>
      </button>
    </div>
    ${Open ? PartEditor(P) : ""}
  </div>`;
}

function PartsSection() {
  const Set = S.P.set, E = B.Estimate(S.P), Open = Part();
  const Iso = B.ISOLATIONS.map((I) => [I.Label, I.Id, I.Glyph, I.Hint]);
  return `<section class="mi-channels bi-parts">
    <div class="mi-section-title"><h3>Parts</h3><small>${E.Parts} OF ${E.TotalParts} BAKING</small></div>
    <div class="bi-set-opts">
      <div><div class="mi-sub-label">Output</div>${Segments("set-output", B.OUTPUTS.map((O) => [O.Label, O.Id]), Set.output, { Label: "Output", Small: true })}</div>
      <div><div class="mi-sub-label">Parts see each other</div>${Dropdown("set-iso", Iso, Set.isolation, { Label: "Isolation", Search: false })}</div>
    </div>
    ${Set.output === "atlas" ? `<div class="mi-sub-label">Atlas size</div>${Segments("set-atlas", B.ATLAS_RES.map((R) => [ResLabel(R), R]), Set.atlasRes, { Label: "Atlas size", Small: true })}` : ""}
    <p class="mi-note bi-set-hint">${Esc(B.OUTPUTS.find((O) => O.Id === Set.output).Hint)}. ${Esc(B.ISOLATIONS.find((O) => O.Id === Set.isolation).Hint)}.</p>
    <div class="mi-list">${S.Docked ? (Open ? PartRow(Open) : `<p class="mi-empty">Pick a part in the outliner — each has its own meshes, resolution, cage and maps.</p>`)
      : B.PART_CATEGORIES.map((C) => { const List = Set.parts.filter((P) => B.KIND[P.kind].Category === C); return List.length ? `<div class="bi-cat"><span class="bi-cat-head" style="--c:${B.CATEGORY_COLOURS[C]}">${icon(B.CATEGORY_GLYPH[C], 12)}${C}<small>${List.filter((P) => P.enabled).length} / ${List.length}</small></span>${List.map(PartRow).join("")}</div>` : ""; }).join("")}</div>
    <div class="bi-add-part">${Dropdown("part-add", KindOptions(), null, { Label: "Add a part", Placeholder: "Add part · body, clothing or prop", Class: "compact", Search: true })}</div>
  </section>`;
}

const TargetOptions = () => [{ Group: "Bake sets · whole character" }, ...B.SET_TEMPLATES.map((T) => [T.Label, `set:${T.Id}`, "person", T.Hint]),
  ...[...new Set(B.BAKE_STUDY_SHAPES.map((E) => E.family))].flatMap((F) => [{ Group: `Single study · ${F}` }, ...B.BAKE_STUDY_SHAPES.filter((E) => E.family === F).map((E) => [E.name, E.id, "cube", `${E.complexity} · ${E.role}`])])];

function OutputFold() {
  const Open = S.Folds.out ?? false;
  return `<details class="mi-fold" data-fold="out" ${Open ? "open" : ""}>
    <summary>${icon("sliders", 14)}<span>Output &amp; cage</span><small>${S.P.resolution} PX · PAD ${S.P.padding} · ${S.P.normalY === "+Y" ? "OPENGL" : "DIRECTX"}</small><span class="mi-chev">${icon("chevron", 11)}</span></summary>
    <div class="mi-fold-body">
      <div class="mi-sub-label">Map resolution</div>
      ${Segments("res", B.RESOLUTIONS.map((R) => [R >= 1024 ? `${R / 1024}K` : String(R), R]), S.P.resolution, { Label: "Map resolution" })}
      ${Knob({ Bind: "set:padding", Label: B.SETTINGS.padding.Label, Value: S.P.padding, Min: 0, Max: 14, Step: 1, Unit: "px", Hint: B.SETTINGS.padding.Hint })}
      <div class="mi-knob-grid">
        ${["frontDistance", "rearDistance"].map((K) => Knob({ Bind: `set:${K}`, Label: B.SETTINGS[K].Label, Value: S.P[K], Min: B.SETTINGS[K].Min, Max: B.SETTINGS[K].Max, Step: B.SETTINGS[K].Step, Unit: "m" })).join("")}
      </div>
      ${Segments("normal-y", [["OpenGL +Y", "+Y"], ["DirectX −Y", "-Y"]], S.P.normalY, { Label: "Tangent convention" })}
    </div>
  </details>`;
}

function CardHtml() {
  const P = S.P, St = B.Study(P), Index = B.BAKE_STUDY_SHAPES.indexOf(St), E = B.Estimate(P), Run = S.Run;
  return `<article class="mi-card bi-card" aria-label="Map Baking inspector">
    <header class="mi-head">
      <span class="mi-mark">${icon("bake", 15)}</span>
      <div class="mi-head-title"><b>Map Baking</b><small>HIGH → LOW CAGE</small></div>
      <div class="mi-head-tools">
        <button type="button" class="icon-btn" data-act="undo" ${H.Past.length && !Run ? "" : "disabled"} title="Undo (Ctrl+Z)" aria-label="Undo">${icon("undo", 14)}</button>
        <button type="button" class="icon-btn" data-act="redo" ${H.Future.length && !Run ? "" : "disabled"} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon("redo", 14)}</button>
        <label class="icon-btn" title="Import bake preset" aria-label="Import bake preset">${icon("upload", 14)}<input type="file" accept=".json,application/json" data-act="import" hidden></label>
        ${S.Docked ? `<button type="button" class="icon-btn" data-act="export-preset" title="Download bake preset" aria-label="Download bake preset">${icon("download", 14)}</button>
        <button type="button" class="icon-btn" data-act="copy-request" title="Copy the bake request a host receives" aria-label="Copy bake request">${icon("copy", 14)}</button>` : ""}
        <button type="button" class="icon-btn" data-act="reset" ${Run ? "disabled" : ""} title="Reset to defaults" aria-label="Reset to defaults">${icon("reset", 14)}</button>
      </div>
    </header>

    ${P.set ? `<section class="mi-ident">
      <span class="mi-eyebrow">BAKE SET · ${Esc((B.SET_TEMPLATES.find((T) => T.Id === P.set.template)?.Label || "Custom set").toUpperCase())}</span>
      <input class="mi-name bi-name" data-act="set-name" data-fid="set-name" value="${Esc(P.set.name)}" maxlength="60" spellcheck="false" aria-label="Character name">
      <div class="mi-ident-row">
        <span class="mi-sub">${P.set.parts.length} parts · ${B.PART_CATEGORIES.map((C) => `${P.set.parts.filter((Q) => B.KIND[Q.kind].Category === C).length} ${C.toLowerCase()}`).join(" · ")}</span>
        ${Dropdown("study", TargetOptions(), `set:${P.set.template}`, { Label: "Bake target", Class: "compact mi-library-dd", Disabled: !!Run, Search: false })}
      </div>
    </section>` : `<section class="mi-ident">
      <span class="mi-eyebrow">${Esc(St.family.toUpperCase())} / ${String(Index + 1).padStart(2, "0")}</span>
      <div class="mi-name bi-name">${Esc(St.name)}</div>
      <div class="mi-ident-row">
        <span class="mi-sub" title="${Esc(St.desc)}">${Esc(St.complexity)} · ${Esc(St.topo)} · ${Esc(St.role)}</span>
        ${Dropdown("study", TargetOptions(), P.studyId, { Label: "Bake target", Class: "compact mi-library-dd", Disabled: !!Run, Search: false })}
      </div>
      <div class="bi-sources">${Source("lowSource", "Low")}${icon("ray", 12)}${Source("highSource", "High")}</div>
    </section>`}

    ${S.Docked ? "" : `<section class="mi-metrics" data-metrics>${StatsHtml()}</section>`}

    <section class="bi-bake">
      <div class="bi-bake-row">
        <button type="button" class="bi-go ${Run ? "running" : ""}" data-act="${Run ? "cancel" : "bake"}" ${!Run && !E.Maps ? "disabled" : ""}>
          ${icon(Run ? "stop" : "play", 13)}${Run ? "Cancel" : !E.Maps ? (P.set ? "Enable a part" : "Pick a map") : P.set ? `Bake ${E.Parts} part${E.Parts === 1 ? "" : "s"}` : `Bake ${E.Maps} map${E.Maps === 1 ? "" : "s"}`}
        </button>
        ${P.set && !Run && S.Result?.Parts && ResultState().Stale && ResultState().Stale < E.Parts ? `<button type="button" class="mi-text-btn bi-stale" data-act="bake-stale" title="Re-bake only the parts whose settings changed">${icon("reset", 11)}Stale only · ${ResultState().Stale}</button>` : ""}
        ${Segments("device", B.DEVICES, P.deviceMode, { Label: "Ray device", Fill: false })}
      </div>
      <div class="bi-progress" data-progress><i style="width:${Run ? Run.Progress * 100 : S.Result && ResultState().Label === "Fresh" ? 100 : 0}%"></i></div>
      ${S.Docked ? `<div class="bi-line" data-metrics>${MetricsHtml()}</div>` : ""}
      <div class="bi-progress-text" data-progress-text>${Esc(Run ? Run.Text : S.Result ? `Last bake: ${S.Result.PartCount ? `${S.Result.PartCount} parts · ` : ""}${S.Result.Maps.length} maps in ${B.Duration(S.Result.Ms / 1000)}${S.Result.Dry ? " (dry run — no bake engine attached)" : ` on ${S.Result.Device}`}` : Host.Bake ? "Ready" : (S.Docked ? "Dry run · no bake engine attached" : "Dry run — this page has no bake engine attached; timings follow the estimate"))}</div>
    </section>

    ${P.set ? PartsSection() : ""}

    <section class="mi-channels">
      <div class="mi-section-title"><h3>${S.Docked ? "Open map" : P.set ? "Set queue" : "Maps"}</h3><small>${S.Docked ? "PICK IN THE QUEUE" : P.set ? `${P.selected.length} MAPS · PARTS FOLLOW IT` : `${E.Maps} OF ${B.BAKE_MAP_CATALOG.length} QUEUED`}</small></div>
      <div class="mi-list">${S.Docked ? DockedMap() : MapGroups()}</div>
    </section>

    ${OutputFold()}

    <footer class="mi-foot">
      ${S.Docked ? "" : `<div class="mi-export">
        <button type="button" class="primary" data-act="export-preset">${icon("download", 13)}Preset</button>
        <button type="button" data-act="export-request" title="The exact request a bake host receives">${icon("download", 13)}Request</button>
        <button type="button" data-act="copy-request" title="Copy the bake request">${icon("copy", 13)}Copy</button>
      </div>`}
      <div class="mi-foot-line"><span class="mi-status ${S.Status ? "on" : ""}" data-status>${Esc(S.Status || "Saved locally")}</span><span>${S.Docked ? "Exports live in the header" : "Open a map to see what shapes it"}</span></div>
    </footer>
  </article>`;
}

function Render() { Rebuild(Root, CardHtml(), ".bi-card"); Notify(false); }

function RefreshLive() {
  const M = Root.querySelector("[data-metrics]");
  if (M) M.innerHTML = MetricsHtml();
  for (const Row of Root.querySelectorAll(".bi-map")) {
    const Id = Row.dataset.row, Read = Row.querySelector(".mi-readout"), C = B.MapCost(S.P, Id);
    if (Read && S.P.selected.includes(Id)) Read.textContent = `${B.Bytes(C.Bytes)}${C.Rays ? ` · ${B.Count(C.Rays)}` : ""}`;
    const Cost = Row.querySelector(".bi-cost");
    if (Cost) Cost.textContent = `${B.Bytes(C.Bytes)}${C.Rays ? ` · ${B.Count(C.Rays)} rays` : ""}`;
  }
  Notify(true);
}

function UpdateProgress() {
  const Bar = Root.querySelector("[data-progress] i"), Text = Root.querySelector("[data-progress-text]"), M = Root.querySelector("[data-metrics]");
  if (Bar) Bar.style.width = `${(S.Run?.Progress ?? 1) * 100}%`;
  if (Text && S.Run) Text.textContent = S.Run.Text;
  if (M) M.innerHTML = MetricsHtml();
  for (const Row of Root.querySelectorAll(".bi-map")) {
    const J = S.P.set ? null : JobState(null, Row.dataset.row);
    Row.classList.toggle("running", J?.State === "running");
    Row.classList.toggle("done", J?.State === "done");
  }
  for (const Row of Root.querySelectorAll(".bi-part[data-part]")) {
    const Bd = Row.querySelector(".bi-part-badge"), P = B.FindPart(S.P, Row.dataset.part), St = P && PartBadge(P);
    if (Bd) { Bd.textContent = St?.Badge || ""; Bd.className = `bi-part-badge ol-badge ${St?.Tone || ""}`; }
    Row.classList.toggle("running", JobState(Row.dataset.part)?.State === "running");
  }
  Notify(true);
}

// ------------------------------------------------------------------------------------------------ bake
// Default host: walks the queue on the estimated per-map timings (compressed into ≤ 4 s) so the progress UI is exercisable.
async function DryRun(Request, { Progress, Signal, Jobs }) {
  const Queue = Jobs.map((J) => J.Map), Parts = Jobs.map((J) => B.FindPart(S.P, J.Part));
  const Costs = Jobs.map((J, I) => Math.max(0.15, (B.MapCost(S.P, J.Map, Parts[I]).Rays || 2e5) / 3.2e8));
  const Scale = Math.min(1, 4 / Costs.reduce((A, C) => A + C, 0.001));
  const T0 = performance.now();
  for (let I = 0; I < Queue.length; I++) {
    const Ms = Math.max(Queue.length > 20 ? 45 : 140, Costs[I] * Scale * 1000), Steps = 6;
    for (let K = 0; K < Steps; K++) {
      if (Signal.aborted) throw new DOMException("Cancelled", "AbortError");
      await new Promise((R) => setTimeout(R, Ms / Steps));
      Progress((I + (K + 1) / Steps) / Queue.length, `Dry run · ${Parts[I] ? `${Parts[I].name} · ` : ""}${B.MAP[Queue[I]].label}`, I);
    }
  }
  return { Device: "Dry run", Ms: performance.now() - T0, Maps: Queue, Dry: true };
}

// Only: part ids to bake (stale-only re-bake); the request then carries just those parts.
async function RunBake(Only = null) {
  const Queue = B.Jobs(S.P, Only);
  if (S.Run || !Queue.length) return;
  Settle();
  const Full = B.Request(S.P), Fingerprint = B.Fingerprint(S.P);
  const Request = Only && Full.parts ? { ...Full, parts: Full.parts.filter((P) => Only.includes(P.id)) } : Full;
  const PartIds = [...new Set(Queue.map((J) => J.Part).filter(Boolean))];
  const Fingerprints = Object.fromEntries(PartIds.map((Id) => [Id, B.PartFingerprint(S.P, B.FindPart(S.P, Id))]));
  const Controller = new AbortController();
  S.Run = { Progress: 0, Text: "Preparing…", Index: 0, Total: Queue.length, Queue, Parts: PartIds, Controller };
  Render();
  const T0 = performance.now();
  const Progress = (P, Text, Index) => {
    if (!S.Run) return;
    S.Run.Progress = Math.max(0, Math.min(1, +P || 0));
    if (Text) S.Run.Text = Text;
    S.Run.Index = Number.isInteger(Index) ? Math.min(Queue.length - 1, Index) : Math.min(Queue.length - 1, Math.floor(S.Run.Progress * Queue.length));
    UpdateProgress();
  };
  try {
    const R = await (Host.Bake || DryRun)(Request, { Progress, Signal: Controller.signal, Jobs: Queue });
    const Keep = Only && S.Result?.Parts ? S.Result.Parts : {};
    S.Result = { Fingerprint, Parts: S.P.set ? { ...Keep, ...Fingerprints } : null, PartCount: PartIds.length, Ms: R?.Ms ?? performance.now() - T0, Device: R?.Device || "host",
      Maps: R?.Maps || Queue.map((J) => J.Map), Dry: !!R?.Dry, Data: R?.Data ?? null, At: Date.now() };
    S.Run = null;
    Render();
    Flash(PartIds.length ? `Baked ${PartIds.length} part${PartIds.length === 1 ? "" : "s"} · ${S.Result.Maps.length} maps` : `Baked ${S.Result.Maps.length} maps`);
    Host.OnResult?.(S.Result);
  } catch (Error) {
    S.Run = null;
    Render();
    Flash(Error?.name === "AbortError" ? "Bake cancelled" : `Bake failed · ${Error?.message || Error}`);
  }
}

// "set:<template>" starts a bake set (body parts + clothes + props); a study id goes back to a single high / low pair.
function UseTarget(Value) {
  if (S.Run) return false;
  const V = String(Value);
  if (V.startsWith("set:")) {
    Apply(B.UseTemplate(S.P, V.slice(4)));
    S.Part = B.Ordered(S.P)[0]?.id || null; S.Result = null;
    Render(); Flash(`Bake set: ${S.P.set.name} · ${S.P.set.parts.length} parts`); return true;
  }
  Apply(B.SetValue(B.UseTemplate(S.P, null), "studyId", V)); S.Part = null;
  Render(); Flash(`Study: ${B.Study(S.P).name}`); return true;
}

// ------------------------------------------------------------------------------------------------ events
function Write(Bind, Raw) {
  if (Bind.startsWith("set:")) { const V = +Raw; return Number.isFinite(V) ? B.SetValue(S.P, Bind.slice(4), V) : S.P; }
  if (Bind.startsWith("part-cage:") && Part()) { const V = +Raw; return Number.isFinite(V) ? B.EditPart(S.P, S.Part, (P) => ({ cage: { ...P.cage, [Bind.slice(10)]: V } })) : S.P; }
  return S.P;
}

function OnClick(Event) {
  const El = Event.target.closest("[data-act]");
  if (!El || !Root.contains(El) || El.disabled) return;
  const Act = El.dataset.act, V = El.dataset.value;
  if (El.classList.contains("mi-dd-opt") && Act === "study") return OnChange({ target: { dataset: El.dataset, value: V } });
  if (["study", "import", "source", "set-name", "part-name"].includes(Act)) return;
  const Pt = Part();
  switch (Act) {
    case "undo": return Step(true);
    case "redo": return Step(false);
    case "reset": Apply(B.Create()); S.Open = null; Flash("Defaults restored"); break;
    case "bake": RunBake(); return;
    case "bake-stale": RunBake(StaleParts()); return;
    case "set-output": Apply(B.SetSet(S.P, "output", V)); break;
    case "set-iso": Apply(B.SetSet(S.P, "isolation", V)); break;
    case "set-atlas": Apply(B.SetSet(S.P, "atlasRes", +V)); break;
    case "part-open": S.Part = S.Part === El.dataset.part && !S.Docked ? null : El.dataset.part; break;
    case "part-toggle": Apply(B.TogglePart(S.P, El.dataset.part)); break;
    case "part-add": { const { Next, Id } = B.AddPart(S.P, V); Apply(Next); S.Part = Id; Flash(`${B.FindPart(S.P, Id).name} added`); break; }
    case "part-dup": if (Pt) { const { Next, Id } = B.DuplicatePart(S.P, Pt.id); Apply(Next); S.Part = Id; Flash("Part duplicated"); } break;
    case "part-remove": if (Pt) { const Name = Pt.name; Apply(B.RemovePart(S.P, Pt.id)); S.Part = B.Ordered(S.P)[0]?.id || null; Flash(`${Name} removed · Ctrl+Z restores`); } break;
    case "part-kind": if (Pt) Apply(B.EditPart(S.P, Pt.id, { kind: V })); break;
    case "part-res": if (Pt) Apply(B.EditPart(S.P, Pt.id, { resolution: V ? +V : null })); break;
    case "part-cage": if (Pt) Apply(B.EditPart(S.P, Pt.id, (P) => ({ cage: P.cage ? null : { frontDistance: S.P.frontDistance, rearDistance: S.P.rearDistance } }))); break;
    case "part-contact": if (Pt) Apply(B.EditPart(S.P, Pt.id, (P) => ({ contactAo: !P.contactAo }))); break;
    case "part-follow": if (Pt) Apply(B.EditPart(S.P, Pt.id, (P) => ({ maps: P.maps ? null : [...S.P.selected] }))); break;
    case "part-map": if (Pt) Apply(B.TogglePartMap(S.P, Pt.id, El.dataset.map)); break;
    case "cancel": S.Run?.Controller.abort(); return;
    case "device": Apply(B.SetValue(S.P, "deviceMode", V)); break;
    case "open": S.Open = S.Open === El.dataset.id ? null : El.dataset.id; break;
    case "map-toggle": Apply(B.ToggleMap(S.P, El.dataset.map)); break;
    case "group": S.Groups[El.dataset.group] = El.dataset.open !== "true"; break;
    case "group-all": Apply(B.SetGroup(S.P, El.dataset.group, El.dataset.on === "true")); S.Groups[El.dataset.group] = true; break;
    case "normal-y": Apply(B.SetValue(S.P, "normalY", V)); break;
    case "sdf-res": Apply(B.SetValue(S.P, "sdfRes", +V)); break;
    case "sdf-signed": Apply(B.SetValue(S.P, "sdfSigned", !S.P.sdfSigned)); break;
    case "res": Apply(B.SetValue(S.P, "resolution", +V)); break;
    case "source-clear": Event.preventDefault();
      if (El.dataset.part) Apply(B.EditPart(S.P, El.dataset.part, { [El.dataset.slot]: null })); else Apply(B.SetValue(S.P, El.dataset.slot, null));
      Host.OnSource?.(El.dataset.slot, null, El.dataset.part || null); break;
    case "export-preset": Download(B.ExportPreset(S.P), `${S.P.studyId}.bake.json`, "application/json"); return Flash("Exported bake preset");
    case "export-request": Download(JSON.stringify(B.Request(S.P), null, 2), `${S.P.studyId}.bake-request.json`, "application/json"); return Flash("Exported bake request");
    case "copy-request": (navigator.clipboard?.writeText(JSON.stringify(B.Request(S.P), null, 2)) || Promise.reject()).then(() => Flash("Copied bake request"), () => Flash("Clipboard unavailable")); return;
    default: return;
  }
  Render();
  if (Act === "open" && S.Open) Root.querySelector(`[data-fid="row:${CSS.escape(S.Open)}"]`)?.focus({ preventScroll: true });
  if (Act === "part-open" && S.Part) Root.querySelector(`[data-fid="part:${CSS.escape(S.Part)}"]`)?.focus({ preventScroll: true });
}

function OnInput(Event) {
  const El = Event.target;
  if (El.dataset.act === "set-name") { Apply(B.SetSet(S.P, "name", El.value), true); Notify(true); return; }
  if (El.dataset.act === "part-name" && Part()) { Apply(B.EditPart(S.P, S.Part, { name: El.value }), true); Notify(true); return; }
  if (!El.dataset.bind) return;
  if (El.type === "number" && (El.value === "" || !Number.isFinite(+El.value))) return;
  Apply(Write(El.dataset.bind, El.value), true);
  SyncSiblings(Root, El);
  RefreshLive();
}

async function OnChange(Event) {
  const El = Event.target, Act = El.dataset.act;
  if (Act === "study") return UseTarget(El.value);
  if (Act === "set-name" || Act === "part-name") { Settle(); Render(); return; }
  if (Act === "source") {
    const File = El.files?.[0];
    if (!File) return;
    const Src = { name: File.name, size: File.size };
    if (El.dataset.part) Apply(B.EditPart(S.P, El.dataset.part, { [El.dataset.slot]: Src })); else Apply(B.SetValue(S.P, El.dataset.slot, Src));
    Host.OnSource?.(El.dataset.slot, File, El.dataset.part || null);
    El.value = "";
    Render();
    Flash(`${El.dataset.part ? `${B.FindPart(S.P, El.dataset.part)?.name} · ` : ""}${El.dataset.slot === "lowSource" ? "Low" : "High"} mesh: ${File.name}`);
    return;
  }
  if (Act === "import") {
    const File = El.files?.[0];
    El.value = "";
    if (!File) return;
    try { Apply(B.Load(await File.text())); Render(); Flash("Preset imported"); } catch (Error) { Flash(`Import failed · ${Error.message}`); }
    return;
  }
  if (El.dataset.bind) {
    if (El.type === "number" && Number.isFinite(+El.value) && El.value !== "") Apply(Write(El.dataset.bind, El.value), true);
    Settle();
    Render();
  }
}

function OnKey(Event) {
  const T = Event.target, Typing = T.matches?.("input, textarea, select");
  if ((Event.ctrlKey || Event.metaKey) && !Event.altKey && (Event.key === "z" || Event.key === "Z" || Event.key === "y")) {
    if ((Typing && T.type !== "range") || S.Run) return;
    Event.preventDefault();
    return Step(!(Event.key === "y" || Event.shiftKey));
  }
  if (T.classList?.contains("mi-row-head") && (Event.key === "ArrowDown" || Event.key === "ArrowUp")) {
    Event.preventDefault();
    const Heads = [...Root.querySelectorAll(".mi-row-head")], At = Heads.indexOf(T);
    Heads[Math.max(0, Math.min(Heads.length - 1, At + (Event.key === "ArrowDown" ? 1 : -1)))]?.focus();
    return;
  }
  if (T.classList?.contains("mi-row-head") && Event.key === " " && Event.shiftKey) { Event.preventDefault(); Apply(B.ToggleMap(S.P, T.dataset.id)); Render(); Root.querySelector(`[data-fid="row:${CSS.escape(T.dataset.id)}"]`)?.focus(); return; }
  if (Event.key === "Escape" && !Typing && S.Open) { S.Open = null; Render(); }
}

// ------------------------------------------------------------------------------------------------ boot
// Options.Bake(request, { Progress(p, text, index), Signal }) → Promise<{ Device, Ms, Maps, Data }>; Options.OnResult(result);
// Options.OnSource(slot, File | null) for custom low / high meshes.
export function Mount(El, Options = {}) {
  Root = El;
  Host = Options;
  S.Docked = !!Options.docked;
  S.Scoped = !!Options.scoped;
  let Stored = null;
  try { Stored = Store?.getItem(B.STORAGE_KEY); } catch { Stored = null; }
  try { S.P = Stored ? B.Normalise(JSON.parse(Stored)) : B.Create(); } catch { S.P = B.Create(); }
  Root.addEventListener("click", OnClick);
  Root.addEventListener("input", OnInput);
  Root.addEventListener("change", OnChange);
  Root.addEventListener("toggle", (E) => { const F = E.target.closest?.("[data-fold]"); if (F) S.Folds[F.dataset.fold] = F.open; }, true);
  document.addEventListener("keydown", (E) => { if (KeyReaches(E, Root, S.Scoped)) OnKey(E); });
  if (S.Docked && !S.Open) S.Open = S.P.selected[0] || null;
  if (S.P.set) S.Part = B.Ordered(S.P)[0]?.id || null;
  Render();
  return Hub;
}

// What the outliner (or a host) drives the card through — edits go Apply → Render so undo and storage stay whole.
const Hub = {
  State: S, Model: B, History: H, Render, Apply, Settle, Flash, Step, Bake: () => RunBake(), BakeStale: () => RunBake(StaleParts()), ResultState, JobState, PartBadge, StaleParts, UseTarget,
  Cancel: () => S.Run?.Controller.abort(),
  Subscribe(Fn) { Peers.add(Fn); return () => Peers.delete(Fn); },
  OpenPart(Id, Map) { S.Part = Id; if (Map) S.Open = Map; Render(); Root.querySelector(`[data-fid="part:${CSS.escape(Id)}"]`)?.scrollIntoView?.({ block: "nearest" }); },
  OpenMap(Id) { S.Open = Id; Render(); Root.querySelector(`[data-fid="row:${CSS.escape(Id)}"]`)?.scrollIntoView?.({ block: "nearest" }); },
};
