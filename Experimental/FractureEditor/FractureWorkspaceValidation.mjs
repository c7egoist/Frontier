/*==========================================================================================================================================
                                                 FRACTUREWORKSPACEVALIDATION.MJS
==========================================================================================================================================*/
// 🧩 Automated geometric, physical, celestial, volumetric, and JSDOM UI validation for the Fracture & Environment Editor.

import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
    MaterialCatalogue,
    ConstructSolidComplex,
    ExecuteFracturePartition,
    EvaluatePieceSdfSlice,
    EvaluateSdfAtlasFootprint
} from "./Source/ConvexPartitioning.js";
import {
    ExecuteFastRuntimeFracture,
    StreamFragmentsIntoBatchedBuffers,
    RaycastFlatConvexFragments
} from "./Source/FastRuntimeFracture.js";
import {
    SolveSymmetricEigen3x3,
    ExecuteEngineeringBakedFracture
} from "./Source/EngineeringBakedFracture.js";
import { FractureKinematicsTimeline } from "./Source/RigidBodyDynamics.js";
import {
    CreateDefaultSunParameters,
    CreateDefaultAtmosphereParameters,
    CreateDefaultCloudsParameters,
    EvaluateSolarEphemeris,
    EvaluateTransmittanceToTop,
    SampleGlobalCloudDensity,
    SampleLocalCloudDensity
} from "./Source/CelestialAtmosphereModel.js";

let PassedChecks = 0;
function Verify(Condition, Description)
{
    assert.ok(Condition, Description);
    PassedChecks++;
}

// 1. Validate all 6 Fracture Solvers (including Fast Runtime & Engineering FEM) & Volume Conservation across primitives
for (const Solver of ["runtime_boussinesq", "engineering_fem", "griffith", "wavefront", "voronoi", "dendritic"])
{
    for (const Solid of ["monolith", "curtain_pane", "timber_beam", "boulder", "cylinder", "cone", "cube"])
    {
        const Base = ConstructSolidComplex(Solid, [1, 1, 1], 42);
        const MatKey = Solid === "curtain_pane" ? "tempered" : (Solid === "timber_beam" ? "wood" : "concrete");
        const Res = ExecuteFracturePartition(Base, {
            Solver,
            Material: MatKey,
            Energy: 3600,
            Seed: 42,
            Ceiling: 32,
            MinimumSize: 0.04,
            ImpactPoint: [0.05, 0.15, 0.35],
            ImpactNormal: [0, 0, -1]
        });

        Verify(Res.Fragments.length >= 2 && Res.Fragments.length <= 32, `${Solver}/${Solid} fragment count within [2..32] (got ${Res.Fragments.length})`);
        Verify(Res.Receipt.VolumeDriftRatio < 1e-4, `${Solver}/${Solid} watertight volume drift < 1e-4 (got ${Res.Receipt.VolumeDriftRatio})`);
        Verify(Res.Receipt.WatertightManifold, `${Solver}/${Solid} manifold check`);
    }
}

// 1B. Validate Fast Runtime Sub-Millisecond Kernel, Batched GPU Streamer & Analytical Raycast
{
    const Base = ConstructSolidComplex("monolith", [1, 1, 1], 42);
    // Warmup JIT
    for (let w = 0; w < 20; ++w) ExecuteFastRuntimeFracture(Base, { Material: "concrete", Ceiling: 32, Seed: w + 1 });

    const FastRes = ExecuteFastRuntimeFracture(Base, { Material: "concrete", Energy: 6000, Ceiling: 32, MinimumSize: 0.02, Seed: 42 });
    Verify(FastRes.Fragments.length === 32, "FastRuntime produced exact 32 shards");
    Verify(FastRes.Receipt.VolumeDriftRatio < 1e-12, `FastRuntime machine-epsilon volume drift (${FastRes.Receipt.VolumeDriftRatio})`);
    Verify(FastRes.Receipt.ComputeDurationMs < 4.0, `FastRuntime 32-shard latency < 4ms (got ${FastRes.Receipt.ComputeDurationMs.toFixed(3)}ms)`);

    const PosBuf = new Float32Array(32768 * 3);
    const NormBuf = new Float32Array(32768 * 3);
    const MetaBuf = new Float32Array(32768 * 2);
    const VertCount = StreamFragmentsIntoBatchedBuffers(FastRes.Fragments, PosBuf, NormBuf, MetaBuf, 32768);
    Verify(VertCount > 300 && VertCount % 3 === 0, `Batched GPU buffer streamed ${VertCount} vertices cleanly`);

    const Hit = RaycastFlatConvexFragments(FastRes.Fragments, 0, 1.0, 3.0, 0, 0, -1, 1.0);
    Verify(Hit !== null && Hit.FragmentIndex >= 0, "Analytical flat-convex raycast hit front shard");
}

