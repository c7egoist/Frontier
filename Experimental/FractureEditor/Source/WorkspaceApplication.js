/*==========================================================================================================================================
                                                     WORKSPACEAPPLICATION.JS
==========================================================================================================================================*/
// 🧩 Tri-column Frontier Fracture + Celestial (Sun, Atmosphere, Clouds) interactive workspace application.

import {
    MaterialCatalogue,
    ConstructSolidComplex,
    ExecuteFracturePartition,
    EvaluateSdfAtlasFootprint
} from "./ConvexPartitioning.js";
import { FractureKinematicsTimeline } from "./RigidBodyDynamics.js";
import {
    CreateDefaultSunParameters,
    CreateDefaultAtmosphereParameters,
    CreateDefaultCloudsParameters,
    EvaluateSolarEphemeris
} from "./CelestialAtmosphereModel.js";
import { ViewportRasterizationHost } from "./ViewportRasterization.js";
import {
    DrawGriffithWaveformDiagram,
    DrawPolarAnisotropyRadar,
    DrawPieceSdfSliceCanvas,
    DrawSolarDiurnalArcCanvas,
    DrawObserverWorldMapCanvas,
    DrawAtmosphereLutCanvas,
    DrawAtmosphereDensityCurvesCanvas,
    DrawCloudDensityMaskCanvas,
    DrawCloudAltitudeSlabCanvas,
    DrawSunDiscPreviewCanvas,
    DrawLocalCloudBoundsCanvas,
    DrawEngineeringStressSliceCanvas
} from "./InfographicDiagrams.js";

//------------------------------------------------------------------------------------------------------------------------
//                                                    VECTOR SVG ICONS
//------------------------------------------------------------------------------------------------------------------------

const SvgIcons = {
    Brand: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 13L13 3M3 8.2L8.2 3M7.8 13L13 7.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    Search: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.8" stroke="currentColor" stroke-width="1.4"/><path d="M10.8 10.8L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    Grip: `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="3" r="1"/><circle cx="7" cy="3" r="1"/><circle cx="3" cy="7" r="1"/><circle cx="7" cy="7" r="1"/><circle cx="3" cy="11" r="1"/><circle cx="7" cy="11" r="1"/></svg>`,
    Check: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    Archive: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3" width="11" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7.5H10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    Sun: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5V3.2M8 12.8V14.5M1.5 8H3.2M12.8 8H14.5M3.4 3.4L4.6 4.6M11.4 11.4L12.6 12.6M12.6 3.4L11.4 4.6M4.6 11.4L3.4 12.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    Atmosphere: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="9" r="5" stroke="currentColor" stroke-width="1.4"/><path d="M2 9.5C4 6.5 12 6.5 14 9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    Clouds: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4.8 12.2H11.5C13 12.2 14.2 11 14.2 9.5C14.2 8.1 13.1 7 11.8 6.9C11.3 4.8 9.5 3.4 7.3 3.4C4.8 3.4 2.9 5.3 2.9 7.8C2.1 8.2 1.7 9 1.7 9.9C1.7 11.2 3.1 12.2 4.8 12.2Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/></svg>`,
    Fracture: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 6.5L7.5 8.2L5.8 13.6M7.5 8.2L13.6 5.2M7.5 8.2L11.5 13.5" stroke="currentColor" stroke-width="1.3"/></svg>`,
    Strike: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8.8 1.8L3.6 8.8H7.8L7.2 14.2L12.4 7.2H8.2L8.8 1.8Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
    Orbit: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/><ellipse cx="8" cy="8" rx="5.5" ry="2.3" stroke="currentColor" stroke-width="1.2"/></svg>`,
    Gizmo: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M8 2V4.5M8 11.5V14M2 8H4.5M11.5 8H14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    Reset: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3.2 8A4.8 4.8 0 1 1 4.6 11.4M3.2 4.5V8H6.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    Play: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3.2L12.8 8L4.5 12.8V3.2Z"/></svg>`,
    Pause: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3.2" width="2.8" height="9.6" rx="0.8"/><rect x="9.2" y="3.2" width="2.8" height="9.6" rx="0.8"/></svg>`,
    Eye: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.8 8C3.2 5 5.4 3.6 8 3.6C10.6 3.6 12.8 5 14.2 8C12.8 11 10.6 12.4 8 12.4C5.4 12.4 3.2 11 1.8 8Z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.3"/></svg>`
};

//------------------------------------------------------------------------------------------------------------------------
//                                           INITIAL SCENE DIRECTORY RECORDS
//------------------------------------------------------------------------------------------------------------------------

function CreateInitialConstructEntries()
{
    return [
        {
            Id: "construct-monolith",
            Title: "Monolith Pillar",
            SolidCategory: "monolith",
            Scale: [1, 1, 1],
            Pipeline: "baked",
            BakedResident: true,
            BakedSignature: "",
            Spec: {
                Solver: "engineering_fem",
                Material: "concrete",
                Energy: 4600,
                Seed: 42,
                Ceiling: 32,
                MinimumSize: 0.04,
                GrainAngleDeg: 0,
                BondStrengthScale: 1.0,
                PieceSdf: true,
                SdfResolution: 64,
                ImpactPoint: [0.05, 0.24, 0.48],
                ImpactNormal: [0, 0, -1]
            }
        },
        {
            Id: "construct-tempered",
            Title: "Tempered Safety Glazing",
            SolidCategory: "curtain_pane",
            Scale: [1, 1, 1],
            Pipeline: "realtime",
            BakedResident: false,
            BakedSignature: "",
            Spec: {
                Solver: "runtime_boussinesq",
                Material: "tempered",
                Energy: 1200,
                Seed: 108,
                Ceiling: 64,
                MinimumSize: 0.032,
                GrainAngleDeg: 0,
                BondStrengthScale: 0.5,
                PieceSdf: false,
                SdfResolution: 64,
                ImpactPoint: [0.18, 0.10, 0.032],
                ImpactNormal: [0, 0, -1]
            }
        },
        {
            Id: "construct-float-glass",
            Title: "Annealed Float Pane",
            SolidCategory: "curtain_pane",
            Scale: [1, 1, 1],
            Pipeline: "realtime",
            BakedResident: false,
            BakedSignature: "",
            Spec: {
                Solver: "wavefront",
                Material: "glass",
                Energy: 1850,
                Seed: 77,
                Ceiling: 44,
                MinimumSize: 0.035,
                GrainAngleDeg: 0,
                BondStrengthScale: 0.7,
                PieceSdf: false,
                SdfResolution: 64,
                ImpactPoint: [-0.12, 0.08, 0.032],
                ImpactNormal: [0, 0, -1]
            }
        },
        {
            Id: "construct-granite",
            Title: "Bedded Granite Erratic",
            SolidCategory: "boulder",
            Scale: [1, 1, 1],
            Pipeline: "baked",
            BakedResident: true,
            BakedSignature: "",
            Spec: {
                Solver: "engineering_fem",
                Material: "granite",
                Energy: 5200,
                Seed: 314,
                Ceiling: 32,
                MinimumSize: 0.05,
                GrainAngleDeg: 18,
                BondStrengthScale: 1.15,
                PieceSdf: true,
                SdfResolution: 64,
                ImpactPoint: [0.15, 0.22, 0.55],
                ImpactNormal: [-0.15, -0.1, -0.98]
            }
        },
        {
            Id: "construct-spruce",
            Title: "Orthotropic Timber Beam",
            SolidCategory: "timber_beam",
            Scale: [1, 1, 1],
            Pipeline: "realtime",
            BakedResident: false,
            BakedSignature: "",
            Spec: {
                Solver: "runtime_boussinesq",
                Material: "wood",
                Energy: 2600,
                Seed: 64,
                Ceiling: 30,
                MinimumSize: 0.038,
                GrainAngleDeg: 0,
                BondStrengthScale: 0.95,
                PieceSdf: false,
                SdfResolution: 32,
                ImpactPoint: [0.0, 0.14, 0.14],
                ImpactNormal: [0, -0.5, -0.86]
            }
        },
        {
            Id: "construct-voronoi",
            Title: "Voronoi Vault Cube",
            SolidCategory: "cube",
            Scale: [1, 1, 1],
            Pipeline: "baked",
            BakedResident: true,
            BakedSignature: "",
            Spec: {
                Solver: "voronoi",
                Material: "concrete",
                Energy: 3900,
                Seed: 91,
                Ceiling: 52,
                MinimumSize: 0.05,
                GrainAngleDeg: 0,
                BondStrengthScale: 1.05,
                PieceSdf: true,
                SdfResolution: 128,
                ImpactPoint: [0.22, 0.16, 0.66],
                ImpactNormal: [0, 0, -1]
            }
        },
        {
            Id: "construct-polymer",
            Title: "Ductile ABS Containment",
            SolidCategory: "cylinder",
            Scale: [1, 1, 1],
            Pipeline: "realtime",
            BakedResident: false,
            BakedSignature: "",
            Spec: {
                Solver: "griffith",
                Material: "plastic",
                Energy: 4100,
                Seed: 23,
                Ceiling: 16,
                MinimumSize: 0.075,
                GrainAngleDeg: 0,
                BondStrengthScale: 1.3,
                PieceSdf: false,
                SdfResolution: 32,
                ImpactPoint: [0.1, 0.25, 0.60],
                ImpactNormal: [0, 0, -1]
            }
        }
    ];
}

function ComputeRecipeSignature(Entry)
{
    const { PieceSdf, SdfResolution, ...Recipe } = Entry.Spec;
    return JSON.stringify({ Solid: Entry.SolidCategory, Scale: Entry.Scale, Recipe });
}

function SplitFormatNumber(Val, Decimals = 1)
{
    const Fixed = Number(Val).toFixed(Decimals);
    if (Decimals === 0) return { main: Number(Fixed).toLocaleString("en-US"), sub: "" };
    const [IntPart, DecPart] = Fixed.split(".");
    return { main: Number(IntPart).toLocaleString("en-US") + ".", sub: DecPart };
}

//------------------------------------------------------------------------------------------------------------------------
//                                              MAIN WORKSPACE APPLICATION
//------------------------------------------------------------------------------------------------------------------------

export class FractureWorkspaceApplication
{
    constructor(RootElement)
    {
        this.Root = RootElement;
        this.Theme = "solar-gold";
        this.OutlinerFilter = "all"; // all | constructs | celestial | baked
        this.SearchQuery = "";
        this.ActiveInspector = "fracture"; // fracture | sun | atmosphere | clouds
        this.SelectedDirectoryId = "construct-monolith";
        this.ActiveConstructId = "construct-monolith";
        this.SolverDrawerOpen = false;
        this.SpawnCounter = 1;

        this.Constructs = CreateInitialConstructEntries();
        for (const Entry of this.Constructs)
        {
            if (Entry.BakedResident) Entry.BakedSignature = ComputeRecipeSignature(Entry);
        }

        this.SunParams = CreateDefaultSunParameters();
        this.AtmosParams = CreateDefaultAtmosphereParameters();
        this.CloudsParams = CreateDefaultCloudsParameters();
        this.SolarSolved = EvaluateSolarEphemeris(this.SunParams);
        this.AtmosParams.BakedSunDirection = [...this.SolarSolved.Direction];

        this.Timeline = new FractureKinematicsTimeline();
        this.Partition = null;

        this.ConstructDomSkeleton();
        this.Viewport = new ViewportRasterizationHost(this.Dom.ViewportCanvasMount, {
            OnViewportStrike: (ObjPt, NormVec, AutoPlay) => this.HandleViewportImpact(ObjPt, NormVec, AutoPlay),
            OnHoverFragment: (Idx) => this.UpdateHoverBadge(Idx),
            OnSelectFragment: (Idx) => this.HandleSelectFragment(Idx)
        });

        this.RecomputeActivePartition(false);
        this.Timeline.ActiveTime = 0.28; // Show dynamic crack separation right on load!
        this.Timeline.ExplodeAmount = 0.08;
        this.SyncViewportSample();
        this.RenderOutliner();
        this.RenderInspector();
        this.RenderViewportHud();

        window.addEventListener("resize", () =>
        {
            this.Viewport.Resize();
            this.RedrawActiveInfographics();
        });
        this.Viewport.Resize();
        this.StartAnimationLoop();
    }

    GetActiveConstruct()
    {
        return this.Constructs.find((c) => c.Id === this.ActiveConstructId) || this.Constructs[0];
    }

