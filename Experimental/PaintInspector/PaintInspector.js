// PaintInspector.js — the Texture Paint Layer Inspector card (TextureStudio TexturePaintWorkspace's right panel), in the
// Project Zero style shared by the Material, Pattern / Stamp, Map Baking and Brush pages.
//
// One card for the selected layer, top to bottom:
//   identity (kind · name · layer picker) → statistics (opacity · channels on · mask) → Layer (blend, opacity, part
//   filter, visible, lock) → the kind's own card (fill pattern · material preset · generator · stamps / text · folder)
//   → Channels (ChannelStack: enable per channel, open one for its value, opacity and blend) → Mask → export.
// The old inspector stacked "Master Opacity", per-kind panels, a 22-row channel grid and the mask into one long scroll;
// here the channel list folds by group and only the open channel shows its controls.
//
// The card edits a document (PaintModel.js, built on TextureStudio's createPaintLayer); it draws no texels.
//
//   Mount(El, { docked, scoped, store }) → Inspector { State, Model, History, Render, Apply, Settle, Flash, Step, Subscribe(Fn), OpenLayer(Id),
//                                 Add(Type), Duplicate(Id), Remove(Id), Move(Drag, Target, Where), Rename(Id, Name) }

import { icon } from "../MaterialInspector/Icons.js";
import { KeyReaches, Esc, Knob, ColourField, Toggle, SwitchRow, Segments, Dropdown, StatTile, SyncSiblings, Download, Rebuild, History } from "../MaterialInspector/CardKit.js";
import { ChannelStack, StackAction, StackUi, ParseStackBind, PAINT_GROUPS } from "../MaterialInspector/ChannelStack.js";
import * as B from "./PaintModel.js";

const Store = (() => { try { return globalThis.localStorage; } catch { return null; } })();