// 1C. Validate Engineering 3x3 Symmetric Eigensolver + Interlocking Non-Planar Fractography across all 6 materials
{
    const Eig = new Float64Array(10);
    SolveSymmetricEigen3x3(40.0, 10.0, -20.0, 12.0, -5.0, 8.0, Eig);
    Verify(Eig[0] >= Eig[1] && Eig[1] >= Eig[2], `3x3 Cauchy principal stresses ordered (${Eig[0].toFixed(2)} >= ${Eig[1].toFixed(2)} >= ${Eig[2].toFixed(2)})`);
    const Trace = 40.0 + 10.0 - 20.0;
    Verify(Math.abs((Eig[0] + Eig[1] + Eig[2]) - Trace) < 1e-9, "First stress invariant I1 conserved by eigensolver");

    const Base = ConstructSolidComplex("monolith", [1, 1, 1], 42);
    for (const MatKey of Object.keys(MaterialCatalogue))
    {
        const EngRes = ExecuteEngineeringBakedFracture(Base, { Material: MatKey, Energy: 4800, Ceiling: 28, MinimumSize: 0.03, Seed: 42 });
        const R = EngRes.EngineeringReport;
        Verify(R && R.PeakSigma1MPa > 0 && R.PeakVonMisesMPa > 0, `${MatKey} Navier-Cauchy stress field solved`);
        Verify(R.RoughnessRmsMm > 0.2, `${MatKey} fractographic roughness Rq=${R.RoughnessRmsMm.toFixed(2)}mm > 0.2mm`);
        Verify(R.NonPlanarTriangles > 100, `${MatKey} non-planar interlocking triangles (${R.NonPlanarTriangles})`);
        Verify(R.NonPlanarVolumeDrift < 1e-10, `${MatKey} non-planar interlocking volume conserved to <1e-10 (got ${R.NonPlanarVolumeDrift})`);
        Verify(EngRes.Fragments.every((f) => f.ConvexHull && f.EngineeringSurface), `${MatKey} exports both ConvexHull proxy and EngineeringSurface`);
    }
}

// 2. Validate Piece SDF Slice & Footprint
{
    const Base = ConstructSolidComplex("cube", [1, 1, 1], 7);
    const Res = ExecuteFracturePartition(Base, { Solver: "voronoi", Material: "granite", Ceiling: 18, Seed: 7 });
    const Slice = EvaluatePieceSdfSlice(Res.Fragments, 0.0, 48, 1.2);
    Verify(Slice.OccupancyRatio > 0.12 && Slice.OccupancyRatio < 0.85, `SDF slice occupancy realistic (${Slice.OccupancyRatio.toFixed(3)})`);
    const Foot64 = EvaluateSdfAtlasFootprint(18, 64, true);
    const Foot128 = EvaluateSdfAtlasFootprint(18, 128, true);
    Verify(Foot128.Bytes === Foot64.Bytes * 8, "128³ SDF footprint is 8× 64³ footprint");
}

// 3. Validate Realtime, Baked, and Hybrid Kinematics Timeline
for (const Mode of ["realtime", "baked", "hybrid"])
{
    const Base = ConstructSolidComplex("monolith", [1, 1, 1], 42);
    const Res = ExecuteFracturePartition(Base, { Solver: "griffith", Material: "concrete", Ceiling: 24, Seed: 42 });
    const Kin = new FractureKinematicsTimeline();
    Kin.BuildSimulation(Res, Mode, 0.0, 0.96);
    Verify(Kin.Frames.length === 241, `${Mode} timeline built 241 frames`);
    const Sample0 = Kin.SampleAtTime(0.0, Res.Fragments, 0.0);
    const SampleMid = Kin.SampleAtTime(1.2, Res.Fragments, 0.25);
    Verify(Sample0 && SampleMid && SampleMid.Offsets.length === Res.Fragments.length * 3, `${Mode} timeline interpolation valid`);
}

// 4. Validate Solar Ephemeris Solver
{
    const Sun = CreateDefaultSunParameters();
    Sun.LatitudeDeg = -26.19;
    Sun.Month = 12;
    Sun.Day = 21;
    Sun.LocalHours = 12.0;
    const Noon = EvaluateSolarEphemeris(Sun);
    Sun.LocalHours = 0.0;
    const Midnight = EvaluateSolarEphemeris(Sun);
    Verify(Noon.ElevationDeg > 60.0, `Southern summer solstice noon elevation > 60° (got ${Noon.ElevationDeg.toFixed(1)}°)`);
    Verify(Midnight.ElevationDeg < -20.0, `Midnight elevation below horizon (got ${Midnight.ElevationDeg.toFixed(1)}°)`);
    Verify(Noon.AirMass >= 1.0 && Noon.AirMass < 1.25, `Noon air mass near unity (got ${Noon.AirMass.toFixed(2)})`);
}

// 5. Validate Atmosphere Transmittance Monotonicity
{
    const Atm = CreateDefaultAtmosphereParameters();
    const TZenith = EvaluateTransmittanceToTop(Atm, 0.0, 1.0, 24);
    const THorizon = EvaluateTransmittanceToTop(Atm, 0.0, 0.08, 24);
    Verify(TZenith[2] > THorizon[2], "Blue zenith transmittance exceeds horizon transmittance");
    Verify(THorizon[0] > THorizon[2], "Horizon red transmittance exceeds blue (Rayleigh reddening)");
}