    GetAccentHex()
    {
        if (this.Theme === "emerald-telemetry") return "#38B28B";
        if (this.Theme === "sage-plexus") return "#C8DF52";
        if (this.Theme === "monochrome-ops") return "#F3F5F7";
        return "#EFE838";
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                                DOM SKELETON
    //--------------------------------------------------------------------------------------------------------------------

    ConstructDomSkeleton()
    {
        this.Root.innerHTML = `
        <div class="workspace-host" id="workspaceHost" data-theme="${this.Theme}">
            <!-- LEFT: SCENE DIRECTORY (OUTLINER) -->
            <aside class="dock-column" id="outlinerColumn" aria-label="Scene Directory Outliner">
                <div class="column-header">
                    <div class="brand-row">
                        <div class="brand-cluster">
                            <div class="brand-mark">${SvgIcons.Brand}</div>
                            <div>
                                <div class="brand-title">Frontier Fracture</div>
                                <div class="brand-sub">SceneDirectory · Telemetry v2</div>
                            </div>
                        </div>
                        <span class="entry-pill-tag" id="fpsBadge">60 Hz</span>
                    </div>
                    <div class="search-capsule">
                        <span style="color:var(--text-muted);display:flex">${SvgIcons.Search}</span>
                        <input type="text" id="outlinerSearchInput" placeholder="Filter SceneDirectory..." autocomplete="off" />
                    </div>
                    <div class="pill-strip" id="outlinerFilterPills">
                        <button class="pill-btn subtle-active" data-filter="all">All</button>
                        <button class="pill-btn" data-filter="constructs">Solids</button>
                        <button class="pill-btn" data-filter="celestial">Sky</button>
                        <button class="pill-btn" data-filter="baked">Baked</button>
                    </div>
                </div>
                <div class="scroll-stack" id="outlinerScrollStack"></div>
                <div class="outliner-footer">
                    <button class="sage-action-pill" id="spawnConstructBtn" title="Spawn new destructible solid">
                        <span>+ Spawn Construct</span>
                        <span>▾</span>
                    </button>
                    <div class="theme-dots" title="Switch SourceImages Theme Palette">
                        <div class="theme-swatch active" data-theme-pick="solar-gold" style="background:#EFE838" title="Solar Gold X-Ray"></div>
                        <div class="theme-swatch" data-theme-pick="emerald-telemetry" style="background:#38B28B" title="Bioluminescent Emerald"></div>
                        <div class="theme-swatch" data-theme-pick="sage-plexus" style="background:#C8DF52" title="Sage Plexus"></div>
                        <div class="theme-swatch" data-theme-pick="monochrome-ops" style="background:#F3F5F7" title="Monochrome Ops"></div>
                    </div>
                </div>
            </aside>

            <!-- CENTRE: 3D REALTIME + BAKED VIEWPORT -->
            <main class="viewport-column" id="viewportColumn" aria-label="3D Fracture and Celestial Viewport">
                <div class="viewport-canvas-mount" id="viewportCanvasMount"></div>

                <!-- Top Floating Pill Islands -->
                <div class="viewport-hud-top">
                    <div class="hud-pill-island" id="pipelinePillBar">
                        <button class="pill-btn" data-pipeline="realtime">Realtime</button>
                        <button class="pill-btn" data-pipeline="baked">Baked + SDF</button>
                        <button class="pill-btn active" data-pipeline="hybrid">Hybrid Bonds</button>
                        <button class="pill-btn" id="toggleSolverMatrixBtn">Compare Solvers</button>
                    </div>
                    <div class="hud-pill-island" id="lensPillBar">
                        <button class="pill-btn active" data-lens="pbr">PBR Surface</button>
                        <button class="pill-btn" data-lens="xray">X-Ray Core</button>
                        <button class="pill-btn" data-lens="telemetry">Telemetry Scan</button>
                        <button class="pill-btn" data-lens="plexus">Bond Plexus</button>
                        <button class="pill-btn" data-lens="sdf">SDF Slice</button>
                    </div>
                </div>

                <!-- Left 2x2 Rounded Square Tool Cluster -->
                <div class="tool-quad-cluster" id="viewportToolCluster">
                    <button class="quad-tool-btn active" data-tool="strike" title="Click Solid to Strike & Shatter in Realtime">${SvgIcons.Strike}</button>
                    <button class="quad-tool-btn" data-tool="orbit" title="Inspect & Select Individual Fragments">${SvgIcons.Orbit}</button>
                    <button class="quad-tool-btn" data-tool="gizmo" title="Place Impact Locus Without Auto-Play">${SvgIcons.Gizmo}</button>
                    <button class="quad-tool-btn" id="reassembleQuickBtn" title="Reassemble Intact Solid & Reset Camera">${SvgIcons.Reset}</button>
                </div>

                <!-- Screen-Projected Impact Reticle Overlay -->
                <div class="reticle-hud" id="impactReticleHud">
                    <div class="reticle-corner tl"></div>
                    <div class="reticle-corner tr"></div>
                    <div class="reticle-corner bl"></div>
                    <div class="reticle-corner br"></div>
                    <div class="reticle-callout-pill" id="reticleCalloutText"></div>
                    <button class="reticle-center-action" id="reticleStrikeBtn">Strike Locus</button>
                </div>

                <!-- Bottom-Left Dual Integrity Sector Rings -->
                <div class="viewport-integrity-cluster" id="viewportIntegrityCluster"></div>

                <!-- Bottom-Right Hover Fragment Callout -->
                <div class="hover-fragment-badge" id="hoverFragmentBadge"></div>

                <!-- Solver Comparison Matrix Overlay Drawer -->
                <section class="comparison-drawer" id="solverComparisonDrawer" aria-label="Fracture Solver Comparison"></section>

                <!-- Bottom Timeline & Bullet-Time Dock -->
                <div class="viewport-timeline-dock">
                    <div class="timeline-controls-row">
                        <div class="transport-group">
                            <button class="circle-icon-btn primary-strike" id="timelineStrikeBtn">${SvgIcons.Strike} <span>Strike</span></button>
                            <button class="circle-icon-btn" id="timelinePlayBtn" title="Play / Pause Fracture Timeline">${SvgIcons.Play}</button>
                            <button class="circle-icon-btn" id="timelineResetBtn" title="Reassemble to t = 0.00s">${SvgIcons.Reset}</button>
                            <span style="font-size:11px;color:var(--text-secondary);margin-left:4px" id="timelineClockReadout">0.28s / 4.00s</span>
                        </div>
                        <div class="speed-chip-group" id="speedChipGroup">
                            <button class="speed-chip" data-speed="0.1">0.1×</button>
                            <button class="speed-chip" data-speed="0.25">0.25×</button>
                            <button class="speed-chip" data-speed="0.5">0.5×</button>
                            <button class="speed-chip active" data-speed="1">1.0×</button>
                        </div>
                        <div class="explode-inline">
                            <span>Explode</span>
                            <input type="range" class="editorial-range" id="explodeRangeInput" min="0" max="1" step="0.01" value="0.08" style="width:88px" />
                            <button class="circle-icon-btn" id="zoomInBtn" title="Zoom In" style="width:25px;height:25px">+</button>
                            <button class="circle-icon-btn" id="zoomOutBtn" title="Zoom Out" style="width:25px;height:25px">−</button>
                        </div>
                    </div>
                    <div class="timeline-scrubber-track" id="timelineScrubberTrack">
                        <div class="timeline-clip-pill" style="flex:0.8">① Nucleation</div>
                        <div class="timeline-clip-pill" style="flex:1.1">② Crack Wavefront</div>
                        <div class="timeline-clip-pill" style="flex:1.6">③ Ballistic Ejection</div>
                        <div class="timeline-clip-pill" style="flex:2.2">④ Contact Settle</div>
                        <div class="timeline-playhead" id="timelinePlayhead" style="left:7%"></div>
                    </div>
                </div>
            </main>

            <!-- RIGHT: INFOGRAPHIC INSPECTOR -->
            <aside class="dock-column" id="inspectorColumn" aria-label="Infographic Property Inspector">
                <div class="column-header">
                    <div class="brand-row">
                        <div>
                            <div class="brand-title" id="inspectorHeaderTitle">Fracture Inspector</div>
                            <div class="brand-sub" id="inspectorHeaderSubtitle">Realtime + Baked Convex Partitioning</div>
                        </div>
                        <span class="delta-pill live" id="inspectorStatusChip">Manifold</span>
                    </div>
                    <div class="pill-strip" id="inspectorDomainTabs">
                        <button class="pill-btn active" data-domain="fracture">Fracture</button>
                        <button class="pill-btn" data-domain="sun">Sun</button>
                        <button class="pill-btn" data-domain="atmosphere">Atmosphere</button>
                        <button class="pill-btn" data-domain="clouds">Clouds</button>
                    </div>
                </div>
                <div class="scroll-stack" id="inspectorScrollStack"></div>
            </aside>
        </div>
        `;

        this.Dom = {
            Host: this.Root.querySelector("#workspaceHost"),
            OutlinerStack: this.Root.querySelector("#outlinerScrollStack"),
            OutlinerSearch: this.Root.querySelector("#outlinerSearchInput"),
            OutlinerFilters: this.Root.querySelector("#outlinerFilterPills"),
            SpawnBtn: this.Root.querySelector("#spawnConstructBtn"),
            ViewportCanvasMount: this.Root.querySelector("#viewportCanvasMount"),
            PipelineBar: this.Root.querySelector("#pipelinePillBar"),
            LensBar: this.Root.querySelector("#lensPillBar"),
            ToolCluster: this.Root.querySelector("#viewportToolCluster"),
            ReticleHud: this.Root.querySelector("#impactReticleHud"),
            ReticleText: this.Root.querySelector("#reticleCalloutText"),
            ReticleStrikeBtn: this.Root.querySelector("#reticleStrikeBtn"),
            IntegrityCluster: this.Root.querySelector("#viewportIntegrityCluster"),
            HoverBadge: this.Root.querySelector("#hoverFragmentBadge"),
            SolverDrawer: this.Root.querySelector("#solverComparisonDrawer"),
            TimelineStrikeBtn: this.Root.querySelector("#timelineStrikeBtn"),
            TimelinePlayBtn: this.Root.querySelector("#timelinePlayBtn"),
            TimelineResetBtn: this.Root.querySelector("#timelineResetBtn"),
            TimelineClock: this.Root.querySelector("#timelineClockReadout"),
            TimelineTrack: this.Root.querySelector("#timelineScrubberTrack"),
            TimelinePlayhead: this.Root.querySelector("#timelinePlayhead"),
            ExplodeRange: this.Root.querySelector("#explodeRangeInput"),
            InspectorTitle: this.Root.querySelector("#inspectorHeaderTitle"),
            InspectorSubtitle: this.Root.querySelector("#inspectorHeaderSubtitle"),
            InspectorStatus: this.Root.querySelector("#inspectorStatusChip"),
            InspectorTabs: this.Root.querySelector("#inspectorDomainTabs"),
            InspectorStack: this.Root.querySelector("#inspectorScrollStack")
        };

        this.BindChromeEvents();
    }

    BindChromeEvents()
    {
        // Outliner search & filter pills
        this.Dom.OutlinerSearch.addEventListener("input", (e) =>
        {
            this.SearchQuery = e.target.value.trim().toLowerCase();
            this.RenderOutliner();
        });

        this.Dom.OutlinerFilters.addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-filter]");
            if (!btn) return;
            this.OutlinerFilter = btn.dataset.filter;
            this.Dom.OutlinerFilters.querySelectorAll(".pill-btn").forEach((b) => b.classList.toggle("subtle-active", b === btn));
            this.RenderOutliner();
        });

        // Spawn new construct solid
        this.Dom.SpawnBtn.addEventListener("click", () =>
        {
            const Shapes = [
                { cat: "cube", mat: "concrete", title: "Calibration Block" },
                { cat: "curtain_pane", mat: "tempered", title: "Tempered Lite" },
                { cat: "boulder", mat: "granite", title: "Basalt Core" },
                { cat: "cone", mat: "glass", title: "Ballistic Spire" },
                { cat: "timber_beam", mat: "wood", title: "Spruce Joist" }
            ];
            const Pick = Shapes[this.SpawnCounter % Shapes.length];
            const NewId = `construct-spawn-${++this.SpawnCounter}`;
            this.Constructs.unshift({
                Id: NewId,
                Title: `${Pick.title} #${this.SpawnCounter}`,
                SolidCategory: Pick.cat,
                Scale: [1, 1, 1],
                Pipeline: "realtime",
                BakedResident: false,
                BakedSignature: "",
                Spec: {
                    Solver: "griffith",
                    Material: Pick.mat,
                    Energy: 2800,
                    Seed: 100 + this.SpawnCounter * 13,
                    Ceiling: 42,
                    MinimumSize: 0.045,
                    GrainAngleDeg: 0,
                    BondStrengthScale: 1.0,
                    PieceSdf: false,
                    SdfResolution: 64,
                    ImpactPoint: [0.08, 0.2, 0.45],
                    ImpactNormal: [0, 0, -1]
                }
            });
            this.SelectConstruct(NewId);
        });

        // Theme palette dots
        this.Root.querySelectorAll("[data-theme-pick]").forEach((sw) =>
        {
            sw.addEventListener("click", () =>
            {
                this.Theme = sw.dataset.themePick;
                this.Dom.Host.setAttribute("data-theme", this.Theme);
                this.Root.querySelectorAll("[data-theme-pick]").forEach((el) => el.classList.toggle("active", el === sw));
                this.Viewport.SetAccentColor(this.GetAccentHex());
                this.RedrawActiveInfographics();
            });
        });

        // Pipeline pill bar + Solver Comparison Matrix toggle
        this.Dom.PipelineBar.addEventListener("click", (e) =>
        {
            if (e.target.closest("#toggleSolverMatrixBtn"))
            {
                this.SolverDrawerOpen = !this.SolverDrawerOpen;
                this.RenderSolverComparisonDrawer();
                return;
            }
            const btn = e.target.closest("[data-pipeline]");
            if (!btn) return;
            const Entry = this.GetActiveConstruct();
            Entry.Pipeline = btn.dataset.pipeline;
            if (Entry.Pipeline === "realtime")
            {
                Entry.Spec.Solver = "runtime_boussinesq";
            }
            else if (Entry.Spec.Solver === "runtime_boussinesq")
            {
                Entry.Spec.Solver = "engineering_fem";
            }
            this.SyncTopPipelineBar();
            this.RecomputeActivePartition(Entry.Pipeline === "baked");
            this.RenderOutliner();
            if (this.ActiveInspector === "fracture") this.RenderInspector();
        });

        // Viewport shading lenses
        this.Dom.LensBar.addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-lens]");
            if (!btn) return;
            const Lens = btn.dataset.lens;
            this.Dom.LensBar.querySelectorAll("[data-lens]").forEach((b) => b.classList.toggle("active", b === btn));
            this.Viewport.SetShadingLens(Lens);
        });

        // 2x2 Viewport Tool Cluster
        this.Dom.ToolCluster.addEventListener("click", (e) =>
        {
            if (e.target.closest("#reassembleQuickBtn"))
            {
                this.Timeline.Playing = false;
                this.Timeline.ActiveTime = 0.0;
                this.Timeline.ExplodeAmount = 0.0;
                this.Dom.ExplodeRange.value = "0";
                this.Viewport.ResetCamera();
                this.SyncViewportSample();
                this.UpdatePlayButtonIcon();
                return;
            }
            const btn = e.target.closest("[data-tool]");
            if (!btn) return;
            this.Viewport.ActiveTool = btn.dataset.tool;
            this.Dom.ToolCluster.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", b === btn));
        });

        // Strike & Timeline Transport
        const TriggerStrikePlayback = () =>
        {
            this.Timeline.ExplodeAmount = 0.0;
            this.Dom.ExplodeRange.value = "0";
            this.Timeline.ActiveTime = 0.02;
            this.Timeline.Playing = true;
            this.UpdatePlayButtonIcon();
        };
        this.Dom.TimelineStrikeBtn.addEventListener("click", TriggerStrikePlayback);
        this.Dom.ReticleStrikeBtn.addEventListener("click", TriggerStrikePlayback);

        this.Dom.TimelinePlayBtn.addEventListener("click", () =>
        {
            if (this.Timeline.ActiveTime >= this.Timeline.DurationSeconds - 0.03)
            {
                this.Timeline.ActiveTime = 0.0;
            }
            this.Timeline.Playing = !this.Timeline.Playing;
            this.UpdatePlayButtonIcon();
        });

        this.Dom.TimelineResetBtn.addEventListener("click", () =>
        {
            this.Timeline.Playing = false;
            this.Timeline.ActiveTime = 0.0;
            this.Timeline.ExplodeAmount = 0.0;
            this.Dom.ExplodeRange.value = "0";
            this.SyncViewportSample();
            this.UpdatePlayButtonIcon();
        });

        this.Root.querySelector("#speedChipGroup").addEventListener("click", (e) =>
        {
            const chip = e.target.closest("[data-speed]");
            if (!chip) return;
            this.Timeline.PlaybackRate = Number(chip.dataset.speed);
            this.Root.querySelectorAll("[data-speed]").forEach((c) => c.classList.toggle("active", c === chip));
        });

        this.Dom.ExplodeRange.addEventListener("input", (e) =>
        {
            this.Timeline.ExplodeAmount = Number(e.target.value);
            this.SyncViewportSample();
        });

        this.Root.querySelector("#zoomInBtn").addEventListener("click", () => this.Viewport.ZoomBy(0.84));
        this.Root.querySelector("#zoomOutBtn").addEventListener("click", () => this.Viewport.ZoomBy(1.18));

        // Interactive Timeline Scrubber Drag
        let Scrubbing = false;
        const ScrubAtEvent = (ev) =>
        {
            const Rect = this.Dom.TimelineTrack.getBoundingClientRect();
            const u = Math.max(0, Math.min(1, (ev.clientX - Rect.left) / Math.max(1, Rect.width)));
            this.Timeline.Playing = false;
            this.Timeline.ActiveTime = u * this.Timeline.DurationSeconds;
            this.UpdatePlayButtonIcon();
            this.SyncViewportSample();
        };
        this.Dom.TimelineTrack.addEventListener("pointerdown", (ev) => { Scrubbing = true; ScrubAtEvent(ev); });
        window.addEventListener("pointermove", (ev) => { if (Scrubbing) ScrubAtEvent(ev); });
        window.addEventListener("pointerup", () => { Scrubbing = false; });

        // Inspector 4-Domain Pill Tabs
        this.Dom.InspectorTabs.addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-domain]");
            if (!btn) return;
            this.SwitchInspectorDomain(btn.dataset.domain);
        });
    }

    SwitchInspectorDomain(DomainName)
    {
        this.ActiveInspector = DomainName;
        this.Dom.InspectorTabs.querySelectorAll("[data-domain]").forEach((b) =>
            b.classList.toggle("active", b.dataset.domain === DomainName)
        );
        if (DomainName === "sun") this.SelectedDirectoryId = "celestial-sun";
        else if (DomainName === "atmosphere") this.SelectedDirectoryId = "celestial-atmosphere";
        else if (DomainName === "clouds")
        {
            this.SelectedDirectoryId = this.CloudsParams.ActiveScope === "local" ? "celestial-clouds-local" : "celestial-clouds-global";
        }
        else
        {
            this.SelectedDirectoryId = this.ActiveConstructId;
        }
        this.Viewport.LocalCloudCage.visible = (DomainName === "clouds" && this.CloudsParams.ActiveScope === "local");
        this.RenderOutliner();
        this.RenderInspector();
    }

    SelectConstruct(ConstructId)
    {
        this.ActiveConstructId = ConstructId;
        this.SelectedDirectoryId = ConstructId;
        this.ActiveInspector = "fracture";
        this.Dom.InspectorTabs.querySelectorAll("[data-domain]").forEach((b) =>
            b.classList.toggle("active", b.dataset.domain === "fracture")
        );
        this.Viewport.LocalCloudCage.visible = false;
        this.SyncTopPipelineBar();
        this.RecomputeActivePartition(false);
        this.Timeline.Playing = false;
        this.Timeline.ActiveTime = this.GetActiveConstruct().Pipeline === "baked" ? 0.0 : 0.24;
        this.Timeline.ExplodeAmount = this.GetActiveConstruct().Pipeline === "baked" ? 0.22 : 0.05;
        this.Dom.ExplodeRange.value = String(this.Timeline.ExplodeAmount);
        this.SyncViewportSample();
        this.RenderOutliner();
        this.RenderInspector();
        this.RenderViewportHud();
    }

    SyncTopPipelineBar()
    {
        const Entry = this.GetActiveConstruct();
        this.Dom.PipelineBar.querySelectorAll("[data-pipeline]").forEach((b) =>
            b.classList.toggle("active", b.dataset.pipeline === Entry.Pipeline)
        );
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                          PARTITION & SIMULATION PIPELINE
    //--------------------------------------------------------------------------------------------------------------------

    RecomputeActivePartition(AutoStrikePlay = false)
    {
        const Entry = this.GetActiveConstruct();
        const BaseSolid = ConstructSolidComplex(Entry.SolidCategory, Entry.Scale, Entry.Spec.Seed);
        this.Partition = ExecuteFracturePartition(BaseSolid, Entry.Spec);
        this.Viewport.RebuildPartitionVisuals(this.Partition, Entry.Spec.ImpactPoint, Entry.Spec.ImpactNormal);
        this.RebuildTimelineOnly();

        if (AutoStrikePlay)
        {
            this.Timeline.ExplodeAmount = 0.0;
            this.Dom.ExplodeRange.value = "0";
            this.Timeline.ActiveTime = 0.02;
            this.Timeline.Playing = true;
            this.UpdatePlayButtonIcon();
        }
        this.SyncViewportSample();
        this.RenderViewportHud();
    }

    RebuildTimelineOnly()
    {
        if (!this.Partition) return;
        const Entry = this.GetActiveConstruct();
        this.Timeline.BuildSimulation(this.Partition, Entry.Pipeline, 0.0, this.Viewport.ObjectLiftY);
    }

    HandleViewportImpact(ObjPoint, ImpactNormal, AutoPlay)
    {
        const Entry = this.GetActiveConstruct();
        Entry.Spec.ImpactPoint = ObjPoint.map((v) => Number(v.toFixed(3)));
        Entry.Spec.ImpactNormal = ImpactNormal.map((v) => Number(v.toFixed(3)));
        this.RecomputeActivePartition(AutoPlay);
        this.RenderOutliner();
        if (this.ActiveInspector === "fracture") this.RenderInspector();
    }

    HandleSelectFragment(FragIdx)
    {
        this.RenderOutliner();
        this.UpdateHoverBadge(FragIdx);
    }

    SyncViewportSample()
    {
        if (!this.Partition) return;
        const Entry = this.GetActiveConstruct();
        const Sample = this.Timeline.SampleAtTime(
            this.Timeline.ActiveTime,
            this.Partition.Fragments,
            this.Timeline.ExplodeAmount,
            this.Partition.BaseMetrics.Centroid
        );
        this.Viewport.ApplyTimelineSample(Sample, this.Partition.Fragments, Entry.Pipeline);
        const pct = (this.Timeline.ActiveTime / this.Timeline.DurationSeconds) * 100.0;
        this.Dom.TimelinePlayhead.style.left = `${pct.toFixed(2)}%`;
        this.Dom.TimelineClock.textContent = `${this.Timeline.ActiveTime.toFixed(2)}s / ${this.Timeline.DurationSeconds.toFixed(2)}s`;
    }

    UpdatePlayButtonIcon()
    {
        this.Dom.TimelinePlayBtn.innerHTML = this.Timeline.Playing ? SvgIcons.Pause : SvgIcons.Play;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                       LEFT COLUMN: OUTLINER RENDERING
    //--------------------------------------------------------------------------------------------------------------------

    RenderOutliner()
    {
        const Entry = this.GetActiveConstruct();
        const TotalBaked = this.Constructs.filter((c) => c.BakedResident).length;
        const FragCount = this.Partition ? this.Partition.Fragments.length : 0;
        const Q = this.SearchQuery;

        const ShowCelestial = (this.OutlinerFilter === "all" || this.OutlinerFilter === "celestial");
        const ShowConstructs = (this.OutlinerFilter === "all" || this.OutlinerFilter === "constructs" || this.OutlinerFilter === "baked");

        const CelestialItems = [
            {
                Id: "celestial-sun",
                Domain: "sun",
                Icon: SvgIcons.Sun,
                Meta: `El ${this.SolarSolved.ElevationDeg.toFixed(1)}° · AM ${this.SolarSolved.AirMass.toFixed(2)}`,
                Title: "Directional Sun",
                Tag: `${this.SunParams.LocalHours.toFixed(1)}h`
            },
            {
                Id: "celestial-atmosphere",
                Domain: "atmosphere",
                Icon: SvgIcons.Atmosphere,
                Meta: `RGBA16F 256×512 · H_R ${this.AtmosParams.RayleighScaleHeightKm.toFixed(1)}km`,
                Title: "Sky Atmosphere",
                Tag: this.AtmosParams.BakedFetchEnabled ? "LUT ON" : "Analytic"
            },
            {
                Id: "celestial-clouds-global",
                Domain: "clouds",
                Scope: "global",
                Icon: SvgIcons.Clouds,
                Meta: `${Math.round(this.CloudsParams.Global.Coverage * 100)}% Cov · ${Math.round(this.CloudsParams.Global.BaseHeightM)}m Z`,
                Title: "Global Cloud Slab",
                Tag: this.CloudsParams.Global.Morphology
            },
            {
                Id: "celestial-clouds-local",
                Domain: "clouds",
                Scope: "local",
                Icon: SvgIcons.Clouds,
                Meta: `Box ${(this.CloudsParams.Local.HalfExtentX * 2).toFixed(1)}×${(this.CloudsParams.Local.HalfExtentY * 2).toFixed(1)}×${(this.CloudsParams.Local.HalfExtentZ * 2).toFixed(1)} m`,
                Title: "Local Cloud Volume",
                Tag: this.CloudsParams.Local.Enabled ? "Active" : "Muted"
            }
        ].filter((item) => !Q || item.Title.toLowerCase().includes(Q) || item.Meta.toLowerCase().includes(Q));

        const FilteredConstructs = this.Constructs.filter((c) =>
        {
            if (this.OutlinerFilter === "baked" && !c.BakedResident) return false;
            if (Q && !c.Title.toLowerCase().includes(Q) && !c.Spec.Material.toLowerCase().includes(Q)) return false;
            return true;
        });

        let Html = `
        <div class="kpi-pair-grid">
            <div class="kpi-status-card">
                <div class="kpi-status-top">
                    <div class="status-badge-dot ok">${SvgIcons.Check}</div>
                    <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
                </div>
                <div class="kpi-status-bottom">
                    <span class="kpi-status-label">Active Shards</span>
                    <span class="kpi-status-num">${FragCount}</span>
                </div>
            </div>
            <div class="kpi-status-card">
                <div class="kpi-status-top">
                    <div class="status-badge-dot bake">${SvgIcons.Archive}</div>
                    <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
                </div>
                <div class="kpi-status-bottom">
                    <span class="kpi-status-label">Baked Caches</span>
                    <span class="kpi-status-num">${TotalBaked}</span>
                </div>
            </div>
        </div>`;

        if (ShowCelestial && CelestialItems.length)
        {
            Html += `<div class="directory-group">
                <div class="directory-group-header"><span>Celestial & Volumetrics</span><span>${CelestialItems.length}</span></div>
                ${CelestialItems.map((item) => `
                <div class="directory-entry ${this.SelectedDirectoryId === item.Id ? "selected" : ""}" data-celestial-id="${item.Id}" data-domain="${item.Domain}" data-scope="${item.Scope || ""}">
                    <span class="entry-grip">${SvgIcons.Grip}</span>
                    <div class="entry-icon">${item.Icon}</div>
                    <div class="entry-body">
                        <div class="entry-meta-top">${item.Meta}</div>
                        <div class="entry-title">${item.Title}</div>
                    </div>
                    <span class="entry-pill-tag">${item.Tag}</span>
                </div>`).join("")}
            </div>`;
        }

        if (ShowConstructs && FilteredConstructs.length)
        {
            Html += `<div class="directory-group">
                <div class="directory-group-header"><span>Destructible Solids</span><span>${FilteredConstructs.length}</span></div>
                ${FilteredConstructs.map((c) =>
                {
                    const Mat = MaterialCatalogue[c.Spec.Material] || MaterialCatalogue.concrete;
                    const SigMatch = c.BakedResident && c.BakedSignature === ComputeRecipeSignature(c);
                    const ModeBadge = c.BakedResident ? (SigMatch ? "Baked" : "Stale") : (c.Pipeline === "hybrid" ? "Bonds" : "Live");
                    return `
                    <div class="directory-entry ${this.SelectedDirectoryId === c.Id ? "selected" : ""}" data-construct-id="${c.Id}">
                        <span class="entry-grip">${SvgIcons.Grip}</span>
                        <div class="entry-icon">${SvgIcons.Fracture}</div>
                        <div class="entry-body">
                            <div class="entry-meta-top">${Mat.ShortLabel} · ${c.Spec.Solver}</div>
                            <div class="entry-title">${c.Title}</div>
                        </div>
                        <span class="entry-pill-tag">${ModeBadge}</span>
                    </div>`;
                }).join("")}
            </div>`;
        }

        // Live ConvexFragment Cluster Stream for active construct
        if (this.Partition && this.OutlinerFilter !== "celestial")
        {
            const PreviewFrags = this.Partition.Fragments.slice(0, 28);
            Html += `<div class="directory-group">
                <div class="directory-group-header">
                    <span>Fragment Stream (${Entry.Title})</span>
                    <span>${this.Partition.Fragments.length} pcs</span>
                </div>
                <div class="fragment-sublist">
                    ${PreviewFrags.map((f) => `
                    <div class="fragment-row ${this.Viewport.SelectedFragmentIndex === f.Index ? "selected" : ""}" data-frag-idx="${f.Index}">
                        <span>${f.Token} · <span style="color:var(--text-muted)">${f.Mass.toFixed(1)} kg</span></span>
                        <span style="display:flex;align-items:center;gap:6px">
                            <span style="color:var(--text-secondary);font-size:10px">${Math.round(f.StressRatio * 100)}%</span>
                            <button class="eye-btn" data-toggle-frag="${f.Index}" title="Toggle Fragment Visibility" style="opacity:${f.Visible === false ? 0.3 : 0.95}">${SvgIcons.Eye}</button>
                        </span>
                    </div>`).join("")}
                </div>
            </div>`;
        }

        this.Dom.OutlinerStack.innerHTML = Html;

        // Bind outliner row clicks
        this.Dom.OutlinerStack.querySelectorAll("[data-celestial-id]").forEach((row) =>
        {
            row.addEventListener("click", () =>
            {
                const dom = row.dataset.domain;
                if (row.dataset.scope) this.CloudsParams.ActiveScope = row.dataset.scope;
                this.SelectedDirectoryId = row.dataset.celestialId;
                this.SwitchInspectorDomain(dom);
            });
        });

        this.Dom.OutlinerStack.querySelectorAll("[data-construct-id]").forEach((row) =>
        {
            row.addEventListener("click", () => this.SelectConstruct(row.dataset.constructId));
        });

        this.Dom.OutlinerStack.querySelectorAll("[data-frag-idx]").forEach((row) =>
        {
            row.addEventListener("click", (ev) =>
            {
                const eye = ev.target.closest("[data-toggle-frag]");
                const idx = Number(row.dataset.fragIdx);
                if (eye)
                {
                    ev.stopPropagation();
                    const frag = this.Partition.Fragments[idx];
                    frag.Visible = frag.Visible === false ? true : false;
                    this.Viewport.SetFragmentVisibility(idx, frag.Visible);
                    this.RenderOutliner();
                    return;
                }
                this.Viewport.SelectFragment(idx);
                this.UpdateHoverBadge(idx);
                this.RenderOutliner();
            });
        });
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                          VIEWPORT HUD & SOLVER DRAWER
    //--------------------------------------------------------------------------------------------------------------------

    RenderViewportHud()
    {
        if (!this.Partition) return;
        const R = this.Partition.Receipt;
        const Mat = this.Partition.MaterialSpec;
        const BudgetPct = Math.min(100, Math.round((R.SpentSurfaceEnergy / Math.max(1, R.TotalEnergyBudget)) * 100));
        const ManifoldPct = R.WatertightManifold ? 100 : 92;

        this.Dom.ReticleText.innerHTML = `
            <div><strong>Gc ${Mat.Gc} J/m²</strong> · cR ${Math.round(R.RayleighSpeedMps)} m/s</div>
            <div class="reticle-callout-sub">${R.FragmentCount} convex hulls · ${R.ComputeDurationMs.toFixed(1)} ms</div>
        `;

        const RingSvg = (pct, color) =>
        {
            const c = 2 * Math.PI * 10;
            const dash = (pct / 100) * c;
            return `<svg width="26" height="26" viewBox="0 0 26 26">
                <circle cx="13" cy="13" r="10" stroke="rgba(255,255,255,0.12)" stroke-width="2.4" fill="none"/>
                <circle cx="13" cy="13" r="10" stroke="${color}" stroke-width="2.4" fill="none" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 13 13)" stroke-linecap="round"/>
            </svg>`;
        };

        this.Dom.IntegrityCluster.innerHTML = `
            <div class="sector-stat-row">
                ${RingSvg(ManifoldPct, "var(--status-ok)")}
                <div>
                    <div class="sector-stat-val">${ManifoldPct}%</div>
                    <div class="sector-stat-lbl">Manifold ΣV (Δ ${(R.VolumeDriftRatio * 100).toFixed(3)}%)</div>
                </div>
            </div>
            <div class="sector-stat-row">
                ${RingSvg(BudgetPct, "var(--accent)")}
                <div>
                    <div class="sector-stat-val">${BudgetPct}%</div>
                    <div class="sector-stat-lbl">Griffith Surface Budget</div>
                </div>
            </div>
        `;

        this.UpdateHoverBadge(this.Viewport.SelectedFragmentIndex >= 0 ? this.Viewport.SelectedFragmentIndex : 0);
    }

    UpdateHoverBadge(FragIdx)
    {
        if (!this.Partition || FragIdx < 0 || !this.Partition.Fragments[FragIdx])
        {
            const Entry = this.GetActiveConstruct();
            this.Dom.HoverBadge.innerHTML = `<span class="swatch-dot" style="background:var(--accent)"></span><span>${Entry.Title} · Click mesh to strike</span>`;
            return;
        }
        const Frag = this.Partition.Fragments[FragIdx];
        this.Dom.HoverBadge.innerHTML = `
            <span class="swatch-dot" style="background:${Frag.StressRatio > 0.65 ? "var(--accent)" : "var(--telemetry)"}"></span>
            <span><strong>${Frag.Token}</strong> · ${Frag.Mass.toFixed(2)} kg · ${(Frag.Volume * 1e3).toFixed(1)} L · Stress ${Math.round(Frag.StressRatio * 100)}%</span>
        `;
    }

    RenderSolverComparisonDrawer()
    {
        this.Dom.SolverDrawer.classList.toggle("open", this.SolverDrawerOpen);
        if (!this.SolverDrawerOpen) return;

        const Entry = this.GetActiveConstruct();
        const Rows = [
            {
                id: "runtime_boussinesq",
                name: "Fast Runtime Boussinesq Flat-BSP",
                origin: "Zero-Alloc TypedArray + 1-Draw-Call DataTexture",
                speed: "0.25 – 1.25 ms",
                realtime: "Primary (<1 ms, 1 Draw Call)",
                baked: "Convex Proxy",
                trait: "Closed-form Boussinesq–Hertz stress + 1-clip CSR arena + O(N) CutToken bonds"
            },
            {
                id: "engineering_fem",
                name: "Engineering Navier–Cauchy + Fractography",
                origin: "3D Continuum Lattice + Matched Interlocking Surface",
                speed: "20 – 110 ms",
                realtime: "Pre-Baked + Hybrid",
                baked: "Primary Engineering Bake",
                trait: "3×3 Cauchy eigenstresses, Rankine/Mohr-Coulomb, wake T-junctions, Bouchaud H=0.78 + aggregate sockets"
            },
            {
                id: "griffith",
                name: "Griffith Stress-Budgeted Clipping",
                origin: "Frontier- (Fragmentation) + Hybrid Extension",
                speed: "4.5 – 15 ms",
                realtime: "Small Counts (≤24)",
                baked: "Yes + Piece SDF",
                trait: "Hertzian cone + 2·Gc·A budget + grain anisotropy + tempering dicing"
            },
            {
                id: "wavefront",
                name: "LEFM Crack-Tip Radial/Ring Wavefront",
                origin: "Frontier- (Propagation / crack2d)",
                speed: "0.8 – 2.0 ms",
                realtime: "Yes (Thin-Plate)",
                baked: "Yes",
                trait: "Mott Rayleigh speed 0.6 cR, radial star spokes + flexural T-junction rings"
            },
            {
                id: "voronoi",
                name: "Clustered 3D Voronoi + Strain Bonds",
                origin: "Frontier (EverestInterface) + Bond Lattice",
                speed: "4.0 – 26 ms",
                realtime: "Hybrid Bonds Only",
                baked: "Supported",
                trait: "Impact-biased 3D Voronoi bisectors with Delaunay tensile bond graph"
            },
            {
                id: "dendritic",
                name: "Dendritic Lightning & Core-Rind Spall",
                origin: "SultanAladin / RockGenerator",
                speed: "9.0 – 120 ms",
                realtime: "Bake Only",
                baked: "Supported + 128³ SDF",
                trait: "Outer spall slabs + stochastic branching internal lightning polylines"
            }
        ];

        this.Dom.SolverDrawer.innerHTML = `
            <div class="bento-card-header">
                <div>
                    <div class="bento-title" style="font-size:15px">Fracture Architecture Comparison Matrix</div>
                    <div class="bento-subtitle">Live comparison across SultanAladin upstream fracture engines — click any row to test live on ${Entry.Title}</div>
                </div>
                <button class="pill-btn subtle-active" id="closeSolverDrawerBtn" style="flex:0;padding:5px 14px">Close ✕</button>
            </div>
            <table class="solver-matrix-table">
                <thead>
                    <tr>
                        <th>Solver Engine</th>
                        <th>Upstream Lineage</th>
                        <th>CPU Cost</th>
                        <th>Realtime</th>
                        <th>Baked + SDF</th>
                        <th>Physical Mechanism</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${Rows.map((r) => `
                    <tr class="${Entry.Spec.Solver === r.id ? "active-solver-row" : ""}">
                        <td><strong>${r.name}</strong></td>
                        <td style="color:var(--text-secondary)">${r.origin}</td>
                        <td>${r.speed}</td>
                        <td style="color:var(--status-ok)">${r.realtime}</td>
                        <td style="color:var(--accent)">${r.baked}</td>
                        <td style="color:var(--text-secondary)">${r.trait}</td>
                        <td><button class="pill-btn ${Entry.Spec.Solver === r.id ? "active" : "subtle-active"}" data-pick-solver="${r.id}">Activate</button></td>
                    </tr>`).join("")}
                </tbody>
            </table>
        `;

        this.Dom.SolverDrawer.querySelector("#closeSolverDrawerBtn").addEventListener("click", () =>
        {
            this.SolverDrawerOpen = false;
            this.Dom.SolverDrawer.classList.remove("open");
        });

        this.Dom.SolverDrawer.querySelectorAll("[data-pick-solver]").forEach((btn) =>
        {
            btn.addEventListener("click", () =>
            {
                Entry.Spec.Solver = btn.dataset.pickSolver;
                this.RecomputeActivePartition(true);
                this.RenderSolverComparisonDrawer();
                this.RenderOutliner();
                if (this.ActiveInspector === "fracture") this.RenderInspector();
            });
        });
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                    RIGHT COLUMN: 4-DOMAIN INFOGRAPHIC INSPECTOR
    //--------------------------------------------------------------------------------------------------------------------

    RenderInspector()
    {
        if (this.ActiveInspector === "sun")
        {
            this.RenderSunInspector();
        }
        else if (this.ActiveInspector === "atmosphere")
        {
            this.RenderAtmosphereInspector();
        }
        else if (this.ActiveInspector === "clouds")
        {
            this.RenderCloudsInspector();
        }
        else
        {
            this.RenderFractureInspector();
        }
        this.RedrawActiveInfographics();
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                          A. FRACTURE INSPECTOR
    //--------------------------------------------------------------------------------------------------------------------

    RenderFractureInspector()
    {
        const Entry = this.GetActiveConstruct();
        const Spec = Entry.Spec;
        const Mat = MaterialCatalogue[Spec.Material] || MaterialCatalogue.concrete;
        const R = this.Partition.Receipt;
        const CurrentSig = ComputeRecipeSignature(Entry);
        const IsFreshBake = Entry.BakedResident && Entry.BakedSignature === CurrentSig;
        const SdfFootprint = EvaluateSdfAtlasFootprint(R.FragmentCount, Spec.SdfResolution, Spec.PieceSdf);
        const EnergyFmt = SplitFormatNumber(Spec.Energy / 1000, 2);

        this.Dom.InspectorTitle.textContent = "Fracture Inspector";
        this.Dom.InspectorSubtitle.textContent = `${Entry.Title} · ${Mat.Label}`;
        this.Dom.InspectorStatus.textContent = IsFreshBake ? "Baked Resident" : (Entry.BakedResident ? "Bake Stale" : "Realtime Ready");
        this.Dom.InspectorStatus.className = `delta-pill ${IsFreshBake || !Entry.BakedResident ? "live" : "stale"}`;

        const MaterialKeys = Object.keys(MaterialCatalogue);
        const OccupiedLeds = Math.min(48, Math.round((R.FragmentCount / 160) * 48));

        const Eng = this.Partition.EngineeringReport || null;
        const GpuStreamMs = this.Viewport ? this.Viewport.LastGpuStreamMs : 0;
        const DrawCalls = this.Viewport ? this.Viewport.ActiveDrawCalls : R.FragmentCount;

        this.Dom.InspectorStack.innerHTML = `
        <!-- CARD 1: PIPELINE & SOLVER TELEMETRY -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Partition Pipeline & Solver</div>
                    <div class="bento-subtitle">${Eng ? `Watertight Interlocking Fractography · ΣV drift ${R.VolumeDriftRatio.toExponential(1)}` : `Zero-Alloc Flat-BSP · ${DrawCalls} GPU Draw Call${DrawCalls === 1 ? "" : "s"} · ΣV drift ${R.VolumeDriftRatio.toExponential(1)}`}</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="hero-metric-row">
                <div class="hero-number">${R.FragmentCount}<span class="muted-part"> / ${Spec.Ceiling}</span><span class="unit-part">${Eng ? `${Eng.NonPlanarTriangles} interlocking tris` : "convex shards"}</span></div>
                <span class="delta-pill live">${R.ComputeDurationMs.toFixed(2)} ms CPU${Spec.Solver === "runtime_boussinesq" ? ` · ${GpuStreamMs.toFixed(2)} ms GPU` : ""}</span>
            </div>
            <div class="pill-strip" id="inspPipelineStrip">
                <button class="pill-btn ${Entry.Pipeline === "realtime" ? "active" : ""}" data-insp-pipe="realtime">Realtime (&lt;1ms)</button>
                <button class="pill-btn ${Entry.Pipeline === "baked" ? "active" : ""}" data-insp-pipe="baked">Engineering Bake</button>
                <button class="pill-btn ${Entry.Pipeline === "hybrid" ? "active" : ""}" data-insp-pipe="hybrid">Hybrid Bonds</button>
            </div>
            <div class="pill-strip" id="inspSolverStrip" style="flex-wrap:wrap">
                <button class="pill-btn ${Spec.Solver === "runtime_boussinesq" ? "subtle-active" : ""}" data-insp-solver="runtime_boussinesq">Fast Runtime</button>
                <button class="pill-btn ${Spec.Solver === "engineering_fem" ? "subtle-active" : ""}" data-insp-solver="engineering_fem">Engineering FEM</button>
                <button class="pill-btn ${Spec.Solver === "griffith" ? "subtle-active" : ""}" data-insp-solver="griffith">Griffith</button>
                <button class="pill-btn ${Spec.Solver === "wavefront" ? "subtle-active" : ""}" data-insp-solver="wavefront">LEFM Wave</button>
                <button class="pill-btn ${Spec.Solver === "voronoi" ? "subtle-active" : ""}" data-insp-solver="voronoi">Voronoi</button>
                <button class="pill-btn ${Spec.Solver === "dendritic" ? "subtle-active" : ""}" data-insp-solver="dendritic">Dendritic</button>
            </div>
        </div>

        ${Eng ? `
        <!-- CARD 1B: ENGINEERING CONTINUUM & INTERLOCKING FRACTOGRAPHY RECEIPT -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Navier–Cauchy Stress & Fractography</div>
                    <div class="bento-subtitle">${Eng.FractographyMode} · ${Eng.ConvexHullCount} convex physics hulls</div>
                </div>
                <span class="delta-pill live">H=${Eng.HurstExponent.toFixed(2)}</span>
            </div>
            <canvas class="diagram-canvas" id="engineeringStressCanvas" height="122"></canvas>
        </div>` : ""}

        <!-- CARD 2: GRIFFITH ENERGY & WEIBULL WAVEFORM -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Griffith Energy & Crack Arrest Profile</div>
                    <div class="bento-subtitle">Crack area ${R.TotalCrackArea.toFixed(2)} m² · Price 2·Gc = ${2 * Mat.Gc} J/m²${Mat.StoredEnergy > 0 ? ` · +${(Mat.StoredEnergy / 1000).toFixed(0)} kJ/m³ tempered` : ""}</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="hero-metric-row">
                <div class="hero-number">${EnergyFmt.main}<span class="muted-part">${EnergyFmt.sub}</span><span class="unit-part">kJ delivered</span></div>
                <button class="pill-btn subtle-active" id="rerollSeedBtn" style="flex:0;padding:4px 11px">Seed #${Spec.Seed} ↻</button>
            </div>
            <canvas class="diagram-canvas" id="griffithWaveformCanvas" height="134"></canvas>
            <div class="slider-row">
                <div class="slider-top"><span class="slider-label">Impact Kinetic Energy</span><span class="slider-num-pill" id="lblEnergy">${Spec.Energy} J</span></div>
                <input type="range" class="editorial-range" id="rngEnergy" min="100" max="15000" step="50" value="${Spec.Energy}" />
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Shard Ceiling</span><span class="slider-num-pill" id="lblCeiling">${Spec.Ceiling}</span></div>
                    <input type="range" class="editorial-range" id="rngCeiling" min="4" max="140" step="1" value="${Spec.Ceiling}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Min Span</span><span class="slider-num-pill" id="lblMinSpan">${Spec.MinimumSize.toFixed(3)} m</span></div>
                    <input type="range" class="editorial-range" id="rngMinSpan" min="0.015" max="0.22" step="0.005" value="${Spec.MinimumSize}" />
                </div>
            </div>
        </div>

        <!-- CARD 3: MATERIAL PHYSICS & POLAR ANISOTROPY ROSE -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Material Constitutive Tensor & Grain</div>
                    <div class="bento-subtitle">${Mat.FractureCategory} · ρ ${Mat.Density} kg/m³ · E ${Mat.YoungModulusGPa} GPa · Weibull m=${Mat.WeibullModulus}</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="chip-grid" id="materialChipGrid">
                ${MaterialKeys.map((k) =>
                {
                    const m = MaterialCatalogue[k];
                    return `<button class="choice-chip ${Spec.Material === k ? "active" : ""}" data-mat="${k}">
                        <span class="swatch-dot" style="background:${m.ExteriorHex}"></span>
                        <span>${m.ShortLabel}</span>
                    </button>`;
                }).join("")}
            </div>
            <div class="bento-two-col" style="align-items:center">
                <canvas class="diagram-canvas" id="polarAnisotropyCanvas" height="128" title="Drag to rotate orthotropic grain / bedding orientation"></canvas>
                <div class="spectrum-band-list">
                    <div class="spectrum-band-row">
                        <span style="color:var(--text-secondary)">Gc Toughness</span>
                        <div class="spectrum-track"><div class="spectrum-fill" style="width:${Math.min(100, (Mat.Gc / 500) * 100)}%;background:var(--accent)"></div></div>
                        <span style="text-align:right">${Mat.Gc} J/m²</span>
                    </div>
                    <div class="spectrum-band-row">
                        <span style="color:var(--text-secondary)">Anisotropy</span>
                        <div class="spectrum-track"><div class="spectrum-fill" style="width:${Math.min(100, (Mat.AnisotropyRatio / 11) * 100)}%;background:var(--telemetry)"></div></div>
                        <span style="text-align:right">${Mat.AnisotropyRatio.toFixed(1)}×</span>
                    </div>
                    <div class="spectrum-band-row">
                        <span style="color:var(--text-secondary)">Wave cR</span>
                        <div class="spectrum-track"><div class="spectrum-fill" style="width:${Math.min(100, (R.RayleighSpeedMps / 3400) * 100)}%;background:#60A5FA"></div></div>
                        <span style="text-align:right">${Math.round(R.RayleighSpeedMps)} m/s</span>
                    </div>
                    <div class="slider-row" style="margin-top:4px">
                        <div class="slider-top"><span class="slider-label">Grain Axis θ</span><span class="slider-num-pill" id="lblGrainDeg">${Math.round(Spec.GrainAngleDeg)}°</span></div>
                        <input type="range" class="editorial-range" id="rngGrainDeg" min="0" max="180" step="1" value="${Spec.GrainAngleDeg}" />
                    </div>
                </div>
            </div>
        </div>

        <!-- CARD 4: ADJACENCY STRAIN BONDS & IMPACT LOCUS -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Strain-Bond Connectivity & Impact Locus</div>
                    <div class="bento-subtitle">${R.IntactBondCount} intact / ${R.BondCount} total Delaunay face bonds</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="hatched-compare-grid">
                <div class="hatched-block">
                    <span>Intact Bonds</span>
                    <strong>${R.IntactBondCount}</strong>
                </div>
                <div class="solid-compare-block">
                    <span>Ruptured</span>
                    <strong>${R.BondCount - R.IntactBondCount}</strong>
                </div>
            </div>
            <div class="slider-row">
                <div class="slider-top"><span class="slider-label">Bond Tensile Capacity Scale</span><span class="slider-num-pill" id="lblBondScale">${Spec.BondStrengthScale.toFixed(2)}×</span></div>
                <input type="range" class="editorial-range" id="rngBondScale" min="0.15" max="2.50" step="0.05" value="${Spec.BondStrengthScale}" />
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Impact X</span><span class="slider-num-pill" id="lblImpX">${Spec.ImpactPoint[0].toFixed(2)} m</span></div>
                    <input type="range" class="editorial-range" id="rngImpX" min="-0.95" max="0.95" step="0.02" value="${Spec.ImpactPoint[0]}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Impact Y</span><span class="slider-num-pill" id="lblImpY">${Spec.ImpactPoint[1].toFixed(2)} m</span></div>
                    <input type="range" class="editorial-range" id="rngImpY" min="-0.85" max="0.85" step="0.02" value="${Spec.ImpactPoint[1]}" />
                </div>
            </div>
            <div class="slider-row">
                <div class="slider-top"><span class="slider-label">Impact Z</span><span class="slider-num-pill" id="lblImpZ">${Spec.ImpactPoint[2].toFixed(2)} m</span></div>
                <input type="range" class="editorial-range" id="rngImpZ" min="-0.95" max="0.95" step="0.02" value="${Spec.ImpactPoint[2]}" />
            </div>
        </div>

        <!-- CARD 5: PIECE SDF VOXEL ATLAS & BAKED ARCHIVE POCKETS -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Piece SDF Voxel Atlas & Baked Archive</div>
                    <div class="bento-subtitle">${Spec.PieceSdf ? `${SdfFootprint.Megabytes.toFixed(2)} MB R16F distance bricks` : "Convex hull collision only (Piece SDF disabled)"}</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="operator-tile-grid">
                <div class="operator-tile ${Spec.PieceSdf ? "on" : ""}" id="togglePieceSdfTile">
                    <div>
                        <div style="font-weight:500;font-size:11.5px">Piece SDF</div>
                        <div style="font-size:9.8px;color:var(--text-muted)">Signed distance bricks</div>
                    </div>
                    <div class="operator-switch"></div>
                </div>
                <div class="pill-strip" id="sdfResStrip" style="align-self:center">
                    <button class="pill-btn ${Spec.SdfResolution === 32 ? "active" : ""}" data-sdf-res="32">32³</button>
                    <button class="pill-btn ${Spec.SdfResolution === 64 ? "active" : ""}" data-sdf-res="64">64³</button>
                    <button class="pill-btn ${Spec.SdfResolution === 128 ? "active" : ""}" data-sdf-res="128">128³</button>
                </div>
            </div>
            <div class="bento-two-col" style="align-items:center">
                <canvas class="diagram-canvas" id="pieceSdfSliceCanvas" height="112"></canvas>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <div class="led-matrix-grid" title="SDF Atlas Brick Occupancy">
                        ${Array.from({ length: 48 }, (_, idx) => `<div class="led-dot ${Spec.PieceSdf && idx < OccupiedLeds ? "lit" : ""}"></div>`).join("")}
                    </div>
                    <div class="slider-row">
                        <div class="slider-top"><span class="slider-label">SDF Slice Y</span><span class="slider-num-pill" id="lblSdfSlice">${this.Viewport.SdfSliceY.toFixed(2)} m</span></div>
                        <input type="range" class="editorial-range" id="rngSdfSlice" min="-0.75" max="0.75" step="0.03" value="${this.Viewport.SdfSliceY}" />
                    </div>
                </div>
            </div>
            <div class="pocket-archive-grid">
                <div class="pocket-card ${IsFreshBake ? "active" : ""}" id="finalizeBakeCard">
                    <div style="display:flex;justify-content:space-between;font-size:11px"><span><strong>Finalize Bake</strong></span><svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg></div>
                    <div class="pocket-folder-art">
                        <div class="fanned-sheet s1"></div>
                        <div class="fanned-sheet s2"></div>
                        <div class="fanned-sheet s3"></div>
                        <div class="folder-front-lip">${IsFreshBake ? "Resident ✓" : `Bake ${R.FragmentCount} pcs`}</div>
                    </div>
                </div>
                <div class="pocket-card" id="exportTomlCard">
                    <div style="display:flex;justify-content:space-between;font-size:11px"><span><strong>Export .toml</strong></span><svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg></div>
                    <div class="pocket-folder-art">
                        <div class="fanned-sheet s1"></div>
                        <div class="fanned-sheet s2"></div>
                        <div class="fanned-sheet s3"></div>
                        <div class="folder-front-lip">Frontier TOML</div>
                    </div>
                </div>
            </div>
        </div>
        `;

        // Bind Fracture Inspector Controls
        const Stack = this.Dom.InspectorStack;

        Stack.querySelector("#inspPipelineStrip").addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-insp-pipe]");
            if (!btn) return;
            Entry.Pipeline = btn.dataset.inspPipe;
            if (Entry.Pipeline === "realtime")
            {
                Spec.Solver = "runtime_boussinesq";
            }
            else if (Spec.Solver === "runtime_boussinesq")
            {
                Spec.Solver = "engineering_fem";
            }
            this.SyncTopPipelineBar();
            this.RecomputeActivePartition(Entry.Pipeline === "baked");
            this.RenderOutliner();
            this.RenderFractureInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#inspSolverStrip").addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-insp-solver]");
            if (!btn) return;
            Spec.Solver = btn.dataset.inspSolver;
            this.RecomputeActivePartition(false);
            this.RenderOutliner();
            this.RenderFractureInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#rerollSeedBtn").addEventListener("click", () =>
        {
            Spec.Seed = Math.floor(1 + Math.random() * 9999);
            this.RecomputeActivePartition(true);
            this.RenderOutliner();
            this.RenderFractureInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#materialChipGrid").addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-mat]");
            if (!btn) return;
            Spec.Material = btn.dataset.mat;
            this.RecomputeActivePartition(false);
            this.RenderOutliner();
            this.RenderFractureInspector();
            this.RedrawActiveInfographics();
        });

        const BindFractureSlider = (Selector, LabelSel, FormatFn, ApplyFn) =>
        {
            const Input = Stack.querySelector(Selector);
            const Lbl = Stack.querySelector(LabelSel);
            if (!Input) return;
            Input.addEventListener("input", () =>
            {
                const v = Number(Input.value);
                if (Lbl) Lbl.textContent = FormatFn(v);
                ApplyFn(v);
                this.RecomputeActivePartition(false);
                this.RenderOutliner();
                this.RedrawActiveInfographics();
            });
        };

        BindFractureSlider("#rngEnergy", "#lblEnergy", (v) => `${v} J`, (v) => { Spec.Energy = v; });
        BindFractureSlider("#rngCeiling", "#lblCeiling", (v) => `${v}`, (v) => { Spec.Ceiling = v; });
        BindFractureSlider("#rngMinSpan", "#lblMinSpan", (v) => `${v.toFixed(3)} m`, (v) => { Spec.MinimumSize = v; });
        BindFractureSlider("#rngGrainDeg", "#lblGrainDeg", (v) => `${Math.round(v)}°`, (v) => { Spec.GrainAngleDeg = v; });
        BindFractureSlider("#rngBondScale", "#lblBondScale", (v) => `${v.toFixed(2)}×`, (v) => { Spec.BondStrengthScale = v; });
        BindFractureSlider("#rngImpX", "#lblImpX", (v) => `${v.toFixed(2)} m`, (v) => { Spec.ImpactPoint[0] = v; });
        BindFractureSlider("#rngImpY", "#lblImpY", (v) => `${v.toFixed(2)} m`, (v) => { Spec.ImpactPoint[1] = v; });
        BindFractureSlider("#rngImpZ", "#lblImpZ", (v) => `${v.toFixed(2)} m`, (v) => { Spec.ImpactPoint[2] = v; });

        // Interactive Polar Toughness Rose rotation drag
        const PolarCanvas = Stack.querySelector("#polarAnisotropyCanvas");
        PolarCanvas.addEventListener("pointerdown", (ev) =>
        {
            const Rect = PolarCanvas.getBoundingClientRect();
            const dx = ev.clientX - (Rect.left + Rect.width * 0.5);
            const dy = ev.clientY - (Rect.top + Rect.height * 0.52);
            let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (deg < 0) deg += 180;
            Spec.GrainAngleDeg = Math.round(deg);
            this.RecomputeActivePartition(false);
            this.RenderFractureInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#togglePieceSdfTile").addEventListener("click", () =>
        {
            Spec.PieceSdf = !Spec.PieceSdf;
            if (Spec.PieceSdf && Entry.Pipeline === "realtime") Entry.Pipeline = "baked";
            this.SyncTopPipelineBar();
            this.RenderFractureInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#sdfResStrip").addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-sdf-res]");
            if (!btn) return;
            Spec.SdfResolution = Number(btn.dataset.sdfRes);
            Spec.PieceSdf = true;
            this.Viewport.RebuildSdfSliceVisual(Math.min(96, Spec.SdfResolution));
            this.RenderFractureInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#rngSdfSlice").addEventListener("input", (e) =>
        {
            this.Viewport.SdfSliceY = Number(e.target.value);
            Stack.querySelector("#lblSdfSlice").textContent = `${this.Viewport.SdfSliceY.toFixed(2)} m`;
            this.Viewport.RebuildSdfSliceVisual(Math.min(96, Spec.SdfResolution));
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#finalizeBakeCard").addEventListener("click", () =>
        {
            Entry.BakedResident = true;
            Entry.BakedSignature = ComputeRecipeSignature(Entry);
            Entry.Pipeline = "baked";
            this.SyncTopPipelineBar();
            this.RenderOutliner();
            this.RenderFractureInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#exportTomlCard").addEventListener("click", () => this.DownloadFractureToml(Entry));
    }

    DownloadFractureToml(Entry)
    {
        const s = Entry.Spec;
        const R = this.Partition.Receipt;
        const TomlText = [
            `# Frontier Fracture Specification Archive`,
            `[Construct]`,
            `Identifier = "${Entry.Id}"`,
            `Label = "${Entry.Title}"`,
            `SolidCategory = "${Entry.SolidCategory}"`,
            `Pipeline = "${Entry.Pipeline}"`,
            ``,
            `[FractureRecipe]`,
            `Solver = "${s.Solver}"`,
            `Material = "${s.Material}"`,
            `EnergyJoules = ${s.Energy}`,
            `DeterministicSeed = ${s.Seed}`,
            `ShardCeiling = ${s.Ceiling}`,
            `MinimumSpanMetres = ${s.MinimumSize}`,
            `GrainAngleDegrees = ${s.GrainAngleDeg}`,
            `BondStrengthScale = ${s.BondStrengthScale}`,
            `ImpactPoint = [${s.ImpactPoint.join(", ")}]`,
            `ImpactNormal = [${s.ImpactNormal.join(", ")}]`,
            ``,
            `[PieceSdf]`,
            `Enabled = ${s.PieceSdf}`,
            `VoxelResolution = ${s.SdfResolution}`,
            ``,
            `[GeometryReceipt]`,
            `FragmentCount = ${R.FragmentCount}`,
            `TotalCrackAreaM2 = ${R.TotalCrackArea.toFixed(4)}`,
            `VolumeDriftRatio = ${R.VolumeDriftRatio.toExponential(4)}`,
            `WatertightManifold = ${R.WatertightManifold}`
        ].join("\n");

        const BlobFile = new Blob([TomlText], { type: "text/plain;charset=utf-8" });
        const Link = document.createElement("a");
        Link.href = URL.createObjectURL(BlobFile);
        Link.download = `${Entry.Id}.fracture.toml`;
        Link.click();
        URL.revokeObjectURL(Link.href);
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                            B. SUN INSPECTOR
    //--------------------------------------------------------------------------------------------------------------------

    RenderSunInspector()
    {
        const S = this.SunParams;
        const E = this.SolarSolved;
        const ElSplit = SplitFormatNumber(E.ElevationDeg, 1);
        const AzSplit = SplitFormatNumber(E.AzimuthDeg, 1);

        this.Dom.InspectorTitle.textContent = "Sun Inspector";
        this.Dom.InspectorSubtitle.textContent = `15 Native Properties · ${E.PhaseLabel}`;
        this.Dom.InspectorStatus.textContent = `AM ${E.AirMass.toFixed(2)}`;
        this.Dom.InspectorStatus.className = "delta-pill live";

        const FormatClock = (hr) =>
        {
            if (hr === null || hr === undefined) return "--:--";
            const h = Math.floor(hr) % 24;
            const m = Math.floor((hr - Math.floor(hr)) * 60);
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        };

        const TintHex = "#" + S.TintRgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("");

        this.Dom.InspectorStack.innerHTML = `
        <!-- CARD 1: SOLVED CELESTIAL DIRECTION -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Solved Celestial Direction</div>
                    <div class="bento-subtitle">Read-only astronomical ephemeris · Declination δ ${E.DeclinationDeg.toFixed(2)}° · EoT ${E.EquationOfTimeMin >= 0 ? "+" : ""}${E.EquationOfTimeMin.toFixed(1)} min</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="bento-two-col">
                <div class="mini-metric-box">
                    <span class="mini-metric-lbl">Solar Elevation α</span>
                    <div class="hero-number" style="font-size:25px">${ElSplit.main}<span class="muted-part">${ElSplit.sub}°</span></div>
                </div>
                <div class="mini-metric-box">
                    <span class="mini-metric-lbl">Solar Azimuth γ</span>
                    <div class="hero-number" style="font-size:25px">${AzSplit.main}<span class="muted-part">${AzSplit.sub}°</span></div>
                </div>
            </div>
        </div>

        <!-- CARD 2: 24-HOUR DAY CYCLE & DIURNAL ARC -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">24-Hour Day Cycle</div>
                    <div class="bento-subtitle">Sunrise ${FormatClock(E.SunriseHour)} · Noon ${FormatClock(E.SolarNoonHour)} · Sunset ${FormatClock(E.SunsetHour)}</div>
                </div>
                <span class="delta-pill">${FormatClock(S.LocalHours)}</span>
            </div>
            <canvas class="diagram-canvas" id="solarDiurnalCanvas" height="138" title="Click or drag to scrub Local Solar Hours"></canvas>
            <div class="slider-row">
                <div class="slider-top"><span class="slider-label">Local Hours</span><span class="slider-num-pill" id="lblSunHours">${FormatClock(S.LocalHours)} (${S.LocalHours.toFixed(2)}h)</span></div>
                <input type="range" class="editorial-range" id="rngSunHours" min="0" max="24" step="0.05" value="${S.LocalHours}" />
            </div>
            <div class="operator-tile-grid">
                <div class="operator-tile ${S.AnimateCycle ? "on" : ""}" id="toggleSunAnimateTile">
                    <div>
                        <div style="font-weight:500;font-size:11.5px">Animate Day</div>
                        <div style="font-size:9.8px;color:var(--text-muted)">Diurnal orbit</div>
                    </div>
                    <div class="operator-switch"></div>
                </div>
                <div class="pill-strip" id="sunSpeedStrip" style="align-self:center">
                    ${[0.5, 1, 6, 24].map((sp) => `<button class="pill-btn ${S.CycleSpeed === sp ? "active" : ""}" data-sun-speed="${sp}">${sp}×</button>`).join("")}
                </div>
            </div>
        </div>

        <!-- CARD 3: SUN DISK & RGB TINT -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Sun Disk & Spectral Tint</div>
                    <div class="bento-subtitle">Earth mean subtense 0.533° dashed ring · Linear RGB chromaticity</div>
                </div>
                <span class="swatch-dot" id="sunTintSwatch" style="width:16px;height:16px;background:${TintHex};border:1px solid rgba(255,255,255,0.3)"></span>
            </div>
            <canvas class="diagram-canvas" id="sunDiscPreviewCanvas" height="84"></canvas>
            <div class="slider-row">
                <div class="slider-top"><span class="slider-label">Angular Diameter</span><span class="slider-num-pill" id="lblSunDiam">${S.AngularDiameterDeg.toFixed(3)}°</span></div>
                <input type="range" class="editorial-range" id="rngSunDiam" min="0.10" max="4.00" step="0.01" value="${S.AngularDiameterDeg}" />
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Tint Red</span><span class="slider-num-pill" id="lblSunR">${S.TintRgb[0].toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngSunR" min="0.2" max="1.4" step="0.01" value="${S.TintRgb[0]}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Tint Green</span><span class="slider-num-pill" id="lblSunG">${S.TintRgb[1].toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngSunG" min="0.2" max="1.4" step="0.01" value="${S.TintRgb[1]}" />
                </div>
            </div>
            <div class="slider-row">
                <div class="slider-top"><span class="slider-label">Tint Blue</span><span class="slider-num-pill" id="lblSunB">${S.TintRgb[2].toFixed(2)}</span></div>
                <input type="range" class="editorial-range" id="rngSunB" min="0.2" max="1.4" step="0.01" value="${S.TintRgb[2]}" />
            </div>
        </div>

        <!-- CARD 4: SUNLIGHT GAIN MULTIPLIERS -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Sunlight Gain Multipliers</div>
                    <div class="bento-subtitle">Dimensionless engine multipliers (explicitly not photometric lux)</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="hatched-compare-grid">
                <div class="hatched-block"><span>Sky Scatter</span><strong id="lblSkyGainCard">${S.SkyGainMultiplier.toFixed(2)}×</strong></div>
                <div class="solid-compare-block" style="background:var(--accent);color:var(--accent-ink)"><span>Direct Beam</span><strong id="lblDirectGainCard">${S.DirectBeamMultiplier.toFixed(2)}×</strong></div>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Intensity ×</span><span class="slider-num-pill" id="lblSkyGain">${S.SkyGainMultiplier.toFixed(2)}×</span></div>
                    <input type="range" class="editorial-range" id="rngSkyGain" min="0.0" max="3.0" step="0.05" value="${S.SkyGainMultiplier}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Direct Light ×</span><span class="slider-num-pill" id="lblDirectGain">${S.DirectBeamMultiplier.toFixed(2)}×</span></div>
                    <input type="range" class="editorial-range" id="rngDirectGain" min="0.0" max="4.0" step="0.05" value="${S.DirectBeamMultiplier}" />
                </div>
            </div>
        </div>

        <!-- CARD 5: OBSERVER GEODETIC COORDINATES & HONEST BAKE NOTICE -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Observer Coordinates & Calendar</div>
                    <div class="bento-subtitle">Click dot-matrix graticule to relocate · Month ${S.Month} / Day ${S.Day}</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <canvas class="diagram-canvas" id="observerMapCanvas" height="102" title="Click anywhere on Earth graticule to set Latitude / Longitude"></canvas>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Latitude</span><span class="slider-num-pill" id="lblLat">${S.LatitudeDeg.toFixed(1)}°</span></div>
                    <input type="range" class="editorial-range" id="rngLat" min="-85" max="85" step="0.5" value="${S.LatitudeDeg}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Longitude</span><span class="slider-num-pill" id="lblLon">${S.LongitudeDeg.toFixed(1)}°</span></div>
                    <input type="range" class="editorial-range" id="rngLon" min="-180" max="180" step="0.5" value="${S.LongitudeDeg}" />
                </div>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Month</span><span class="slider-num-pill" id="lblMonth">${S.Month}</span></div>
                    <input type="range" class="editorial-range" id="rngMonth" min="1" max="12" step="1" value="${S.Month}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Day</span><span class="slider-num-pill" id="lblDay">${S.Day}</span></div>
                    <input type="range" class="editorial-range" id="rngDay" min="1" max="31" step="1" value="${S.Day}" />
                </div>
            </div>
            <div class="capability-notice">
                <strong>Bake / Image Notice:</strong> Directional Sun is solved analytically per frame. Octahedral HDR sky radiance & transmittance baking belongs to the <strong>Atmosphere</strong> stage.
            </div>
        </div>
        `;

        const Stack = this.Dom.InspectorStack;
        const RefreshSun = (ReRenderFull = false) =>
        {
            this.SolarSolved = EvaluateSolarEphemeris(this.SunParams);
            this.RenderOutliner();
            if (ReRenderFull) this.RenderSunInspector();
            this.RedrawActiveInfographics();
        };

        // Interactive click/drag on 24h Solar Diurnal Canvas
        const DiurnalCanvas = Stack.querySelector("#solarDiurnalCanvas");
        let DragSunArc = false;
        const ScrubSunArc = (ev) =>
        {
            const Rect = DiurnalCanvas.getBoundingClientRect();
            const padL = 10, padR = 34;
            const u = Math.max(0, Math.min(1, (ev.clientX - Rect.left - padL) / Math.max(1, Rect.width - padL - padR)));
            S.LocalHours = Number((u * 24.0).toFixed(2));
            RefreshSun(true);
        };
        DiurnalCanvas.addEventListener("pointerdown", (ev) => { DragSunArc = true; ScrubSunArc(ev); });
        window.addEventListener("pointermove", (ev) => { if (DragSunArc && this.ActiveInspector === "sun") ScrubSunArc(ev); });
        window.addEventListener("pointerup", () => { DragSunArc = false; });

        // Interactive click on World Graticule Map
        const MapCanvas = Stack.querySelector("#observerMapCanvas");
        MapCanvas.addEventListener("pointerdown", (ev) =>
        {
            const Rect = MapCanvas.getBoundingClientRect();
            const u = Math.max(0, Math.min(1, (ev.clientX - Rect.left) / Math.max(1, Rect.width)));
            const v = Math.max(0, Math.min(1, (ev.clientY - Rect.top) / Math.max(1, Rect.height)));
            S.LongitudeDeg = Number((-180 + u * 360).toFixed(1));
            S.LatitudeDeg = Number((90 - v * 180).toFixed(1));
            RefreshSun(true);
        });

        Stack.querySelector("#rngSunHours").addEventListener("input", (e) => { S.LocalHours = Number(e.target.value); RefreshSun(true); });
        Stack.querySelector("#toggleSunAnimateTile").addEventListener("click", () => { S.AnimateCycle = !S.AnimateCycle; RefreshSun(true); });
        Stack.querySelector("#sunSpeedStrip").addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-sun-speed]");
            if (!btn) return;
            S.CycleSpeed = Number(btn.dataset.sunSpeed);
            RefreshSun(true);
        });

        Stack.querySelector("#rngSunDiam").addEventListener("input", (e) =>
        {
            S.AngularDiameterDeg = Number(e.target.value);
            Stack.querySelector("#lblSunDiam").textContent = `${S.AngularDiameterDeg.toFixed(3)}°`;
            this.RedrawActiveInfographics();
        });
        Stack.querySelector("#rngSunR").addEventListener("input", (e) =>
        {
            S.TintRgb[0] = Number(e.target.value);
            Stack.querySelector("#lblSunR").textContent = S.TintRgb[0].toFixed(2);
            this.RedrawActiveInfographics();
        });
        Stack.querySelector("#rngSunG").addEventListener("input", (e) =>
        {
            S.TintRgb[1] = Number(e.target.value);
            Stack.querySelector("#lblSunG").textContent = S.TintRgb[1].toFixed(2);
            this.RedrawActiveInfographics();
        });
        Stack.querySelector("#rngSunB").addEventListener("input", (e) =>
        {
            S.TintRgb[2] = Number(e.target.value);
            Stack.querySelector("#lblSunB").textContent = S.TintRgb[2].toFixed(2);
            this.RedrawActiveInfographics();
        });
        Stack.querySelector("#rngSkyGain").addEventListener("input", (e) =>
        {
            S.SkyGainMultiplier = Number(e.target.value);
            Stack.querySelector("#lblSkyGain").textContent = `${S.SkyGainMultiplier.toFixed(2)}×`;
            Stack.querySelector("#lblSkyGainCard").textContent = `${S.SkyGainMultiplier.toFixed(2)}×`;
        });
        Stack.querySelector("#rngDirectGain").addEventListener("input", (e) =>
        {
            S.DirectBeamMultiplier = Number(e.target.value);
            Stack.querySelector("#lblDirectGain").textContent = `${S.DirectBeamMultiplier.toFixed(2)}×`;
            Stack.querySelector("#lblDirectGainCard").textContent = `${S.DirectBeamMultiplier.toFixed(2)}×`;
        });
        Stack.querySelector("#rngLat").addEventListener("input", (e) => { S.LatitudeDeg = Number(e.target.value); RefreshSun(true); });
        Stack.querySelector("#rngLon").addEventListener("input", (e) => { S.LongitudeDeg = Number(e.target.value); RefreshSun(true); });
        Stack.querySelector("#rngMonth").addEventListener("input", (e) => { S.Month = Number(e.target.value); RefreshSun(true); });
        Stack.querySelector("#rngDay").addEventListener("input", (e) => { S.Day = Number(e.target.value); RefreshSun(true); });
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                         C. ATMOSPHERE INSPECTOR
    //--------------------------------------------------------------------------------------------------------------------

    RenderAtmosphereInspector()
    {
        const A = this.AtmosParams;
        const SunDir = this.SolarSolved.Direction;
        const RecSun = A.BakedSunDirection || SunDir;
        const DotSun = Math.max(-1, Math.min(1, SunDir[0] * RecSun[0] + SunDir[1] * RecSun[1] + SunDir[2] * RecSun[2]));
        const SunDeltaDeg = (Math.acos(DotSun) * 180) / Math.PI;
        const BakeStale = SunDeltaDeg > 2.0;

        this.Dom.InspectorTitle.textContent = "Atmosphere Inspector";
        this.Dom.InspectorSubtitle.textContent = "18 Native Fields · Bruneton & Hillaire Medium";
        this.Dom.InspectorStatus.textContent = BakeStale ? `Sun Δ ${SunDeltaDeg.toFixed(1)}°` : "LUT Resident";
        this.Dom.InspectorStatus.className = `delta-pill ${BakeStale ? "stale" : "live"}`;

        this.Dom.InspectorStack.innerHTML = `
        <!-- CARD 1: 256×512 RGBA16F OCTAHEDRAL BAKE VIEWER -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">256 × 512 RGBA16F Sky Bake Atlas</div>
                    <div class="bento-subtitle">Octahedral radiance + horizon-stretched transmittance LUT · Rev #${A.BakedRevision}</div>
                </div>
                <button class="pill-btn active" id="bakeAtmosphereBtn" style="flex:0;padding:5px 12px">Bake Sky</button>
            </div>
            <div class="pill-strip" id="atmosPreviewStrip">
                <button class="pill-btn ${A.PreviewMode === "altitude" ? "subtle-active" : ""}" data-atmos-view="altitude">Altitude</button>
                <button class="pill-btn ${A.PreviewMode === "panorama" ? "subtle-active" : ""}" data-atmos-view="panorama">Panorama 4:1</button>
                <button class="pill-btn ${A.PreviewMode === "transmittance" ? "subtle-active" : ""}" data-atmos-view="transmittance">Transmittance</button>
                <button class="pill-btn ${A.PreviewMode === "sphere" ? "subtle-active" : ""}" data-atmos-view="sphere">Sphere 2:1</button>
            </div>
            <canvas class="diagram-canvas" id="atmosphereLutCanvas" height="110"></canvas>
            <div class="operator-tile-grid">
                <div class="operator-tile ${A.BakedFetchEnabled ? "on" : ""}" id="toggleBakedFetchTile">
                    <div>
                        <div style="font-weight:500;font-size:11.5px">Baked Fetch</div>
                        <div style="font-size:9.8px;color:var(--text-muted)">${A.BakedFetchEnabled ? "ON · Sample LUT" : "OFF · Analytic"}</div>
                    </div>
                    <div class="operator-switch"></div>
                </div>
                <div class="operator-tile ${A.CivilTwilightEnabled ? "on" : ""}" id="toggleCivilTwilightTile">
                    <div>
                        <div style="font-weight:500;font-size:11.5px">Civil Option</div>
                        <div style="font-size:9.8px;color:var(--text-muted)">Analytic horizon</div>
                    </div>
                    <div class="operator-switch"></div>
                </div>
            </div>
        </div>

        <!-- CARD 2: RAYLEIGH, MIE & OZONE VERTICAL PROFILES -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Rayleigh, Mie & Ozone Optical Profiles</div>
                    <div class="bento-subtitle">Blue = Rayleigh (${A.RayleighScaleHeightKm.toFixed(1)}km) · Amber = Mie (${A.MieScaleHeightKm.toFixed(1)}km) · Mint = Ozone (${A.OzonePeakKm}km)</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <canvas class="diagram-canvas" id="atmosphereCurvesCanvas" height="128"></canvas>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Rayleigh ×</span><span class="slider-num-pill" id="lblRayMul">${A.RayleighMultiplier.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngRayMul" min="0.1" max="3.0" step="0.05" value="${A.RayleighMultiplier}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Scale H_R</span><span class="slider-num-pill" id="lblRayH">${A.RayleighScaleHeightKm.toFixed(1)} km</span></div>
                    <input type="range" class="editorial-range" id="rngRayH" min="2.0" max="16.0" step="0.2" value="${A.RayleighScaleHeightKm}" />
                </div>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Mie Haze ×</span><span class="slider-num-pill" id="lblMieMul">${A.MieMultiplier.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngMieMul" min="0.05" max="4.0" step="0.05" value="${A.MieMultiplier}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Anisotropy g</span><span class="slider-num-pill" id="lblMieG">${A.MiePhaseG.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngMieG" min="-0.50" max="0.95" step="0.01" value="${A.MiePhaseG}" />
                </div>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Scale H_M</span><span class="slider-num-pill" id="lblMieH">${A.MieScaleHeightKm.toFixed(2)} km</span></div>
                    <input type="range" class="editorial-range" id="rngMieH" min="0.3" max="5.0" step="0.1" value="${A.MieScaleHeightKm}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Ozone ×</span><span class="slider-num-pill" id="lblOzone">${A.OzoneMultiplier.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngOzone" min="0.0" max="3.0" step="0.05" value="${A.OzoneMultiplier}" />
                </div>
            </div>
        </div>

        <!-- CARD 3: TWILIGHT, TOP RADIUS & GROUND ALBEDO -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Atmosphere Extent, Twilight & Albedo</div>
                    <div class="bento-subtitle">Planet R_g = ${A.GroundRadiusKm} km · Top R_t = ${A.GroundRadiusKm + A.AtmosphereHeightKm} km</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Top Thickness</span><span class="slider-num-pill" id="lblAtmTop">${Math.round(A.AtmosphereHeightKm)} km</span></div>
                    <input type="range" class="editorial-range" id="rngAtmTop" min="50" max="140" step="2" value="${A.AtmosphereHeightKm}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Sky Brightness</span><span class="slider-num-pill" id="lblSkyBr">${A.SkyBrightness.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngSkyBr" min="0.2" max="2.5" step="0.05" value="${A.SkyBrightness}" />
                </div>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Twilight Glow</span><span class="slider-num-pill" id="lblTwi">${A.TwilightGlow.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngTwi" min="0.0" max="1.5" step="0.05" value="${A.TwilightGlow}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Ground Albedo</span><span class="slider-num-pill" id="lblAlbedo">${A.GroundAlbedo.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngAlbedo" min="0.0" max="0.9" step="0.02" value="${A.GroundAlbedo}" />
                </div>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Mie Absorption</span><span class="slider-num-pill" id="lblMieAbs">${A.MieAbsorptionMultiplier.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngMieAbs" min="0.0" max="3.0" step="0.05" value="${A.MieAbsorptionMultiplier}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Horizon White</span><span class="slider-num-pill" id="lblHorizW">${A.HorizonWhiteLine.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngHorizW" min="0.0" max="1.0" step="0.02" value="${A.HorizonWhiteLine}" />
                </div>
            </div>
        </div>
        `;

        const Stack = this.Dom.InspectorStack;
        Stack.querySelector("#bakeAtmosphereBtn").addEventListener("click", () =>
        {
            A.BakedSunDirection = [...this.SolarSolved.Direction];
            A.BakedRevision++;
            this.RenderAtmosphereInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#atmosPreviewStrip").addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-atmos-view]");
            if (!btn) return;
            A.PreviewMode = btn.dataset.atmosView;
            this.RenderAtmosphereInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#toggleBakedFetchTile").addEventListener("click", () =>
        {
            A.BakedFetchEnabled = !A.BakedFetchEnabled;
            this.RenderOutliner();
            this.RenderAtmosphereInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#toggleCivilTwilightTile").addEventListener("click", () =>
        {
            A.CivilTwilightEnabled = !A.CivilTwilightEnabled;
            A.HorizonWhiteLine = A.CivilTwilightEnabled ? 0.24 : 0.04;
            this.RenderAtmosphereInspector();
            this.RedrawActiveInfographics();
        });

        const BindAtm = (Sel, LblSel, Fmt, Apply) =>
        {
            const el = Stack.querySelector(Sel);
            if (!el) return;
            el.addEventListener("input", () =>
            {
                const v = Number(el.value);
                const lbl = Stack.querySelector(LblSel);
                if (lbl) lbl.textContent = Fmt(v);
                Apply(v);
                this.RenderOutliner();
                this.RedrawActiveInfographics();
            });
        };

        BindAtm("#rngRayMul", "#lblRayMul", (v) => v.toFixed(2), (v) => { A.RayleighMultiplier = v; });
        BindAtm("#rngRayH", "#lblRayH", (v) => `${v.toFixed(1)} km`, (v) => { A.RayleighScaleHeightKm = v; });
        BindAtm("#rngMieMul", "#lblMieMul", (v) => v.toFixed(2), (v) => { A.MieMultiplier = v; });
        BindAtm("#rngMieG", "#lblMieG", (v) => v.toFixed(2), (v) => { A.MiePhaseG = v; });
        BindAtm("#rngMieH", "#lblMieH", (v) => `${v.toFixed(2)} km`, (v) => { A.MieScaleHeightKm = v; });
        BindAtm("#rngOzone", "#lblOzone", (v) => v.toFixed(2), (v) => { A.OzoneMultiplier = v; });
        BindAtm("#rngAtmTop", "#lblAtmTop", (v) => `${Math.round(v)} km`, (v) => { A.AtmosphereHeightKm = v; });
        BindAtm("#rngSkyBr", "#lblSkyBr", (v) => v.toFixed(2), (v) => { A.SkyBrightness = v; });
        BindAtm("#rngTwi", "#lblTwi", (v) => v.toFixed(2), (v) => { A.TwilightGlow = v; });
        BindAtm("#rngAlbedo", "#lblAlbedo", (v) => v.toFixed(2), (v) => { A.GroundAlbedo = v; });
        BindAtm("#rngMieAbs", "#lblMieAbs", (v) => v.toFixed(2), (v) => { A.MieAbsorptionMultiplier = v; });
        BindAtm("#rngHorizW", "#lblHorizW", (v) => v.toFixed(2), (v) => { A.HorizonWhiteLine = v; });
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                           D. CLOUDS INSPECTOR
    //--------------------------------------------------------------------------------------------------------------------

    RenderCloudsInspector()
    {
        const Scope = this.CloudsParams.ActiveScope;
        const G = this.CloudsParams.Global;
        const L = this.CloudsParams.Local;
        const ActiveObj = Scope === "global" ? G : L;
        const CovPct = Math.round(ActiveObj.Coverage * 100);
        const Morphologies = ["cumulus", "stratocumulus", "cirrus", "cumulonimbus", "stratus", "altocumulus"];

        this.Dom.InspectorTitle.textContent = "Clouds Inspector";
        this.Dom.InspectorSubtitle.textContent = Scope === "global" ? "Global Volumetric Slab (World Z)" : "Local Volumetric Ellipsoid Box";
        this.Dom.InspectorStatus.textContent = `${CovPct}% Param`;
        this.Dom.InspectorStatus.className = "delta-pill live";

        this.Viewport.LocalCloudCage.visible = Scope === "local" && L.Enabled;

        this.Dom.InspectorStack.innerHTML = `
        <!-- CARD 1: SCOPE SWITCHER & OPERATOR TILES -->
        <div class="bento-card">
            <div class="pill-strip" id="cloudScopeStrip">
                <button class="pill-btn ${Scope === "global" ? "active" : ""}" data-cloud-scope="global">Global Cloud Slab</button>
                <button class="pill-btn ${Scope === "local" ? "active" : ""}" data-cloud-scope="local">Local Volume Box</button>
            </div>
            <div class="operator-tile-grid">
                <div class="operator-tile ${ActiveObj.Enabled ? "on" : ""}" id="toggleCloudEnabledTile">
                    <div>
                        <div style="font-weight:500;font-size:11.5px">Enabled</div>
                        <div style="font-size:9.8px;color:var(--text-muted)">Volumetric medium</div>
                    </div>
                    <div class="operator-switch"></div>
                </div>
                <div class="operator-tile ${ActiveObj.FollowWind ? "on" : ""}" id="toggleCloudWindTile">
                    <div>
                        <div style="font-weight:500;font-size:11.5px">Follow Wind</div>
                        <div style="font-size:9.8px;color:var(--text-muted)">Lattice advection</div>
                    </div>
                    <div class="operator-switch"></div>
                </div>
            </div>
        </div>

        <!-- CARD 2: CONTINUOUS TOP-DOWN DENSITY FIELD (1 - exp(-3 * rho)) -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Continuous Density Projection</div>
                    <div class="bento-subtitle">PCG 4-octave value-noise FBM · Display mapping 1 − exp(−3·ρ)</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="hero-metric-row">
                <div class="hero-number">${CovPct}<span class="muted-part">%</span><span class="unit-part">noise coverage parameter</span></div>
                <span class="delta-pill">g = ${ActiveObj.PhaseG.toFixed(2)}</span>
            </div>
            <canvas class="diagram-canvas" id="cloudDensityMaskCanvas" height="120"></canvas>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Coverage</span><span class="slider-num-pill" id="lblCloudCov">${CovPct}%</span></div>
                    <input type="range" class="editorial-range" id="rngCloudCov" min="0" max="100" step="1" value="${CovPct}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Density Scale</span><span class="slider-num-pill" id="lblCloudDens">${ActiveObj.DensityScale.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngCloudDens" min="0.1" max="3.0" step="0.05" value="${ActiveObj.DensityScale}" />
                </div>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Feature Scale</span><span class="slider-num-pill" id="lblCloudFeat">${ActiveObj.FeatureScale.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngCloudFeat" min="0.3" max="3.0" step="0.05" value="${ActiveObj.FeatureScale}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Anisotropy g</span><span class="slider-num-pill" id="lblCloudG">${ActiveObj.PhaseG.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngCloudG" min="-0.4" max="0.85" step="0.02" value="${ActiveObj.PhaseG}" />
                </div>
            </div>
        </div>

        ${Scope === "global" ? `
        <!-- CARD 3A: GLOBAL WORLD-Z SLAB & MORPHOLOGY -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">World-Z Altitude Slab & Cross-Section</div>
                    <div class="bento-subtitle">Effective top ${Math.round(Math.min(G.CeilingHeightM, G.BaseHeightM + G.ThicknessM))} m Z (Authored thickness ${Math.round(G.ThicknessM)} m)</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <canvas class="diagram-canvas" id="cloudSlabCanvas" height="124" title="Drag vertically to adjust Cloud Base World-Z in 100m steps"></canvas>
            <div class="chip-grid" id="cloudMorphGrid">
                ${Morphologies.map((m) => `<button class="choice-chip ${G.Morphology === m ? "active" : ""}" data-morph="${m}">
                    <span class="swatch-dot" style="background:var(--telemetry)"></span>
                    <span style="text-transform:capitalize">${m}</span>
                </button>`).join("")}
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Base World Z</span><span class="slider-num-pill" id="lblCloudBase">${Math.round(G.BaseHeightM)} m</span></div>
                    <input type="range" class="editorial-range" id="rngCloudBase" min="200" max="5000" step="100" value="${G.BaseHeightM}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Slab Thickness</span><span class="slider-num-pill" id="lblCloudThick">${Math.round(G.ThicknessM)} m</span></div>
                    <input type="range" class="editorial-range" id="rngCloudThick" min="200" max="3500" step="50" value="${G.ThicknessM}" />
                </div>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Ceiling Limit</span><span class="slider-num-pill" id="lblCloudCeil">${Math.round(G.CeilingHeightM)} m</span></div>
                    <input type="range" class="editorial-range" id="rngCloudCeil" min="800" max="6000" step="100" value="${G.CeilingHeightM}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Cb Anvil</span><span class="slider-num-pill" id="lblCloudAnvil">${G.AnvilAmount.toFixed(2)}</span></div>
                    <input type="range" class="editorial-range" id="rngCloudAnvil" min="0" max="1" step="0.02" value="${G.AnvilAmount}" />
                </div>
            </div>
        </div>` : `
        <!-- CARD 3B: LOCAL CLOUD WORLD BOUNDS & EXTENTS -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Local Volume World Bounds</div>
                    <div class="bento-subtitle">Dimensions ${(L.HalfExtentX * 2).toFixed(1)} × ${(L.HalfExtentY * 2).toFixed(1)} × ${(L.HalfExtentZ * 2).toFixed(1)} m · Emerald 3D cage active</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <canvas class="diagram-canvas" id="localCloudBoundsCanvas" height="114"></canvas>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Centre X</span><span class="slider-num-pill" id="lblLocCX">${L.CentreX.toFixed(2)} m</span></div>
                    <input type="range" class="editorial-range" id="rngLocCX" min="-4" max="4" step="0.1" value="${L.CentreX}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Centre Y (Z-Up)</span><span class="slider-num-pill" id="lblLocCY">${L.CentreY.toFixed(2)} m</span></div>
                    <input type="range" class="editorial-range" id="rngLocCY" min="0.4" max="5" step="0.1" value="${L.CentreY}" />
                </div>
            </div>
            <div class="slider-row">
                <div class="slider-top"><span class="slider-label">Centre Z</span><span class="slider-num-pill" id="lblLocCZ">${L.CentreZ.toFixed(2)} m</span></div>
                <input type="range" class="editorial-range" id="rngLocCZ" min="-4" max="4" step="0.1" value="${L.CentreZ}" />
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Half-Extent X</span><span class="slider-num-pill" id="lblLocHX">${L.HalfExtentX.toFixed(2)} m</span></div>
                    <input type="range" class="editorial-range" id="rngLocHX" min="0.2" max="4.0" step="0.1" value="${L.HalfExtentX}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Half-Extent Y</span><span class="slider-num-pill" id="lblLocHY">${L.HalfExtentY.toFixed(2)} m</span></div>
                    <input type="range" class="editorial-range" id="rngLocHY" min="0.2" max="2.5" step="0.05" value="${L.HalfExtentY}" />
                </div>
            </div>
            <div class="slider-row">
                <div class="slider-top"><span class="slider-label">Half-Extent Z</span><span class="slider-num-pill" id="lblLocHZ">${L.HalfExtentZ.toFixed(2)} m</span></div>
                <input type="range" class="editorial-range" id="rngLocHZ" min="0.2" max="4.0" step="0.1" value="${L.HalfExtentZ}" />
            </div>
        </div>`}

        <!-- CARD 4: WIND ADVECTION & SUPPLEMENTARY GPU CLOUD SHADOWS -->
        <div class="bento-card">
            <div class="bento-card-header">
                <div>
                    <div class="bento-title">Wind Vector & Supplementary GPU Shadows</div>
                    <div class="bento-subtitle">Separate ground cloud-shadow weather field</div>
                </div>
                <svg class="corner-arrow" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></svg>
            </div>
            <div class="bento-two-col">
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Wind X</span><span class="slider-num-pill" id="lblWindX">${ActiveObj.WindXMps.toFixed(1)} m/s</span></div>
                    <input type="range" class="editorial-range" id="rngWindX" min="-20" max="20" step="0.5" value="${ActiveObj.WindXMps}" />
                </div>
                <div class="slider-row">
                    <div class="slider-top"><span class="slider-label">Wind Y</span><span class="slider-num-pill" id="lblWindY">${ActiveObj.WindYMps.toFixed(1)} m/s</span></div>
                    <input type="range" class="editorial-range" id="rngWindY" min="-20" max="20" step="0.5" value="${ActiveObj.WindYMps}" />
                </div>
            </div>
            <div class="slider-row">
                <div class="slider-top"><span class="slider-label">GPU Shadow Opacity</span><span class="slider-num-pill" id="lblCloudShad">${G.ShadowStrength.toFixed(2)}</span></div>
                <input type="range" class="editorial-range" id="rngCloudShad" min="0" max="1" step="0.02" value="${G.ShadowStrength}" />
            </div>
        </div>
        `;

        const Stack = this.Dom.InspectorStack;
        Stack.querySelector("#cloudScopeStrip").addEventListener("click", (e) =>
        {
            const btn = e.target.closest("[data-cloud-scope]");
            if (!btn) return;
            this.CloudsParams.ActiveScope = btn.dataset.cloudScope;
            this.SelectedDirectoryId = this.CloudsParams.ActiveScope === "local" ? "celestial-clouds-local" : "celestial-clouds-global";
            this.RenderOutliner();
            this.RenderCloudsInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#toggleCloudEnabledTile").addEventListener("click", () =>
        {
            ActiveObj.Enabled = !ActiveObj.Enabled;
            this.RenderOutliner();
            this.RenderCloudsInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#toggleCloudWindTile").addEventListener("click", () =>
        {
            ActiveObj.FollowWind = !ActiveObj.FollowWind;
            this.RenderCloudsInspector();
            this.RedrawActiveInfographics();
        });

        Stack.querySelector("#rngCloudCov").addEventListener("input", (e) =>
        {
            ActiveObj.Coverage = Number(e.target.value) / 100.0;
            this.RenderCloudsInspector();
            this.RenderOutliner();
            this.RedrawActiveInfographics();
        });

        const BindCloud = (Sel, LblSel, Fmt, Apply) =>
        {
            const el = Stack.querySelector(Sel);
            if (!el) return;
            el.addEventListener("input", () =>
            {
                const v = Number(el.value);
                const lbl = Stack.querySelector(LblSel);
                if (lbl) lbl.textContent = Fmt(v);
                Apply(v);
                this.RenderOutliner();
                this.RedrawActiveInfographics();
            });
        };

        BindCloud("#rngCloudDens", "#lblCloudDens", (v) => v.toFixed(2), (v) => { ActiveObj.DensityScale = v; });
        BindCloud("#rngCloudFeat", "#lblCloudFeat", (v) => v.toFixed(2), (v) => { ActiveObj.FeatureScale = v; });
        BindCloud("#rngCloudG", "#lblCloudG", (v) => v.toFixed(2), (v) => { ActiveObj.PhaseG = v; });
        BindCloud("#rngWindX", "#lblWindX", (v) => `${v.toFixed(1)} m/s`, (v) => { ActiveObj.WindXMps = v; });
        BindCloud("#rngWindY", "#lblWindY", (v) => `${v.toFixed(1)} m/s`, (v) => { ActiveObj.WindYMps = v; });
        BindCloud("#rngCloudShad", "#lblCloudShad", (v) => v.toFixed(2), (v) => { G.ShadowStrength = v; });

        if (Scope === "global")
        {
            Stack.querySelector("#cloudMorphGrid").addEventListener("click", (e) =>
            {
                const btn = e.target.closest("[data-morph]");
                if (!btn) return;
                G.Morphology = btn.dataset.morph;
                this.RenderOutliner();
                this.RenderCloudsInspector();
                this.RedrawActiveInfographics();
            });
            BindCloud("#rngCloudBase", "#lblCloudBase", (v) => `${Math.round(v)} m`, (v) =>
            {
                G.BaseHeightM = Math.min(v, G.CeilingHeightM - 100);
            });
            BindCloud("#rngCloudThick", "#lblCloudThick", (v) => `${Math.round(v)} m`, (v) => { G.ThicknessM = v; });
            BindCloud("#rngCloudCeil", "#lblCloudCeil", (v) => `${Math.round(v)} m`, (v) =>
            {
                G.CeilingHeightM = v;
                if (G.BaseHeightM > v - 100) G.BaseHeightM = Math.max(100, v - 100);
            });
            BindCloud("#rngCloudAnvil", "#lblCloudAnvil", (v) => v.toFixed(2), (v) => { G.AnvilAmount = v; });

            // Draggable Cloud Base World-Z Diagram (100 m steps per CloudsNativePanel.md)
            const SlabCanvas = Stack.querySelector("#cloudSlabCanvas");
            SlabCanvas.addEventListener("pointerdown", (ev) =>
            {
                const Rect = SlabCanvas.getBoundingClientRect();
                const frac = 1.0 - Math.max(0, Math.min(1, (ev.clientY - Rect.top - 10) / Math.max(1, Rect.height - 26)));
                const snapped = Math.round((frac * 6000) / 100) * 100;
                G.BaseHeightM = Math.max(200, Math.min(G.CeilingHeightM - 100, snapped));
                this.RenderOutliner();
                this.RenderCloudsInspector();
                this.RedrawActiveInfographics();
            });
        }
        else
        {
            BindCloud("#rngLocCX", "#lblLocCX", (v) => `${v.toFixed(2)} m`, (v) => { L.CentreX = v; });
            BindCloud("#rngLocCY", "#lblLocCY", (v) => `${v.toFixed(2)} m`, (v) => { L.CentreY = v; });
            BindCloud("#rngLocCZ", "#lblLocCZ", (v) => `${v.toFixed(2)} m`, (v) => { L.CentreZ = v; });
            BindCloud("#rngLocHX", "#lblLocHX", (v) => `${v.toFixed(2)} m`, (v) => { L.HalfExtentX = v; });
            BindCloud("#rngLocHY", "#lblLocHY", (v) => `${v.toFixed(2)} m`, (v) => { L.HalfExtentY = v; });
            BindCloud("#rngLocHZ", "#lblLocHZ", (v) => `${v.toFixed(2)} m`, (v) => { L.HalfExtentZ = v; });
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                          INFOGRAPHIC CANVAS REDRAW
    //--------------------------------------------------------------------------------------------------------------------

    RedrawActiveInfographics()
    {
        const Accent = this.GetAccentHex();
        const Stack = this.Dom.InspectorStack;
        if (this.ActiveInspector === "fracture" && this.Partition)
        {
            const Entry = this.GetActiveConstruct();
            if (this.Partition.EngineeringReport)
            {
                DrawEngineeringStressSliceCanvas(Stack.querySelector("#engineeringStressCanvas"), this.Partition.EngineeringReport, Accent);
            }
            DrawGriffithWaveformDiagram(Stack.querySelector("#griffithWaveformCanvas"), this.Partition, Entry.Spec, Accent);
            DrawPolarAnisotropyRadar(Stack.querySelector("#polarAnisotropyCanvas"), this.Partition.MaterialSpec, Entry.Spec.GrainAngleDeg, Accent);
            DrawPieceSdfSliceCanvas(Stack.querySelector("#pieceSdfSliceCanvas"), this.Partition.Fragments, this.Viewport.SdfSliceY, Entry.Spec.SdfResolution, Entry.Spec.PieceSdf);
        }
        else if (this.ActiveInspector === "sun")
        {
            DrawSolarDiurnalArcCanvas(Stack.querySelector("#solarDiurnalCanvas"), this.SunParams, this.SolarSolved, Accent);
            DrawSunDiscPreviewCanvas(Stack.querySelector("#sunDiscPreviewCanvas"), this.SunParams);
            DrawObserverWorldMapCanvas(Stack.querySelector("#observerMapCanvas"), this.SunParams.LatitudeDeg, this.SunParams.LongitudeDeg, Accent);
        }
        else if (this.ActiveInspector === "atmosphere")
        {
            DrawAtmosphereLutCanvas(Stack.querySelector("#atmosphereLutCanvas"), this.AtmosParams, this.SunParams, this.SolarSolved);
            DrawAtmosphereDensityCurvesCanvas(Stack.querySelector("#atmosphereCurvesCanvas"), this.AtmosParams, Accent);
        }
        else if (this.ActiveInspector === "clouds")
        {
            DrawCloudDensityMaskCanvas(Stack.querySelector("#cloudDensityMaskCanvas"), this.CloudsParams);
            if (this.CloudsParams.ActiveScope === "global")
            {
                DrawCloudAltitudeSlabCanvas(Stack.querySelector("#cloudSlabCanvas"), this.CloudsParams, Accent);
            }
            else
            {
                DrawLocalCloudBoundsCanvas(Stack.querySelector("#localCloudBoundsCanvas"), this.CloudsParams.Local, "#38B28B");
            }
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                           MAIN ANIMATION LOOP
    //--------------------------------------------------------------------------------------------------------------------

    StartAnimationLoop()
    {
        let LastStamp = performance.now();
        let FrameAccum = 0, FrameCount = 0;

        const StepFrame = (Now) =>
        {
            const Dt = Math.min(0.05, Math.max(0.001, (Now - LastStamp) / 1000.0));
            LastStamp = Now;

            // Advance timeline playback
            if (this.Timeline.Playing)
            {
                this.Timeline.ActiveTime += Dt * this.Timeline.PlaybackRate;
                if (this.Timeline.ActiveTime >= this.Timeline.DurationSeconds)
                {
                    this.Timeline.ActiveTime = this.Timeline.DurationSeconds;
                    this.Timeline.Playing = false;
                    this.UpdatePlayButtonIcon();
                }
                this.SyncViewportSample();
            }

            // Advance animated Solar Day Cycle if active
            if (this.SunParams.AnimateCycle)
            {
                this.SunParams.LocalHours = (this.SunParams.LocalHours + Dt * 0.65 * this.SunParams.CycleSpeed) % 24.0;
                this.SolarSolved = EvaluateSolarEphemeris(this.SunParams);
                if (this.ActiveInspector === "sun")
                {
                    const rng = this.Dom.InspectorStack.querySelector("#rngSunHours");
                    if (rng) rng.value = String(this.SunParams.LocalHours);
                    DrawSolarDiurnalArcCanvas(this.Dom.InspectorStack.querySelector("#solarDiurnalCanvas"), this.SunParams, this.SolarSolved, this.GetAccentHex());
                }
            }

            // Update 3D Sky + Atmosphere + Clouds + Directional Sun Light
            this.Viewport.UpdateEnvironmentUniforms(this.SunParams, this.SolarSolved, this.AtmosParams, this.CloudsParams, Dt);
            this.Viewport.RenderFrame();

            // Project 3D Impact Locus to floating 2D Reticle Bracket HUD
            const ScreenPos = this.Viewport.ProjectImpactScreenCoordinates();
            const ShowReticle = ScreenPos.visible && this.Timeline.ActiveTime < 0.45 && this.Timeline.ExplodeAmount < 0.35 && !this.SolverDrawerOpen;
            this.Dom.ReticleHud.style.opacity = ShowReticle ? "1" : "0";
            this.Dom.ReticleHud.style.left = `${ScreenPos.x.toFixed(1)}px`;
            this.Dom.ReticleHud.style.top = `${ScreenPos.y.toFixed(1)}px`;

            FrameAccum += Dt;
            FrameCount++;
            if (FrameAccum >= 0.6)
            {
                const Fps = Math.round(FrameCount / FrameAccum);
                const Badge = this.Root.querySelector("#fpsBadge");
                if (Badge) Badge.textContent = `${Fps} Hz`;
                FrameAccum = 0;
                FrameCount = 0;
            }

            this.AnimationHandle = requestAnimationFrame(StepFrame);
        };

        this.AnimationHandle = requestAnimationFrame(StepFrame);
    }
}

// Auto-mount when loaded in browser
if (typeof document !== "undefined")
{
    const Boot = () =>
    {
        const MountTarget = document.getElementById("frontierWorkspaceRoot");
        if (MountTarget && !MountTarget.dataset.mounted)
        {
            MountTarget.dataset.mounted = "true";
            window.__FrontierWorkspace = new FractureWorkspaceApplication(MountTarget);
        }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", Boot);
    else Boot();
}
