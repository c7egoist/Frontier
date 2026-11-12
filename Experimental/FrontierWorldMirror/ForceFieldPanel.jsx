import React, { useMemo, useState, useEffect } from "react";
import TransformPanel from "./TransformPanel.jsx";
import {
  FORCE_MODELS,
  FORCE_MODEL_SVG_PATHS,
  ForceDomains,
  ReachEnvelopes,
  AttenuationCurves,
  DurationModes,
  MotionTopologies,
  ColorRampModes,
  DEFAULT_FORCE_OVERLAY,
  FORMULA_PRESETS,
  GetForceModelMeta,
  ResolveForceValues,
  EvaluateForceSourceAt,
  EvaluateRadialEnvelope,
  ClassifyBeaufortScale,
  GetCompiledForceFormula,
  SerializeForceModelToml,
} from "./ForceFieldCatalog.js";

export function ForceModelSvg({ ModelId, Size = 18, Color }) {
  const Meta = GetForceModelMeta(ModelId);
  const Stroke = Color || Meta.Color || "#4AA8FF";
  const Markup = FORCE_MODEL_SVG_PATHS[Meta.Id] || '<circle cx="8" cy="8" r="4"/>';
  return (
    <svg
      width={Size}
      height={Size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={Stroke}
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: Markup }}
    />
  );
}

function ScalarRow({ Label, Value, Min, Max, Step = 0.05, Unit = "", Decimals = 2, OnChange }) {
  const Safe = Number.isFinite(+Value) ? +Value : Min;
  const Pct = Math.max(0, Math.min(100, ((Safe - Min) / Math.max(1e-6, Max - Min)) * 100));
  const Commit = (Raw) => {
    const N = Number(Raw);
    if (Number.isFinite(N)) OnChange(Math.max(Min, Math.min(Max, N)));
  };
  return (
    <label className="field compact" data-native-property={Label}>
      <span>{Label}</span>
      <div className="slider-pill">
        <div className="split-value">
          <input
            aria-label={Label + " value"}
            type="number"
            min={Min}
            max={Max}
            step={Step}
            value={Number(Safe.toFixed(Decimals))}
            onChange={(Ev) => Commit(Ev.target.value)}
          />
          {Unit ? <small>{Unit}</small> : null}
        </div>
        <input
          aria-label={Label}
          type="range"
          min={Min}
          max={Max}
          step={Step}
          value={Safe}
          style={{ "--fill": `${Pct}%` }}
          onChange={(Ev) => Commit(Ev.target.value)}
        />
      </div>
    </label>
  );
}