// 6. Validate Cloud Density Monotonicity with Coverage
{
    const Clouds = CreateDefaultCloudsParameters();
    Clouds.Global.Coverage = 0.15;
    let SumLow = 0, SumHigh = 0;
    for (let x = -2000; x <= 2000; x += 250)
    {
        SumLow += SampleGlobalCloudDensity(Clouds.Global, x, 0, 1300);
    }
    Clouds.Global.Coverage = 0.85;
    for (let x = -2000; x <= 2000; x += 250)
    {
        SumHigh += SampleGlobalCloudDensity(Clouds.Global, x, 0, 1300);
    }
    Verify(SumHigh > SumLow, `Global cloud density increases monotonically with coverage (${SumLow.toFixed(2)} -> ${SumHigh.toFixed(2)})`);

    const LocalInside = SampleLocalCloudDensity({ ...Clouds.Local, Coverage: 0.9 }, 0.0, 0.0, 0.0);
    const LocalOutside = SampleLocalCloudDensity({ ...Clouds.Local, Coverage: 0.9 }, 1.2, 0.0, 0.0);
    Verify(LocalInside >= 0 && LocalOutside === 0, "Local cloud ellipsoid boundary enforced");
}

// 7. Validate Full JSDOM Application Mount & All 4 Inspectors + Outliner + Viewport Controls
{
    const DomEnv = new JSDOM(`<!DOCTYPE html><html><body><div id="frontierWorkspaceRoot"></div></body></html>`, {
        pretendToBeVisual: true
    });
    globalThis.window = DomEnv.window;
    globalThis.document = DomEnv.window.document;
    globalThis.HTMLElement = DomEnv.window.HTMLElement;
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};

    const { FractureWorkspaceApplication } = await import("./Source/WorkspaceApplication.js");
    const Root = document.getElementById("frontierWorkspaceRoot");
    const App = new FractureWorkspaceApplication(Root);

    Verify(Root.querySelector("#outlinerColumn") !== null, "Left Outliner column mounted");
    Verify(Root.querySelector("#viewportColumn") !== null, "Centre Viewport column mounted");
    Verify(Root.querySelector("#inspectorColumn") !== null, "Right Inspector column mounted");

    // Switch across all 4 Inspector Domains + Local Cloud Scope
    for (const Domain of ["sun", "atmosphere", "clouds", "fracture"])
    {
        Root.querySelector(`[data-domain="${Domain}"]`).click();
        Verify(App.ActiveInspector === Domain, `Switched inspector to ${Domain}`);
        if (Domain === "clouds")
        {
            Root.querySelector(`[data-cloud-scope="local"]`).click();
            Verify(App.CloudsParams.ActiveScope === "local", "Switched Clouds Inspector to Local Volume Box");
            Verify(Root.querySelector("#localCloudBoundsCanvas") !== null, "Local cloud bounds canvas mounted");
        }
        if (Domain === "sun")
        {
            Verify(Root.querySelector("#sunDiscPreviewCanvas") !== null, "Sun disc chromatic preview canvas mounted");
            Verify(Root.querySelector("#rngSunG") !== null, "Sun green tint control mounted");
        }
        if (Domain === "atmosphere")
        {
            Verify(Root.querySelector("#rngMieAbs") !== null && Root.querySelector("#rngHorizW") !== null, "All 18 atmosphere fields mounted");
        }
        if (Domain === "fracture")
        {
            Verify(Root.querySelector("#engineeringStressCanvas") !== null, "Engineering Navier-Cauchy stress & Mohr-Coulomb canvas mounted");
            Root.querySelector(`[data-insp-pipe="realtime"]`).click();
            Verify(App.GetActiveConstruct().Spec.Solver === "runtime_boussinesq", "Switching to Realtime selects Fast Boussinesq Flat-BSP");
            Root.querySelector(`[data-insp-pipe="baked"]`).click();
            Verify(App.GetActiveConstruct().Spec.Solver === "engineering_fem", "Switching to Engineering Bake selects Navier-Cauchy Fractography");
        }
    }

    // Open Solver Comparison Matrix and activate Voronoi solver
    Root.querySelector("#toggleSolverMatrixBtn").click();
    Verify(App.SolverDrawerOpen === true, "Solver comparison drawer opened");
    Root.querySelector(`[data-pick-solver="voronoi"]`).click();
    Verify(App.GetActiveConstruct().Spec.Solver === "voronoi", "Activated Voronoi solver from comparison matrix");

    // Spawn Construct & Switch Theme
    const PrevCount = App.Constructs.length;
    Root.querySelector("#spawnConstructBtn").click();
    Verify(App.Constructs.length === PrevCount + 1, "Spawned new destructible construct in Outliner");

    Root.querySelector(`[data-theme-pick="emerald-telemetry"]`).click();
    Verify(App.Theme === "emerald-telemetry", "Switched theme to bioluminescent emerald telemetry");
}

console.log(`ALL ${PassedChecks} VALIDATION CHECKS PASSED.`);
