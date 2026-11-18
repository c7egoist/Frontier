// MaterialOutliner.js — the Material card's companion outliner (Project Zero outliner, single card).
//
// Mirrors TextureStudio's "Material Scene & Strata" left panel, re-cut as a tree:
//   Material ▸ strata (enable check, reorder, remove) ▸ channel slots (swatch, source readout)
//            ▸ fields (procedural generators, which slots they drive)
//   Library  ▸ catalog materials
// It holds no document state of its own: every edit goes through the inspector Hub (Apply → Render), so undo, local
// storage and the card stay in step, and the Hub re-renders this card after every card render.

import { icon } from "./Icons.js";
import { Esc } from "./CardKit.js";
import { Shell, TreeRow, GroupRow, RowTool, CreateOutliner, Matches } from "./OutlinerKit.js";

const MODEL_GLYPH = { surface: "surface", coat: "coat", flakes: "flakes", detail: "detail" };
const KIND_LABEL = { value: "Value", field: "Field", ramp: "Ramp", texture: "Image", pattern: "Pattern" };
const KIND_FILTER = { field: "field", ramp: "ramp", texture: "texture", pattern: "field" };

export function MountMaterialOutliner(Host, Hub) {
  const { State: S, Model: M } = Hub;
  const Id = { root: "material", fields: "fields", library: "library" };
  let Outliner;

  // ---------------------------------------------------------------------------------------------- rows
  function ChannelRows(L, St) {
    return L.Channels.map((Key) => {
      const Spec = M.CHANNEL[Key], R = M.ChannelReadout(S.P, L, Key);
      return { Key, Spec, R };
    }).filter(({ Key, Spec, R }) =>
      (!St.Filters.has("driven") || R.Kind !== "value")
      && (!St.Filters.has("field") || R.Kind === "field" || R.Kind === "pattern")
      && (!St.Filters.has("ramp") || R.Kind === "ramp")
      && (!St.Filters.has("texture") || R.Kind === "texture")
      && (!St.Filters.has("colour") || Spec.Type === "colour")
      && Matches(St.Query, L.Name, Spec.Caption, Spec.Group, Spec.Hint, R.Text, KIND_LABEL[R.Kind]));
  }

  function StrataHtml(St) {
    const Layers = S.P.Authoring.Layers, Active = Hub.Layer();
    const Query = St.Query.trim(), Filtering = Query || [...St.Filters].some((F) => F !== "enabled");
    return Layers.filter((L) => !St.Filters.has("enabled") || L.Enabled).map((L) => {
      const Rows = ChannelRows(L, St), NameHit = Matches(Query, L.Name, M.MODELS[L.Model].Label);
      if (Filtering && !Rows.length && !(Query && NameHit && ![...St.Filters].some((F) => F !== "enabled"))) return "";
      const Driven = L.Channels.filter((K) => M.SourceKind(M.ChannelSource(S.P, L, K).Mode) !== "value").length;
      const RowId = `layer:${L.Identity}`, Open = Filtering ? true : Outliner.IsExpanded(RowId, L.Identity === Active.Identity);
      const Detail = L.Model === "detail";
      const Head = TreeRow({
        Id: RowId, Depth: 1, Icon: icon(MODEL_GLYPH[L.Model], 15), Name: L.Name, Kind: `stratum model-${L.Model}`,
        Meta: `${M.MODELS[L.Model].Label} · ${L.Channels.length} ch${Driven ? ` · ${Driven} driven` : ""}`,
        Selected: L.Identity === Active.Identity && !S.Channel, Muted: !L.Enabled, Expandable: true, Expanded: Open,
        Status: L.Enabled, StatusAct: "layer-toggle", StatusTitle: `${L.Enabled ? "Disable" : "Enable"} ${L.Name}`,
        Renaming: St.Renaming === RowId, Draggable: Detail, Title: `${L.Name} · ${M.MODELS[L.Model].Hint}`,
        Tools: Detail ? RowTool("layer-up", L.Identity, "up", "Move up", !M.CanMoveLayer(S.P, L.Identity, -1))
          + RowTool("layer-down", L.Identity, "down", "Move down", !M.CanMoveLayer(S.P, L.Identity, 1))
          + RowTool("layer-remove", L.Identity, "trash", `Remove ${L.Name}`) : "",
        Badge: L.Identity === Active.Identity ? `<span class="ol-badge">ACTIVE</span>` : "",
      });
      if (!Open) return Head;
      // Channel slots fold into their PBR groups (Core, Specular, Coat …); the group holding the open channel starts open.
      const Groups = M.GROUPS.map((G) => [G, Rows.filter((E) => E.Spec.Group === G)]).filter(([, E]) => E.length);
      return Head + Groups.map(([G, Items]) => {
        const GroupId = `grp:${L.Identity}:${G}`, Holds = L.Identity === Active.Identity && Items.some((E) => E.Key === S.Channel);
        const GroupOpen = Filtering || Groups.length === 1 ? true : Outliner.IsExpanded(GroupId, Holds || (G === "Core" && L.Identity === Active.Identity));
        const Driven = Items.filter((E) => E.R.Kind !== "value").length;
        return GroupRow({ Id: GroupId, Depth: 2, Icon: `<span class="ol-group-strip">${Items.slice(0, 4).map((E) => Hub.SwatchHtml(L, E.Key)).join("")}</span>`,
          Name: G, Meta: `${Items.length} ch${Driven ? ` · ${Driven} driven` : ""}`, Expandable: true, Expanded: GroupOpen, Muted: !L.Enabled })
          + (GroupOpen ? ChannelSlots(L, Items, Active) : "");
      }).join("");
    }).join("");
  }

  function ChannelSlots(L, Rows, Active) {
    return Rows.map(({ Key, Spec, R }) => TreeRow({
        Id: `ch:${L.Identity}:${Key}`, Depth: 3, Icon: Hub.SwatchHtml(L, Key), Name: Spec.Caption, Kind: `slot kind-${R.Kind}`,
        Meta: `${KIND_LABEL[R.Kind]} · ${R.Text}`, Selected: L.Identity === Active.Identity && S.Channel === Key, Muted: !L.Enabled,
        Title: `${Spec.Caption} — ${Spec.Hint}`,
        Badge: R.Kind !== "value" ? `<span class="ol-kind" style="--k:${M.SIGNAL_COLOURS[R.Kind]}"></span>` : "",
      })).join("");
  }

  function FieldUses(G) {
    const Uses = [];
    for (const L of S.P.Authoring.Layers) for (const K of L.Channels) if (M.ChannelSource(S.P, L, K).Generator === G.Identity) Uses.push({ L, K });
    return Uses;
  }

  function FieldsHtml(St) {
    const Gens = S.P.Authoring.Generators || [];
    if (!Gens.length || St.Filters.has("ramp") || St.Filters.has("texture") || St.Filters.has("colour")) return "";
    const Rows = Gens.map((G) => ({ G, Uses: FieldUses(G), Label: M.GeneratorDefinitions.find((D) => D.identity === G.Procedure)?.label || G.Procedure }))
      .filter(({ G, Label }) => Matches(St.Query, G.Name, G.Category, Label));
    if (!Rows.length) return "";
    const Open = St.Query ? true : Outliner.IsExpanded(Id.fields, false);
    return GroupRow({ Id: Id.fields, Depth: 1, Icon: icon("field", 15), Name: "Fields", Meta: `${Gens.length} procedural · seeded`, Expandable: true, Expanded: Open })
      + (Open ? Rows.map(({ G, Uses, Label }) => TreeRow({
        Id: `field:${G.Identity}`, Depth: 2, Icon: `<span class="ol-field-dot"></span>`, Name: G.Name, Kind: "field",
        Meta: `${Label.replace("Military camouflage · ", "Camo · ")} · ${Uses.length ? `drives ${Uses.length}` : "unused"}`,
        Muted: !Uses.length, Title: Uses.map((U) => `${U.L.Name} · ${M.CHANNEL[U.K].Caption}`).join("\n"),
      })).join("") : "");
  }

  function LibraryHtml(St) {
    const Items = M.CATALOG.filter((E) => Matches(St.Query, E.name, E.category, E.label));
    if (!Items.length || [...St.Filters].length) return "";
    const Open = St.Query ? true : Outliner.IsExpanded(Id.library, false);
    return GroupRow({ Id: Id.library, Depth: 0, Icon: icon("folder", 15), Name: "Library", Meta: `${M.CATALOG.length} materials`, Expandable: true, Expanded: Open })
      + (Open ? Items.map((E) => TreeRow({
        Id: `lib:${E.id}`, Depth: 1, Icon: `<span class="ol-chip-swatch" style="background:radial-gradient(circle at 35% 30%, ${E.secondaryColor || "#ffffff55"}, ${E.color} 70%)"></span>`,
        Name: E.name.replace(/\s*\(.*\)$/, ""), Meta: `${E.category} · ${E.label.toLowerCase()}`, Selected: E.id === S.P.id, Title: E.name,
      })).join("") : "");
  }

  function Html(St) {
    const P = S.P, I = M.Insight(P), Sum = M.Summary(P), Layers = P.Authoring.Layers;
    const RootOpen = Outliner ? Outliner.IsExpanded(Id.root, true) : true;
    const Body = StrataHtml(St) + FieldsHtml(St);
    const Rows = TreeRow({ Id: Id.root, Depth: 0, Icon: icon("material", 15), Name: P.name || "Material", Kind: "root",
      Meta: `${P.category || "Material"} · ${Sum.Enabled}/${Sum.Total} strata`, Expandable: true, Expanded: RootOpen || !!St.Query,
      Renaming: St.Renaming === Id.root, Title: P.label || "" })
      + (RootOpen || St.Query ? Body : "") + LibraryHtml(St);
    return Shell({
      Label: "Material outliner", Title: "Outliner", Meta: "Material Scene & Strata",
      Tools: `<button type="button" class="ol-round" data-act="add-detail" ${Layers.length >= 16 ? "disabled" : ""} title="Add detail stratum" aria-label="Add detail stratum">${icon("plus", 14)}</button>`,
      Stats: [
        { Label: "Strata", Value: `${Sum.Enabled}/${Sum.Total}`, Act: "stat-enabled", Tone: Sum.Enabled === Sum.Total ? "on" : "muted", Title: "Show enabled strata only" },
        { Label: "Driven", Value: `${I.Signal.Driven}/${I.Signal.Slots}`, Act: "stat-driven", Tone: I.Signal.Driven ? "on" : "muted", Glyph: "field", Title: "Show driven channel slots only" },
      ],
      Placeholder: "Search strata, channels, fields…",
      Filters: [["Enabled strata", "enabled"], ["Driven slots", "driven"], ["Fields", "field"], ["Ramps", "ramp"], ["Images", "texture"], ["Colour channels", "colour"]],
      Chips: St.Filters.size || St.Query ? "" : `<span class="ol-chip-row">
        <button type="button" data-act="add-detail" ${Layers.length >= 16 ? "disabled" : ""}>${icon("detail", 11)}Detail stratum</button>
        ${M.DETAIL_PRESETS.map((D) => `<button type="button" data-act="add-preset" data-preset="${D.Id}" title="New detail stratum · ${Esc(D.Label)}" ${Layers.length >= 16 ? "disabled" : ""}><i style="background:linear-gradient(90deg, ${D.Stops.join(", ")})"></i>${Esc(D.Label)}</button>`).join("")}
      </span>`,
      Rows, Empty: "No strata or channels match",
      Footer: [
        { Label: "F0", Value: (I.F0 * 100).toFixed(1), Unit: "%" },
        { Label: "Class", Value: I.Class, Tone: I.Hybrid ? "warn" : "" },
        { Label: "Gloss", Value: I.Gloss },
        { Label: "Albedo", Value: `${Math.round(I.Albedo.Srgb * 100)}`, Unit: "%", Tone: I.Albedo.Ok ? "" : "warn" },
      ],
    }, St);
  }

  // ---------------------------------------------------------------------------------------------- actions
  const Parse = (RowId) => { const [Kind, A, B] = RowId.split(":"); return { Kind, A, B }; };

  function OnSelect(RowId) {
    const { Kind, A, B } = Parse(RowId);
    if (Kind === "layer") {
      Outliner.State.Expanded[RowId] = true;
      if (S.LayerId !== A) Hub.SelectLayer(A);
      else { Hub.FoldChannels(); Hub.Render(); }   // re-selecting the active stratum folds the channel editor away
    }
    else if (Kind === "ch") { Outliner.State.Expanded[`layer:${A}`] = true; Hub.OpenChannel(A, B); }
    else if (Kind === "grp") { Outliner.State.Expanded[RowId] = !(Host.querySelector(`[data-row="${CSS.escape(RowId)}"]`)?.getAttribute("aria-expanded") === "true"); Outliner.Render(); }
    else if (Kind === "field") {
      const G = S.P.Authoring.Generators.find((E) => E.Identity === A), Use = G && FieldUses(G)[0];
      if (Use) { Outliner.State.Expanded[`layer:${Use.L.Identity}`] = true; Hub.OpenChannel(Use.L.Identity, Use.K); }
    } else if (Kind === "lib") { if (A !== S.P.id) Hub.Load(A); }
    else if (RowId === Id.root || RowId === Id.fields || RowId === Id.library) { Outliner.State.Expanded[RowId] = !Outliner.IsExpanded(RowId, RowId === Id.root); Outliner.Render(); Outliner.FocusRow(RowId); }
    Outliner.FocusRow(RowId);
  }

  function AddDetail(Preset) {
    const R = M.AddDetailLayer(S.P);
    if (!R.Identity) return Hub.Flash("Stratum limit reached (16)");
    let Next = R.P;
    if (Preset) Next = M.ApplyDetailPreset(Next, R.Identity, Preset);
    Hub.Apply(Next);
    S.LayerId = R.Identity; S.Channel = "colour";
    Outliner.State.Expanded[`layer:${R.Identity}`] = true;
    Hub.Render();
    Hub.Flash(Preset ? `${M.DETAIL_PRESETS.find((D) => D.Id === Preset).Label} detail added` : "Detail stratum added");
  }

  function Remove(LayerId) {
    const L = M.FindLayer(S.P, LayerId);
    if (!L || L.Model !== "detail") return;
    Hub.Apply(M.RemoveLayer(S.P, LayerId));
    if (S.LayerId === LayerId) { S.LayerId = Hub.Layer().Identity; S.Channel = Hub.Layer().Channels[0]; }
    Hub.Render();
    Hub.Flash(`${L.Name} removed`);
  }

  function OnAction(Act, El) {
    const LayerId = El.dataset.id?.replace(/^layer:/, "");
    if (Act === "layer-toggle") {
      const L = M.FindLayer(S.P, LayerId);
      Hub.Apply(M.PatchLayer(S.P, LayerId, { Enabled: !L.Enabled }));
      Hub.Render(); Hub.Flash(`${L.Name} ${L.Enabled ? "disabled" : "enabled"}`);
    } else if (Act === "layer-up" || Act === "layer-down") { Hub.Apply(M.MoveLayer(S.P, LayerId, Act === "layer-up" ? -1 : 1)); Hub.Render(); Outliner.FocusRow(`layer:${LayerId}`); }
    else if (Act === "layer-remove") Remove(LayerId);
    else if (Act === "add-detail") AddDetail(null);
    else if (Act === "add-preset") AddDetail(El.dataset.preset);
    else if (Act === "stat-enabled") { Outliner.State.Filters.has("enabled") ? Outliner.State.Filters.delete("enabled") : Outliner.State.Filters.add("enabled"); Outliner.Render(); }
    else if (Act === "stat-driven") { Outliner.State.Filters.has("driven") ? Outliner.State.Filters.delete("driven") : Outliner.State.Filters.add("driven"); Outliner.Render(); }
    else return false;
    return true;
  }

  Outliner = CreateOutliner(Host, {
    Html, OnSelect, OnAction,
    CanRename: (RowId) => RowId === Id.root || RowId.startsWith("layer:"),
    OnRename(RowId, Name) {
      if (RowId === Id.root) { const Next = structuredClone(S.P); Next.name = Name; Hub.Apply(Next); }
      else Hub.Apply(M.PatchLayer(S.P, RowId.slice(6), { Name }));
      Hub.Render();
    },
    OnDelete: (RowId) => RowId.startsWith("layer:") && Remove(RowId.slice(6)),
    OnSpace(RowId) { if (RowId.startsWith("layer:")) OnAction("layer-toggle", { dataset: { id: RowId } }); },
    CanDrop: (Drag, Target) => Target.startsWith("layer:") && M.FindLayer(S.P, Target.slice(6))?.Model === "detail",
    OnDrop(Drag, Target, Where) {
      const Layers = S.P.Authoring.Layers, From = Layers.findIndex((L) => `layer:${L.Identity}` === Drag);
      let To = Layers.findIndex((L) => `layer:${L.Identity}` === Target) + (Where === "after" ? 1 : 0);
      if (From < To) To -= 1;
      let Next = S.P;
      for (let Guard = 0; Guard < 16 && From !== To; Guard++) {
        const At = Next.Authoring.Layers.findIndex((L) => `layer:${L.Identity}` === Drag);
        if (At === To) break;
        const Moved = M.MoveLayer(Next, Drag.slice(6), To < At ? -1 : 1);
        if (Moved === Next) break;
        Next = Moved;
      }
      Hub.Apply(Next); Hub.Render();
    },
  });

  Hub.Subscribe(() => Outliner.Render());
  Outliner.Render();
  return Outliner;
}