export default function ForceFieldPanel({
  Subject,
  Values = {},
  Change,
  OverlaySettings = DEFAULT_FORCE_OVERLAY,
  OnChangeOverlay,
  OnSavePreset,
}) {
  const [ActiveTab, SetActiveTab] = useState("Field");
  const [CopiedToml, SetCopiedToml] = useState(false);
  const [ProbeClock, SetProbeClock] = useState(0);

  const Force = useMemo(
    () => ResolveForceValues(Values.Force, Subject?.ForceModel || "LinearWind"),
    [Values.Force, Subject?.ForceModel],
  );
  const Meta = GetForceModelMeta(Force.Model);
  const DomainInfo = ForceDomains[Meta.Domain] || ForceDomains.VectorField;
  const Overlay = { ...DEFAULT_FORCE_OVERLAY, ...(OverlaySettings || {}) };

  useEffect(() => {
    if (Force.Duration === "Continuous" && Force.MotionTopology === "Static" && Meta.Domain !== "TurbulenceField") {
      return undefined;
    }
    const Id = setInterval(() => SetProbeClock((T) => T + 0.12), 120);
    return () => clearInterval(Id);
  }, [Force.Duration, Force.MotionTopology, Meta.Domain]);

  const UpdateForce = (Patch) => {
    const Next = ResolveForceValues({ ...Force, ...Patch }, Force.Model);
    Change("Force", Next);
  };

  const UpdateOverlay = (Patch) => {
    if (typeof OnChangeOverlay === "function") {
      OnChangeOverlay({ ...Overlay, ...Patch });
    }
  };

  const Position = Values.Position || Subject?.DefaultPosition || [0, 0, 1.4];
  const Rotation = Values.Rotation || Subject?.DefaultRotation || [0, 0, 0];

  // Probe & rolling 48-sample sparkline for Beaufort Anemometer
  const ProbeSample = useMemo(() => {
    const Samples = [];
    for (let I = 0; I < 40; ++I) {
      const T = ProbeClock - (39 - I) * 0.08;
      const OffsetR = Math.min(Force.Radius * 0.38, 1.2);
      const V = EvaluateForceSourceAt(
        Force,
        Position,
        Rotation,
        Position[0] + OffsetR * 0.7,
        Position[1] + OffsetR * 0.4,
        Position[2],
        T,
      );
      Samples.push(Math.hypot(V[0], V[1], V[2]));
    }
    const LatestVec = EvaluateForceSourceAt(
      Force,
      Position,
      Rotation,
      Position[0] + Math.min(Force.Radius * 0.35, 1.0),
      Position[1],
      Position[2],
      ProbeClock,
    );
    const Speed = Math.hypot(LatestVec[0], LatestVec[1], LatestVec[2]);
    return { Samples, LatestVec, Speed, Beaufort: ClassifyBeaufortScale(Speed) };
  }, [Force, Position, Rotation, ProbeClock]);

  const AttenuationPath = useMemo(() => {
    const Pts = [];
    for (let I = 0; I <= 32; ++I) {
      const U = I / 32;
      const Y = EvaluateRadialEnvelope(U, Force.Attenuation, Force.FalloffExponent);
      Pts.push(`${(8 + U * 224).toFixed(1)},${(58 - Y * 46).toFixed(1)}`);
    }
    return "M " + Pts.join(" L ");
  }, [Force.Attenuation, Force.FalloffExponent]);

  const SparklinePath = useMemo(() => {
    const MaxS = Math.max(5.0, ...ProbeSample.Samples);
    return (
      "M " +
      ProbeSample.Samples.map((S, I) => {
        const X = 6 + (I / Math.max(1, ProbeSample.Samples.length - 1)) * 228;
        const Y = 52 - (S / MaxS) * 40;
        return `${X.toFixed(1)},${Y.toFixed(1)}`;
      }).join(" L ")
    );
  }, [ProbeSample]);

  const CompiledFormula = useMemo(
    () => GetCompiledForceFormula(Force.FormulaCode),
    [Force.FormulaCode],
  );

  const TomlText = useMemo(
    () => SerializeForceModelToml(Subject?.Name || Meta.Name, Force, { Position, Rotation }),
    [Subject?.Name, Meta.Name, Force, Position, Rotation],
  );

  const DownloadForceModelFile = () => {
    const Ext = Force.FormulaEnabled ? ".VectorFieldSpace" : ".ForceModel";
    const SafeStem = String(Subject?.Name || Meta.Id)
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_");
    const BlobObj = new Blob([TomlText], { type: "text/plain;charset=utf-8" });
    const Url = URL.createObjectURL(BlobObj);
    const Link = document.createElement("a");
    Link.href = Url;
    Link.download = `${SafeStem || "ForcePreset"}${Ext}`;
    document.body.appendChild(Link);
    Link.click();
    Link.remove();
    URL.revokeObjectURL(Url);
  };

  const CopyToml = async () => {
    try {
      await navigator.clipboard?.writeText(TomlText);
      SetCopiedToml(true);
      setTimeout(() => SetCopiedToml(false), 1600);
    } catch {}
  };

  const pillStyle = (Active) => ({
    flex: 1,
    padding: "6px 8px",
    borderRadius: 6,
    border: Active ? `1px solid ${Meta.Color}` : "1px solid rgba(255,255,255,0.1)",
    background: Active ? "rgba(74, 168, 255, 0.16)" : "rgba(255,255,255,0.03)",
    color: Active ? "#f5f7fa" : "var(--ws-muted, #9aa0a6)",
    fontSize: 11.5,
    fontWeight: Active ? 600 : 500,
    cursor: "pointer",
  });

  return (
    <div className="force-field-inspector" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header Banner */}
      <div
        className="property-card"
        style={{
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          borderLeft: `3px solid ${Meta.Color}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <ForceModelSvg ModelId={Meta.Id} Size={20} Color={Meta.Color} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text, #f0f0f0)" }}>
                {Subject?.Name || Meta.Name}
              </div>
              <div style={{ fontSize: 11, color: "var(--ws-muted, #9aa0a6)" }}>
                {DomainInfo.Label} · Law #{Meta.Ordinal} · No Physics Coupling
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => UpdateForce({ Enabled: !Force.Enabled })}
            style={{
              padding: "4px 9px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              border: `1px solid ${Force.Enabled ? Meta.Color : "rgba(255,255,255,0.16)"}`,
              background: Force.Enabled ? "rgba(58, 214, 156, 0.16)" : "rgba(255,255,255,0.04)",
              color: Force.Enabled ? "#7ef2c2" : "#9aa0a6",
              cursor: "pointer",
            }}
          >
            {Force.Enabled ? "Active" : "Muted"}
          </button>
        </div>

        {/* 4-Tab Bar matching C++ ForceInspectorView */}
        <div role="tablist" aria-label="ForceField Inspector Tabs" style={{ display: "flex", gap: 5 }}>
          {["Field", "Formula", "Layers", "Cache"].map((Tab) => (
            <button
              key={Tab}
              type="button"
              role="tab"
              aria-selected={ActiveTab === Tab}
              style={pillStyle(ActiveTab === Tab)}
              onClick={() => SetActiveTab(Tab)}
            >
              {Tab}
            </button>
          ))}
        </div>
      </div>

      {ActiveTab === "Field" && (
        <>
          {/* Beaufort Anemometer Telemetry */}
          <div className="property-card" style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <strong style={{ fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.85 }}>
                Anemometer Telemetry
              </strong>
              <span style={{ fontSize: 11, color: Meta.Color, fontWeight: 600 }}>
                Bft {ProbeSample.Beaufort.Number} · {ProbeSample.Beaufort.Label}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 600 }}>
                {ProbeSample.Speed.toFixed(2)} <small style={{ fontSize: 11, opacity: 0.7 }}>{Meta.Unit}</small>
              </span>
              <code style={{ fontSize: 10.5, opacity: 0.75 }}>
                V=({ProbeSample.LatestVec[0].toFixed(1)}, {ProbeSample.LatestVec[1].toFixed(1)}, {ProbeSample.LatestVec[2].toFixed(1)})
              </code>
            </div>
            <svg viewBox="0 0 240 58" width="100%" height="54" style={{ background: "rgba(0,0,0,0.22)", borderRadius: 6 }}>
              <line x1="6" y1="52" x2="234" y2="52" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <path d={SparklinePath} fill="none" stroke={Meta.Color} strokeWidth="1.8" />
            </svg>
          </div>

          {/* 19-Law ForceModel Selector */}
          <div className="property-card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="field compact">
              <span>Force Law</span>
              <select
                aria-label="Force Law"
                value={Force.Model}
                onChange={(Ev) => {
                  const NextMeta = GetForceModelMeta(Ev.target.value);
                  UpdateForce({
                    Model: NextMeta.Id,
                    Reach: NextMeta.Defaults.Reach || Force.Reach,
                    SwirlRatio: NextMeta.Defaults.SwirlRatio ?? Force.SwirlRatio,
                  });
                }}
              >
                {FORCE_MODELS.map((Law) => (
                  <option key={Law.Id} value={Law.Id}>
                    {String(Law.Ordinal).padStart(2, "0")} · {Law.Name} ({Law.Domain})
                  </option>
                ))}
              </select>
            </label>
            <div
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.25)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                color: Meta.Color,
              }}
            >
              {Meta.Equation}
            </div>
            <p style={{ margin: 0, fontSize: 11.5, opacity: 0.78, lineHeight: 1.38 }}>{Meta.Summary}</p>
          </div>

          {/* World Transform */}
          <div className="property-card" style={{ padding: "10px 12px" }}>
            <TransformPanel
              Values={{ ...Values, Position, Rotation, Scale: Values.Scale || [1, 1, 1] }}
              Change={Change}
              Compact
              Space="WORLD +Z UP"
            />
          </div>

          {/* Envelope & Law Parameters */}
          <div className="property-card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <strong style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.85 }}>
              Magnitude & Radial Envelope f(r)
            </strong>
            <ScalarRow Label="Strength" Value={Force.Strength} Min={-60} Max={60} Step={0.25} Unit={Meta.Unit} Decimals={2} OnChange={(V) => UpdateForce({ Strength: V })} />
            <ScalarRow Label="Reach Radius" Value={Force.Radius} Min={0.4} Max={40} Step={0.1} Unit="m" Decimals={2} OnChange={(V) => UpdateForce({ Radius: V })} />
            <ScalarRow Label="Core Radius" Value={Force.CoreRadius} Min={0.08} Max={Math.max(0.2, Force.Radius * 0.95)} Step={0.05} Unit="m" Decimals={2} OnChange={(V) => UpdateForce({ CoreRadius: V })} />
            <ScalarRow Label="Falloff Exp" Value={Force.FalloffExponent} Min={0.25} Max={4.0} Step={0.05} Decimals={2} OnChange={(V) => UpdateForce({ FalloffExponent: V })} />
            <ScalarRow Label="Swirl / Curl" Value={Force.SwirlRatio} Min={-2.5} Max={2.5} Step={0.05} Decimals={2} OnChange={(V) => UpdateForce({ SwirlRatio: V })} />
            <ScalarRow Label="Azimuth Yaw" Value={Force.YawDeg} Min={-180} Max={180} Step={1} Unit="°" Decimals={0} OnChange={(V) => UpdateForce({ YawDeg: V })} />
            {Meta.Domain === "TurbulenceField" && (
              <>
                <ScalarRow Label="Eddy Scale" Value={Force.TurbulenceScale} Min={0.2} Max={12.0} Step={0.05} Unit="m" Decimals={2} OnChange={(V) => UpdateForce({ TurbulenceScale: V })} />
                <ScalarRow Label="Octaves" Value={Force.Octaves} Min={1} Max={5} Step={1} Decimals={0} OnChange={(V) => UpdateForce({ Octaves: Math.round(V) })} />
              </>
            )}
            <ScalarRow Label="Pulse / Freq" Value={Force.Frequency} Min={0.05} Max={3.0} Step={0.02} Unit="Hz" Decimals={2} OnChange={(V) => UpdateForce({ Frequency: V })} />

            <label className="field compact">
              <span>Reach Shape</span>
              <select value={Force.Reach} onChange={(Ev) => UpdateForce({ Reach: Ev.target.value })}>
                {ReachEnvelopes.map((R) => (
                  <option key={R} value={R}>{R}</option>
                ))}
              </select>
            </label>
            <label className="field compact">
              <span>Attenuation</span>
              <select value={Force.Attenuation} onChange={(Ev) => UpdateForce({ Attenuation: Ev.target.value })}>
                {AttenuationCurves.map((C) => (
                  <option key={C} value={C}>{C}</option>
                ))}
              </select>
            </label>
            <label className="field compact">
              <span>Duration</span>
              <select value={Force.Duration} onChange={(Ev) => UpdateForce({ Duration: Ev.target.value })}>
                {DurationModes.map((D) => (
                  <option key={D} value={D}>{D}</option>
                ))}
              </select>
            </label>

            <svg viewBox="0 0 240 64" width="100%" height="58" style={{ background: "rgba(0,0,0,0.22)", borderRadius: 6 }}>
              <line x1="8" y1="58" x2="232" y2="58" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <path d={AttenuationPath} fill="none" stroke={Meta.Color} strokeWidth="2" />
              <text x="12" y="14" fill="rgba(255,255,255,0.55)" fontSize="9.5">f(0)=1.0</text>
              <text x="190" y="54" fill="rgba(255,255,255,0.55)" fontSize="9.5">r = R</text>
            </svg>
          </div>

          {/* Motion Path */}
          <div className="property-card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <strong style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.85 }}>
              Motion Trajectory
            </strong>
            <label className="field compact">
              <span>Topology</span>
              <select value={Force.MotionTopology} onChange={(Ev) => UpdateForce({ MotionTopology: Ev.target.value })}>
                {MotionTopologies.map((M) => (
                  <option key={M} value={M}>{M}</option>
                ))}
              </select>
            </label>
            {Force.MotionTopology !== "Static" && (
              <>
                <ScalarRow Label="Amplitude" Value={Force.MotionAmplitude} Min={0.1} Max={8.0} Step={0.05} Unit="m" Decimals={2} OnChange={(V) => UpdateForce({ MotionAmplitude: V })} />
                <ScalarRow Label="Orbit Rate" Value={Force.MotionSpeedHz} Min={0.05} Max={2.0} Step={0.02} Unit="Hz" Decimals={2} OnChange={(V) => UpdateForce({ MotionSpeedHz: V })} />
              </>
            )}
          </div>

          {/* Preset Actions */}
          <div className="property-card" style={{ padding: "10px 12px", display: "flex", gap: 8 }}>
            {typeof OnSavePreset === "function" && (
              <button
                type="button"
                style={{ flex: 1, padding: "7px 10px", borderRadius: 6, cursor: "pointer" }}
                onClick={() => OnSavePreset(Subject?.Name || Meta.Name, Force, { Position, Rotation })}
              >
                Save to Asset Browser
              </button>
            )}
            <button
              type="button"
              style={{ flex: 1, padding: "7px 10px", borderRadius: 6, cursor: "pointer" }}
              onClick={DownloadForceModelFile}
            >
              Export .ForceModel
            </button>
          </div>
        </>
      )}

      {ActiveTab === "Formula" && (
        <div className="property-card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
              VectorFieldLang Symbolic Kernel
            </strong>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={Force.FormulaEnabled}
                onChange={(Ev) => UpdateForce({ FormulaEnabled: Ev.target.checked })}
              />
              Override Law
            </label>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {FORMULA_PRESETS.map((Preset) => (
              <button
                key={Preset.Id}
                type="button"
                onClick={() => UpdateForce({ FormulaEnabled: true, FormulaCode: Preset.Code })}
                style={{
                  padding: "4px 8px",
                  fontSize: 10.5,
                  borderRadius: 5,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--ws-text, #f0f0f0)",
                  cursor: "pointer",
                }}
              >
                {Preset.Name}
              </button>
            ))}
          </div>

          <textarea
            aria-label="VectorFieldLang Formula Source"
            rows={6}
            value={Force.FormulaCode}
            onChange={(Ev) => UpdateForce({ FormulaEnabled: true, FormulaCode: Ev.target.value })}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 8,
              borderRadius: 6,
              background: "rgba(0,0,0,0.35)",
              color: "#e6edf3",
              border: CompiledFormula?.Ok ? "1px solid rgba(58,214,156,0.45)" : "1px solid rgba(242,121,121,0.65)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11.5,
              lineHeight: 1.45,
            }}
          />

          <div
            style={{
              padding: "6px 8px",
              borderRadius: 6,
              fontSize: 11,
              background: CompiledFormula?.Ok ? "rgba(58,214,156,0.12)" : "rgba(242,121,121,0.15)",
              color: CompiledFormula?.Ok ? "#7ef2c2" : "#ff9b9b",
            }}
          >
            {CompiledFormula?.Ok
              ? `Compiled OK · Output channel: ${CompiledFormula.OutputKind || "vec3"}`
              : `Syntax/Type Error: ${CompiledFormula?.Error || "Invalid expression"}`}
          </div>

          {CompiledFormula?.Ok && CompiledFormula.GlslBody && (
            <details>
              <summary style={{ fontSize: 11, cursor: "pointer", opacity: 0.8 }}>
                Generated GPU Kernel Body
              </summary>
              <pre
                style={{
                  marginTop: 6,
                  padding: 8,
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.3)",
                  fontSize: 10.5,
                  overflowX: "auto",
                }}
              >
                {CompiledFormula.GlslBody}
              </pre>
            </details>
          )}
        </div>
      )}

      {ActiveTab === "Layers" && (
        <div className="property-card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <strong style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
            3D Viewport ForceOverlay Layers
          </strong>
          {[
            ["Enabled", "Master ForceOverlay Pass"],
            ["ShowEnvelopes", "Reach & Core Wireframe Envelopes"],
            ["ShowVelocityArrows", "3D Lattice Velocity Arrows"],
            ["ShowStreamlines", "RK4 Advected Streamlines"],
            ["ShowMotionPaths", "Motion Trajectory Curves"],
          ].map(([Key, Label]) => (
            <label
              key={Key}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, cursor: "pointer" }}
            >
              <span>{Label}</span>
              <input
                type="checkbox"
                checked={Boolean(Overlay[Key])}
                onChange={(Ev) => UpdateOverlay({ [Key]: Ev.target.checked })}
              />
            </label>
          ))}

          <ScalarRow
            Label="Arrow Density"
            Value={Overlay.ArrowDensity}
            Min={2}
            Max={5}
            Step={1}
            Decimals={0}
            OnChange={(V) => UpdateOverlay({ ArrowDensity: Math.round(V) })}
          />
          <ScalarRow
            Label="Vector Scale"
            Value={Overlay.VectorScale}
            Min={0.08}
            Max={0.65}
            Step={0.02}
            Unit="×"
            Decimals={2}
            OnChange={(V) => UpdateOverlay({ VectorScale: V })}
          />
          <label className="field compact">
            <span>Color Ramp</span>
            <select
              value={Overlay.ColorRamp}
              onChange={(Ev) => UpdateOverlay({ ColorRamp: Ev.target.value })}
            >
              {ColorRampModes.map((Mode) => (
                <option key={Mode} value={Mode}>{Mode}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {ActiveTab === "Cache" && (
        <>
          <div className="property-card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            <strong style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
              4-Tier Spatial Lattice Clipmap
            </strong>
            {[
              ["Tier 0 · Near", "32³ RGBA16F", `${(Force.Radius * 1.0).toFixed(1)} m span`, "256 KiB"],
              ["Tier 1 · Mid", "32³ RGBA16F", `${(Force.Radius * 2.5).toFixed(1)} m span`, "256 KiB"],
              ["Tier 2 · Far", "32³ RGBA16F", `${(Force.Radius * 6.0).toFixed(1)} m span`, "256 KiB"],
              ["Tier 3 · Macro", "32³ RGBA16F", `${(Force.Radius * 16.0).toFixed(1)} m span`, "256 KiB"],
            ].map(([Tier, Res, Span, Mem]) => (
              <div
                key={Tier}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11.2,
                  padding: "4px 6px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <span>{Tier}</span>
                <span style={{ opacity: 0.75 }}>{Res} · {Span}</span>
                <code style={{ color: Meta.Color }}>{Mem}</code>
              </div>
            ))}
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
              Physics Solver Coupling: <strong>Disabled (Authoring & Visualization Only)</strong>
            </div>
          </div>

          <div className="property-card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                SpaceContainer TOML
              </strong>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={CopyToml} style={{ padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>
                  {CopiedToml ? "Copied!" : "Copy"}
                </button>
                <button type="button" onClick={DownloadForceModelFile} style={{ padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>
                  Download
                </button>
              </div>
            </div>
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                padding: 8,
                borderRadius: 6,
                background: "rgba(0,0,0,0.32)",
                fontSize: 10.5,
                lineHeight: 1.4,
              }}
            >
              {TomlText}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