export function Mount(Root, Options = {}) {
  const S = { P: null, Docked: !!Options.docked, Stack: StackUi(), Folds: {}, Status: "", StatusTimer: 0, Stamp: {} };
  const H = History();
  const Peers = new Set();
  const Notify = (Live) => { for (const Fn of Peers) Fn(Live); };

  // -------------------------------------------------------------------------------------------- plumbing
  const Save = () => { if (Options.store === false) return; try { Store?.setItem(B.STORAGE_KEY, JSON.stringify(B.Serialise(S.P))); } catch { /* private mode / quota */ } };
  function Apply(Next, Live = false) { if (!Next || Next === S.P) return; H.Begin(S.P); S.P = Next; if (!Live) Settle(); }
  function Settle() { if (H.Settle(S.P)) Save(); }
  function Step(Back) {
    Settle();
    const Prev = H.Step(Back, S.P);
    if (!Prev) return;
    S.P = Prev; Save(); Render(); Flash(Back ? "Undone" : "Redone");
  }
  function Flash(Text) {
    S.Status = Text;
    const El = Root.querySelector("[data-status]");
    if (El) { El.textContent = Text; El.classList.add("on"); }
    clearTimeout(S.StatusTimer);
    S.StatusTimer = setTimeout(() => { S.Status = ""; const E = Root.querySelector("[data-status]"); if (E) { E.classList.remove("on"); E.textContent = "Saved locally"; } }, 1800);
  }
  const L = () => B.Selected(S.P);
  const Locked = () => !!L()?.locked;

  // -------------------------------------------------------------------------------------------- sections
  const LayerOptions = () => {
    const Out = [];
    const Walk = (EnclosingId, Depth) => { for (const E of B.TopFirst(S.P, EnclosingId)) { Out.push([`${"  ".repeat(Depth)}${E.name}`, E.id, B.LAYER_TYPE[E.kind].Icon, B.LAYER_TYPE[E.kind].Label]); if (E.kind === "folder") Walk(E.id, Depth + 1); } };
    Walk(null, 0);
    return Out;
  };

  function StatsHtml(Ly) {
    const Stack = B.LayerStack(Ly), On = Stack.on.length;
    return StatTile({ Key: "opacity", Label: "Opacity", Value: String(Math.round(Ly.opacity * 100)), Unit: "%", Hot: true, Caption: `${Ly.blend} blend${Ly.visible ? "" : " · hidden"}`,
        Meter: { Kind: "fill", At: Ly.opacity, Colour: B.LAYER_TONES[Ly.kind] }, Title: "Layer master opacity — every channel is scaled by it" })
      + StatTile({ Key: "channels", Label: "Channels", Value: Ly.kind === "folder" ? "—" : String(On), Unit: Ly.kind === "folder" ? "" : `/ ${B.PAINT_CHANNELS.length}`,
        Caption: Ly.kind === "folder" ? "Folders group layers" : PAINT_GROUPS.filter((G) => B.PAINT_CHANNELS.some((C) => C.Group === G && Stack.on.includes(C.Id))).join(" · ") || "Nothing written",
        Meter: { Kind: "stack", Parts: PAINT_GROUPS.map((G, I) => ({ Share: B.PAINT_CHANNELS.filter((C) => C.Group === G && Stack.on.includes(C.Id)).length / B.PAINT_CHANNELS.length, Colour: ["#e8c27a", "#c9d2dc", "#cfe3ff", "#9ee6d8", "#ff7a3b"][I], Title: G })) },
        Title: "Paint channels this layer writes, by group" })
      + StatTile({ Key: "mask", Label: "Mask", Value: Ly.mask ? (Ly.mask.enabled ? "On" : "Off") : "None", Tone: Ly.mask?.enabled ? "ok" : "",
        Caption: Ly.mask ? `${B.MASK_PRESETS.find(([, V]) => V === Ly.mask.preset)?.[0] || "Manual"}${Ly.mask.invert ? " · inverted" : ""} · ${Math.round(Ly.mask.opacity * 100)}%` : "Add one below",
        Meter: { Kind: "fill", At: Ly.mask?.enabled ? Ly.mask.opacity : 0, Colour: "#9aa4b2" }, Title: "Layer mask" });
  }

  function LayerSection(Ly) {
    const Lk = Locked();
    return `<section class="pi-section">
      <div class="mi-section-title"><h3>Layer</h3><small>${Esc(B.LAYER_TYPE[Ly.kind].Hint.toUpperCase())}</small></div>
      <div class="pi-pair">
        <div class="pi-field"><span class="pi-label">Blend</span>${Dropdown("blend", B.BLENDS.map((V) => [V, V]), Ly.blend, { Label: "Layer blend", Class: "compact", Disabled: Lk, Search: false })}</div>
        <div class="pi-field"><span class="pi-label">Part</span>${Dropdown("part", B.PartOptions(S.P), Ly.partFilter, { Label: "Part filter", Class: "compact", Disabled: Lk, Search: false })}</div>
      </div>
      ${Knob({ Bind: "layer:opacity", Label: "Opacity", Value: Math.round(Ly.opacity * 100), Min: 0, Max: 100, Step: 1, Unit: "%", Hint: "Master opacity" })}
      ${SwitchRow("visible", Ly.visible, "Visible", "Hidden layers are skipped when compositing")}
      ${SwitchRow("lock", Ly.locked, "Lock edits", "Protects the layer from painting and edits")}
    </section>`;
  }

  function KindSection(Ly) {
    const Lk = Locked(), Fold = (Id, Title, Small, Body, Open = true) => `<details class="mi-fold" data-fold="${Id}" ${(S.Folds[Id] ?? Open) ? "open" : ""}>
      <summary>${icon(B.LAYER_TYPE[Ly.kind].Icon, 14)}<span>${Esc(Title)}</span><small>${Esc(Small)}</small><span class="mi-chev">${icon("chevron", 11)}</span></summary>
      <div class="mi-fold-body">${Body}</div></details>`;
    switch (Ly.kind) {
      case "fill": return Fold("fill", "Fill & pattern", `${Ly.fill.color.toUpperCase()} · ${Ly.fill.patternRepeats}× REPEAT`, `
        <p class="mi-note">Colour and channel values live in Channels below — open Albedo, Roughness, … for each.</p>
        <div class="mi-knob-grid">
          ${Knob({ Bind: "fill:patternRepeats", Label: "Repeats", Value: Ly.fill.patternRepeats, Min: 1, Max: 32, Step: 1, Unit: "×" })}
          ${Knob({ Bind: "fill:patternRotation", Label: "Rotation", Value: Ly.fill.patternRotation, Min: -180, Max: 180, Step: 1, Unit: "°" })}
        </div>
        ${Knob({ Bind: "fill:patternHeightStrength", Label: "Pattern height gain", Value: Math.round(Ly.fill.patternHeightStrength * 100), Min: 0, Max: 200, Step: 1, Unit: "%" })}`);
      case "material": return Fold("material", "Material preset", `${(Ly.material.presetCategory || "Material").toUpperCase()} · ${Esc(Ly.material.presetLabel || "PBR")}`, `
        ${Dropdown("material", B.MATERIALS.map((M) => [M.name, M.id, `<i class="pi-dot" style="background:${M.color}"></i>`, M.category]), Ly.material.presetId, { Label: "Frontier material", Search: true, Disabled: Lk })}
        <div class="mi-knob-grid">
          ${Knob({ Bind: "material:grainScale", Label: "Grain scale", Value: Math.round(Ly.material.grainScale), Min: 1, Max: 40, Step: 1, Unit: "" })}
          ${Knob({ Bind: "material:grainStrength", Label: "Grain", Value: Math.round(Ly.material.grainStrength * 100), Min: 0, Max: 100, Step: 1, Unit: "%" })}
        </div>`);
      case "generator": return Fold("generator", "Procedural generator", `${(B.GENERATORS.find(([, V]) => V === Ly.generator.preset)?.[0] || "").toUpperCase()}`, `
        ${Dropdown("gen-preset", B.GENERATORS, Ly.generator.preset, { Label: "Generator", Search: false, Disabled: Lk })}
        <div class="mi-knob-grid">
          ${Knob({ Bind: "generator:threshold", Label: "Threshold", Value: Math.round(Ly.generator.threshold * 100), Min: 0, Max: 100, Step: 1, Unit: "%" })}
          ${Knob({ Bind: "generator:softness", Label: "Softness", Value: Math.round(Ly.generator.softness * 100), Min: 0, Max: 100, Step: 1, Unit: "%" })}
          ${Knob({ Bind: "generator:noiseMix", Label: "Noise breakup", Value: Math.round(Ly.generator.noiseMix * 100), Min: 0, Max: 100, Step: 1, Unit: "%" })}
          ${Knob({ Bind: "generator:noiseScale", Label: "Noise scale", Value: Ly.generator.noiseScale, Min: 1, Max: 24, Step: 0.5, Unit: "" })}
        </div>
        ${SwitchRow("gen-invert", Ly.generator.invert, "Invert", "Swap where the generator writes")}`);
      case "decal": case "text": {
        const Sel = Ly.stamps.find((E) => E.id === (S.Stamp[Ly.id] || Ly.selectedStampId)) || Ly.stamps[0];
        const Rows = Ly.stamps.map((E) => `<button type="button" class="pi-stamp ${E.id === Sel?.id ? "active" : ""}" data-act="stamp-pick" data-id="${Esc(E.id)}"><i style="background:${E.tint}"></i><span>${Esc(E.name)}<small>${E.projection.toUpperCase()} · ${Math.round(E.scale * 100)}% · ${Math.round(E.rotation)}°</small></span></button>`).join("");
        return Fold("stamps", Ly.kind === "text" ? "Text & stamp" : "Stamps", `${Ly.stamps.length} STAMP${Ly.stamps.length === 1 ? "" : "S"}`, `
          ${Ly.kind === "text" ? `<label class="pi-field"><span class="pi-label">Text</span><input class="pi-text" data-act="text-content" data-fid="text-content" value="${Esc(Ly.text.content)}" maxlength="80" spellcheck="false" ${Lk ? "disabled" : ""}></label>
            <div class="pi-field"><span class="pi-label">Colour</span>${ColourField("text:color", "Text colour", Ly.text.color, "")}</div>` : ""}
          <div class="pi-stamps">${Rows || `<p class="mi-empty">No stamps yet.</p>`}</div>
          ${Sel ? `<div class="mi-sub-label">${Esc(Sel.name)} · transform</div>
          ${Segments("stamp-projection", [["UV", "uv"], ["3D", "3d"]], Sel.projection, { Label: "Projection" })}
          <div class="mi-knob-grid">
            ${Knob({ Bind: "stamp:u", Label: "U", Value: Math.round(Sel.u * 100), Min: 0, Max: 100, Step: 1, Unit: "%" })}
            ${Knob({ Bind: "stamp:v", Label: "V", Value: Math.round(Sel.v * 100), Min: 0, Max: 100, Step: 1, Unit: "%" })}
            ${Knob({ Bind: "stamp:scale", Label: "Scale", Value: Math.round(Sel.scale * 100), Min: 3, Max: 150, Step: 1, Unit: "%" })}
            ${Knob({ Bind: "stamp:rotation", Label: "Rotation", Value: Math.round(Sel.rotation), Min: -180, Max: 180, Step: 1, Unit: "°" })}
            ${Knob({ Bind: "stamp:opacity", Label: "Opacity", Value: Math.round(Sel.opacity * 100), Min: 0, Max: 100, Step: 1, Unit: "%" })}
            ${Knob({ Bind: "stamp:heightStrength", Label: "Height", Value: Math.round(Sel.heightStrength * 100), Min: -100, Max: 100, Step: 1, Unit: "%" })}
          </div>` : ""}`);
      }
      case "paint": return Fold("paint", "Paint layer", "HAND-PAINTED TEXELS", `<p class="mi-note">Paint with the Brush page: its Materials section and every tool's Channels decide what each stroke writes. This layer sets how much of each channel shows.</p>
        <a class="mi-text-btn pi-link" href="../BrushStudio/">${icon("brush", 11)}Open the Brush page</a>`, false);
      case "folder": { const Kids = B.TopFirst(S.P, Ly.id); return Fold("folder", "Folder", `${Kids.length} LAYER${Kids.length === 1 ? "" : "S"}`, `<p class="mi-note">${Kids.length ? `Holds ${Kids.map((K) => Esc(K.name)).join(", ")}.` : "Empty — drag layers onto it in the outliner."} Hiding the folder hides every layer inside; its opacity and blend apply to the group.</p>`); }
      default: return "";
    }
  }

  function ChannelSection(Ly) {
    if (Ly.kind === "folder") return "";
    const Stack = B.LayerStack(Ly);
    return `<section class="pi-section">${ChannelStack({
      Bind: "layer:stack", Title: "Channels", Value: Stack, Card: B.LayerCard(Ly), Ui: S.Stack, Hint: B.QueryLayerValues(Ly) ? "value · opacity · blend" : "opacity · blend",
      Albedo: B.QueryLayerValues(Ly) ? undefined : Ly.kind === "text" ? Ly.text.color : Ly.kind === "decal" ? Ly.stamps[0]?.tint || "#ffffff" : undefined,
      Readout: (C) => {
        if (!Stack.on.includes(C.Id)) return { Text: "Off", Kind: "off" };
        const P = Stack.per[C.Id], Op = P.opacity < 100 ? ` · ${P.opacity}%` : "", Bl = P.blend !== "Inherit" ? ` · ${P.blend}` : "";
        if ("value" in P) return { Text: `${C.Type === "colour" ? String(P.value).toUpperCase() : `${P.value} %`}${Op}${Bl}`, Kind: "value" };
        return { Text: `${P.opacity} %${Bl}`, Kind: "value" };
      },
    })}</section>`;
  }

  function MaskSection(Ly) {
    const M = Ly.mask;
    if (!M) return `<section class="pi-section"><div class="mi-section-title"><h3>Mask</h3><small>NONE</small>
      <button type="button" class="mi-text-btn" data-act="mask-add" ${Locked() ? "disabled" : ""}>${icon("plus", 10)}Add mask</button></div></section>`;
    return `<section class="pi-section">
      <div class="mi-section-title"><h3>Mask</h3><small>${M.enabled ? "ON" : "OFF"}${M.invert ? " · INVERTED" : ""}</small>
        <button type="button" class="mi-text-btn" data-act="mask-remove" ${Locked() ? "disabled" : ""}>${icon("trash", 10)}Remove</button></div>
      <div class="pi-mask">
        ${SwitchRow("mask-enabled", M.enabled, "Enabled")}
        ${SwitchRow("mask-invert", M.invert, "Invert")}
        <div class="pi-field"><span class="pi-label">Source</span>${Dropdown("mask-preset", B.MASK_PRESETS, M.preset, { Label: "Mask source", Search: false })}</div>
        ${Knob({ Bind: "mask:opacity", Label: "Mask opacity", Value: Math.round(M.opacity * 100), Min: 0, Max: 100, Step: 1, Unit: "%" })}
      </div>
    </section>`;
  }

  function CardHtml() {
    const Ly = L();
    const Head = `<header class="mi-head">
      <span class="mi-mark pi-mark" style="--c:${Ly ? B.LAYER_TONES[Ly.kind] : "#888"}">${icon(Ly ? B.LAYER_TYPE[Ly.kind].Icon : "layers", 15)}</span>
      <div class="mi-head-title"><b>Layer Inspector</b><small>TEXTURE PAINT · ${Esc(B.MeshLabel(S.P).toUpperCase())}</small></div>
      <div class="mi-head-tools">
        <button type="button" class="icon-btn" data-act="undo" ${H.Past.length ? "" : "disabled"} title="Undo (Ctrl+Z)" aria-label="Undo">${icon("undo", 14)}</button>
        <button type="button" class="icon-btn" data-act="redo" ${H.Future.length ? "" : "disabled"} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon("redo", 14)}</button>
        <label class="icon-btn" title="Import a texture paint document" aria-label="Import document">${icon("upload", 14)}<input type="file" accept=".json,.texpaint,application/json" data-act="import" hidden></label>
        ${S.Docked ? `<button type="button" class="icon-btn" data-act="export" title="Download the document (.texpaint.json)" aria-label="Download document">${icon("download", 14)}</button>` : ""}
        <button type="button" class="icon-btn" data-act="reset" title="Back to the starter document" aria-label="Reset document">${icon("reset", 14)}</button>
      </div>
    </header>`;
    if (!Ly) return `<article class="mi-card pi-card" aria-label="Layer Inspector">${Head}<section><p class="mi-empty">No layer selected.</p></section></article>`;
    const Index = S.P.layers.length - S.P.layers.indexOf(Ly);
    return `<article class="mi-card pi-card ${Ly.locked ? "locked" : ""}" aria-label="Layer Inspector">
      ${Head}
      <section class="mi-ident">
        <span class="mi-eyebrow">${Esc(B.LAYER_TYPE[Ly.kind].Label.toUpperCase())} LAYER / ${String(Index).padStart(2, "0")}${Ly.parentId ? ` · IN ${Esc(B.Layer(S.P, Ly.parentId).name.toUpperCase())}` : ""}${Ly.locked ? " · LOCKED" : ""}</span>
        <input class="mi-name" data-act="layer-name" data-fid="layer-name" value="${Esc(Ly.name)}" maxlength="80" spellcheck="false" aria-label="Layer name">
        <div class="mi-ident-row">
          <span class="mi-sub">${Esc(Ly.blend.toUpperCase())} · ${Math.round(Ly.opacity * 100)}%${Ly.kind === "folder" ? "" : ` · ${B.LayerStack(Ly).on.length} CH`}${Ly.mask ? " · MASK" : ""}</span>
          ${Dropdown("layer-pick", LayerOptions(), Ly.id, { Label: "Layer", Class: "compact mi-library-dd", Search: S.P.layers.length > 10 })}
        </div>
      </section>
      <section class="mi-metrics">${StatsHtml(Ly)}</section>
      ${LayerSection(Ly)}
      ${KindSection(Ly)}
      ${ChannelSection(Ly)}
      ${MaskSection(Ly)}
      <footer class="mi-foot">
        ${S.Docked ? "" : `<div class="mi-export">
          <button type="button" class="primary" data-act="export">${icon("download", 13)}.texpaint</button>
          <button type="button" data-act="export-layer" title="This layer only">${icon("download", 13)}Layer</button>
          <button type="button" data-act="copy" title="Copy the document JSON">${icon("copy", 13)}Copy</button>
        </div>`}
        <div class="mi-foot-line"><span class="mi-status ${S.Status ? "on" : ""}" data-status>${Esc(S.Status || "Saved locally")}</span><span>${Esc(B.SCHEMA)}</span></div>
      </footer>
    </article>`;
  }

  function Render() { Rebuild(Root, CardHtml(), ".pi-card"); Notify(false); }

  // -------------------------------------------------------------------------------------------- edits
  const Pct = (V) => +V / 100;
  const SCALE = { patternRepeats: 1, patternRotation: 1, patternHeightStrength: 100, grainScale: 1, grainStrength: 100, threshold: 100, softness: 100, noiseMix: 100, noiseScale: 1, u: 100, v: 100, scale: 100, rotation: 1, opacity: 100, heightStrength: 100 };
  function Write(Bind, Raw) {
    const Ly = L();
    if (!Ly) return S.P;
    const At = ParseStackBind(Bind);
    if (Locked()) return S.P;   // a locked layer only takes visibility and the lock itself
    if (At) return B.AssignChannelField(S.P, Ly.id, At.Ch, At.Key, Raw);
    const [Scope, Key] = Bind.split(":");
    if (Scope === "layer" && Key === "opacity") return B.Edit(S.P, Ly.id, { opacity: Pct(Raw) });
    if (Scope === "mask" && Ly.mask) return B.Edit(S.P, Ly.id, { mask: { ...Ly.mask, opacity: Pct(Raw) } });
    if (Scope === "text" && Key === "color") return /^#[0-9a-f]{6}$/i.test(Raw) ? B.Edit(S.P, Ly.id, (E) => ({ text: { ...E.text, color: Raw }, stamps: E.stamps.map((St) => ({ ...St, text: { ...(St.text || E.text), color: Raw }, stampData: null })) })) : S.P;
    if (["fill", "material", "generator"].includes(Scope)) return B.Edit(S.P, Ly.id, (E) => ({ [Scope]: { ...E[Scope], [Key]: +Raw / (SCALE[Key] || 1) } }));
    if (Scope === "stamp") {
      const Id = S.Stamp[Ly.id] || Ly.selectedStampId || Ly.stamps[0]?.id;
      return B.Edit(S.P, Ly.id, (E) => ({ stamps: E.stamps.map((St) => (St.id === Id ? { ...St, [Key]: +Raw / (SCALE[Key] || 1) } : St)) }));
    }
    return S.P;
  }

  function OnStack(Act, El) {
    const Ly = L();
    if (!Ly) return;
    const Res = StackAction(Act, El, B.LayerStack(Ly), S.Stack, B.LayerCard(Ly), { Min: 0 });
    if (Res?.Next) { if (Locked()) return Flash("Layer is locked"); Apply(B.AssignLayerStack(S.P, Ly.id, Res.Next)); }
    Render();
    if (Act === "cs-open" && S.Stack.Open) Root.querySelector(`[data-fid="cs:layer:stack:${CSS.escape(S.Stack.Open)}"]`)?.focus({ preventScroll: true });
  }

  function OnClick(Event) {
    const El = Event.target.closest("[data-act]");
    if (!El || !Root.contains(El) || El.disabled || El.tagName === "INPUT") return;
    const Act = El.dataset.act, V = El.dataset.value, Ly = L();
    if (Act.startsWith("cs-") && Act !== "cs-set" && Act !== "cs-search") return OnStack(Act, El);
    const Guard = () => { if (Locked()) { Flash("Layer is locked"); return true; } return false; };
    switch (Act) {
      case "undo": return Step(true);
      case "redo": return Step(false);
      case "reset": Apply(B.Create()); S.Stack = StackUi(); Flash("Starter document restored"); break;
      case "layer-pick": OpenLayer(V); return;
      case "cs-set": if (!Guard()) Apply(Write(El.dataset.bind, V)); break;
      case "blend": if (!Guard()) Apply(B.Edit(S.P, Ly.id, { blend: V })); break;
      case "part": if (!Guard()) Apply(B.Edit(S.P, Ly.id, { partFilter: +V })); break;
      case "visible": Apply(B.Edit(S.P, Ly.id, { visible: !Ly.visible })); break;
      case "lock": Apply(B.Edit(S.P, Ly.id, { locked: !Ly.locked })); break;
      case "material": if (!Guard()) { Apply(B.UseMaterial(S.P, Ly.id, V)); Flash(`${B.MATERIALS.find((M) => M.id === V)?.name} applied`); } break;
      case "gen-preset": if (!Guard()) Apply(B.Edit(S.P, Ly.id, (E) => ({ generator: { ...E.generator, preset: V } }))); break;
      case "gen-invert": if (!Guard()) Apply(B.Edit(S.P, Ly.id, (E) => ({ generator: { ...E.generator, invert: !E.generator.invert } }))); break;
      case "stamp-pick": S.Stamp[Ly.id] = El.dataset.id; break;
      case "stamp-projection": if (!Guard()) { const Id = S.Stamp[Ly.id] || Ly.selectedStampId; Apply(B.Edit(S.P, Ly.id, (E) => ({ stamps: E.stamps.map((St) => (St.id === Id ? { ...St, projection: V } : St)) }))); } break;
      case "mask-add": if (!Guard()) { Apply(B.AssignMask(S.P, Ly.id, true)); Flash("Mask added"); } break;
      case "mask-remove": if (!Guard()) { Apply(B.AssignMask(S.P, Ly.id, false)); Flash("Mask removed · Ctrl+Z restores"); } break;
      case "mask-enabled": if (!Guard()) Apply(B.Edit(S.P, Ly.id, (E) => ({ mask: { ...E.mask, enabled: !E.mask.enabled } }))); break;
      case "mask-invert": if (!Guard()) Apply(B.Edit(S.P, Ly.id, (E) => ({ mask: { ...E.mask, invert: !E.mask.invert } }))); break;
      case "mask-preset": if (!Guard()) Apply(B.Edit(S.P, Ly.id, (E) => ({ mask: { ...E.mask, preset: V } }))); break;
      case "export": Download(B.Export(S.P), `${S.P.name.replace(/\W+/g, "-").toLowerCase()}.texpaint.json`, "application/json"); return Flash("Exported document");
      case "export-layer": Download(JSON.stringify(B.Serialise({ ...S.P, layers: [Ly] }).layers[0], null, 2), `${Ly.name.replace(/\W+/g, "-").toLowerCase()}.layer.json`, "application/json"); return Flash("Exported layer");
      case "copy": (navigator.clipboard?.writeText(B.Export(S.P)) || Promise.reject()).then(() => Flash("Copied document"), () => Flash("Clipboard unavailable")); return;
      default: return;
    }
    Render();
  }

  function OnInput(Event) {
    const El = Event.target, Ly = L();
    if (El.dataset.act === "cs-search") {
      S.Stack.Query = El.value; const Pos = El.selectionStart; Render();
      const N = Root.querySelector('[data-act="cs-search"]'); N?.focus(); try { N?.setSelectionRange(Pos, Pos); } catch { /* */ }
      return;
    }
    if (El.dataset.act === "layer-name" && Ly) { Apply(B.Rename(S.P, Ly.id, El.value), true); Notify(true); return; }
    if (El.dataset.act === "text-content" && Ly && !Locked()) {
      const Content = El.value.slice(0, 80);
      Apply(B.Edit(S.P, Ly.id, (E) => ({ text: { ...E.text, content: Content }, stamps: E.stamps.map((St) => ({ ...St, text: { ...(St.text || E.text), content: Content }, stampData: null })) })), true);
      Notify(true); return;
    }
    if (!El.dataset.bind) return;
    if (El.dataset.hex !== undefined) { const Hex = El.value.trim().startsWith("#") ? El.value.trim() : `#${El.value.trim()}`; if (!/^#[0-9a-f]{6}$/i.test(Hex)) return; Apply(Write(El.dataset.bind, Hex.toLowerCase()), true); SyncSiblings(Root, El); Notify(true); return; }
    if (El.type === "number" && (El.value === "" || !Number.isFinite(+El.value))) return;
    Apply(Write(El.dataset.bind, El.value), true);
    SyncSiblings(Root, El);
    RefreshLive();
  }

  // Slider drags: refresh readouts and stat tiles without rebuilding the inputs under the pointer.
  function RefreshLive() {
    const Ly = L();
    if (!Ly) return;
    const T = document.createElement("template");
    T.innerHTML = CardHtml();
    for (const Sel of [".mi-metrics", ".mi-sub", ".mi-head-tools"]) { const A = Root.querySelector(Sel), Bt = T.content.querySelector(Sel); if (A && Bt) A.innerHTML = Bt.innerHTML; }
    for (const Row of Root.querySelectorAll(".cs-row")) {
      const Twin = T.content.querySelector(`.cs-row[data-row="${Row.dataset.row}"]`);
      for (const Sel of [".mi-readout", ".mi-swatch"]) { const A = Row.querySelector(`.mi-row-head ${Sel}`), Bt = Twin?.querySelector(`.mi-row-head ${Sel}`); if (A && Bt && A.outerHTML !== Bt.outerHTML) A.outerHTML = Bt.outerHTML; }
    }
    Notify(true);
  }

  async function OnChange(Event) {
    const El = Event.target, Act = El.dataset.act;
    if (Act === "layer-name" || Act === "text-content") { Settle(); Render(); return; }
    if (Act === "import") {
      const File = El.files?.[0];
      El.value = "";
      if (!File) return;
      try { Apply(B.Load(await File.text())); S.Stack = StackUi(); Render(); Flash("Document imported"); } catch (Error) { Flash(`Import failed · ${Error.message}`); }
      return;
    }
    if (El.dataset.bind) { Settle(); Render(); }
  }

  function OnKey(Event) {
    const T = Event.target, Typing = T.matches?.("input, textarea, select");
    if ((Event.ctrlKey || Event.metaKey) && !Event.altKey && (Event.key === "z" || Event.key === "Z" || Event.key === "y")) {
      if (Typing && T.type !== "range") return;
      Event.preventDefault();
      return Step(!(Event.key === "y" || Event.shiftKey));
    }
    if (T.classList?.contains("mi-row-head") && Root.contains(T) && (Event.key === "ArrowDown" || Event.key === "ArrowUp")) {
      Event.preventDefault();
      const Heads = [...Root.querySelectorAll(".mi-row-head")], At = Heads.indexOf(T);
      Heads[Math.max(0, Math.min(Heads.length - 1, At + (Event.key === "ArrowDown" ? 1 : -1)))]?.focus();
    }
    if (Event.key === "Escape" && !Typing && S.Stack.Open && Root.contains(T)) { S.Stack.Open = null; Render(); }
  }

  // -------------------------------------------------------------------------------------------- hub
  function OpenLayer(Id) {
    if (!B.Layer(S.P, Id)) return;
    S.P = B.Select(S.P, Id); Save(); Render();
    Root.querySelector(".mi-name")?.scrollIntoView?.({ block: "nearest" });
  }
  const Inspector = {
    State: S, Model: B, History: H, Render, Apply, Settle, Flash, Step, OpenLayer,
    Subscribe(Fn) { Peers.add(Fn); return () => Peers.delete(Fn); },
    Add(Type) { const { Next, Id } = B.AddLayer(S.P, Type); Apply(Next); Render(); Flash(`${B.LAYER_TYPE[Type].Label} layer added`); return Id; },
    Duplicate(Id) { const { Next, Id: New } = B.Duplicate(S.P, Id); Apply(Next); Render(); Flash("Layer duplicated"); return New; },
    Remove(Id) { if (S.P.layers.length <= 1) return Flash("Keep at least one layer"); const Name = B.Layer(S.P, Id)?.name; Apply(B.Remove(S.P, Id)); Render(); Flash(`${Name} removed · Ctrl+Z restores`); },
    Move(Drag, Target, Where) { const Next = B.Move(S.P, Drag, Target, Where); if (Next === S.P) return false; Apply(Next); Render(); return true; },
    Rename(Id, Name) { Apply(B.Rename(S.P, Id, Name)); Render(); },
    Edit(Id, Patch) { Apply(B.Edit(S.P, Id, Patch)); Render(); },
    Stack: (Id) => B.LayerStack(B.Layer(S.P, Id)),
    // Host hand-off: show the host's live layer document (Texture Studio's paint engine; texels stay with the host).
    Adopt(Doc) {
      Settle();
      let Next;
      try { Next = B.Normalise(B.Serialise(Doc)); } catch { return false; }
      S.P = Next;
      H.Clear?.();
      Render();
      return true;
    },
  };

  // -------------------------------------------------------------------------------------------- boot
  let Stored = null;
  try { Stored = Store?.getItem(B.STORAGE_KEY); } catch { Stored = null; }
  try { S.P = Stored ? B.Normalise(JSON.parse(Stored)) : B.Create(); } catch { S.P = B.Create(); }
  if (Options.layer && B.Layer(S.P, Options.layer)) S.P = B.Select(S.P, Options.layer);
  Root.addEventListener("click", OnClick);
  Root.addEventListener("input", OnInput);
  Root.addEventListener("change", OnChange);
  Root.addEventListener("toggle", (E) => { const F = E.target.closest?.("[data-fold]"); if (F) S.Folds[F.dataset.fold] = F.open; }, true);
  document.addEventListener("keydown", (E) => { if (KeyReaches(E, Root, !!Options.scoped)) OnKey(E); });
  Render();
  return Inspector;
}
