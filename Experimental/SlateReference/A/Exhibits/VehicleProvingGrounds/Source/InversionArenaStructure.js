//============================================================================================================================================
//                                                       INVERSIONARENASTRUCTURE.JS
//============================================================================================================================================
// 🧩 Inversion Arena — Multi-Track Open-World Stunt Complex ([Track A] + [Track B] + [Track C]):
//    • [Track A · Grand Prix Circuit] (preserved intact): 1.05 km stunt circuit + central infield stunt expressway
//      (360° Helical Loop, Camelback Waves, Skyline Tabletop, Twin 47° Velodrome Bowls, Heartline S-Bridge, 360° Full-Pipe,
//       Twin-Wing ±38° Split Canyon, Twin 45° Spine Gap, Whale-Tail Step-Up & 125° Over-Vert Cradle).
//    • [Track B · Subterranean Over/Under Wing] (North): Split Over/Under fork (5.2 m-deep Roofed Underground Subway Tunnel +
//      5.0 m Sky-Bridge Overpass + Ground-Level Underpass Boulevard), Serpentine ±28° Banked Waves & Proximity Linear Bollard Gate.
//    • [Track C · Kinetic Wave & Crossover Wing] (South): 84 m Travelling-Wave Kinetic Bollard Strip (one side/end rising while
//      opposite sinks), 9.8 m Over/Under Viaduct Bridge & Sunken Canyon Underpass, Westbound 360° Loop & 48° Steep Corkscrew Wing.

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitQuad, EmitBoxFacets } from "./CourseStructure.js";
import { ConstructHelicalLoopSurface, ConstructFullPipeSurface, ConstructTwistedRibbonSurface,
         ConstructTransitionRampSurface, ConstructWaveDeckSurface, ConstructTabletopRampSurface,
         ConstructBankedTurnSurface, ConstructHeartlineRibbonSurface,
         ConstructSubmergedTrenchSurface, ConstructSerpentineWaveSurface,
         ConstructCollapseDeckSurface, ConstructSurfaceSegmentDescriptors } from "./RampSurfaceProjection.js";
import { ConstructCollapseProxyShapes } from "./CollapseSequence.js";
import { ConstructTramShapes } from "./TramSequence.js";

//------------------------------------------------------------------------------------------------------------------------
//                                    MULTI-TRACK COMPLEX BOUNDS & TRACK CATALOG
//------------------------------------------------------------------------------------------------------------------------

export const InversionArenaBounds = Object.freeze({
    Minimum: Object.freeze([-156.0, -364.0]),
    Maximum: Object.freeze([ 222.0,  364.0])
});

export const InversionArenaTracks = Object.freeze([
    {
        Id:       "trackA",
        Label:    "Track A · Grand Prix",
        Name:     "Track A — Grand Prix Stunt Circuit",
        Icon:     "Flag",
        Position: [-88.0, -38.3],
        Yaw:      0.0,
        Note:     "Original 1.05 km Loop → Waves → Tabletop → Heartline → Full-Pipe circuit"
    },
    {
        Id:       "trackB",
        Label:    "Track B · Split & Tunnel",
        Name:     "Track B — Underground Split & Linear Bollards",
        Icon:     "ArrowDownUp",
        Position: [-86.0,  94.0],
        Yaw:      0.0,
        Note:     "Split Over/Under (-5.2 m Subway Tunnel vs +5.0 m Sky-Bridge) & Linear Bollards"
    },
    {
        Id:       "trackC",
        Label:    "Track C · Wave & Viaduct",
        Name:     "Track C — Kinetic Wave Bollards & Over/Under Viaduct",
        Icon:     "Activity",
        Position: [-98.0, -94.0],
        Yaw:      0.0,
        Note:     "84 m Travelling-Wave Bollards → Viaduct Over/Under Canyon → Westbound 360° Loop"
    },
    {
        Id:       "trackD",
        Label:    "Track D · Collapse Run",
        Name:     "Track D — Collapsing Sky-Bridge & Faultline Road",
        Icon:     "Zap",
        Position: [-92.0, -250.0],
        Yaw:      0.0,
        Note:     "Rear-to-front Collapsing Bridge (+5 m) & Sinkhole Road (0 m) with unique movie cracks & sand"
    },
    {
        Id:       "trackE",
        Label:    "Track E · 3-Lane Subway",
        Name:     "Track E — 3-Lane Center-Portal Subway Boulevard",
        Icon:     "GitFork",
        Position: [-104.0,  256.0],
        Yaw:      0.0,
        Note:     "[road][tunnel down][road] → [road][road][road] → [road][tunnel up][road]"
    },
    {
        Id:       "trackF",
        Label:    "Track F · Trams & Trains",
        Name:     "Track F — Streetcar Trams & Express Rail Traffic",
        Icon:     "Compass",
        Position: [-98.0,  314.0],
        Yaw:      0.0,
        Note:     "Dedicated 4-track transit corridor with live articulated trams & 3-car express trains"
    }
]);

//------------------------------------------------------------------------------------------------------------------------
//                                        3D ANALYTIC TRACK & STUNT SURFACES
//------------------------------------------------------------------------------------------------------------------------

export const InversionArenaSurfaces = Object.freeze([
    // ===================================================================================================================
    // [TRACK A] ORIGINAL GRAND PRIX STUNT CIRCUIT & CENTRAL INFIELD EXPRESSWAY (100% PRESERVED)
    // ===================================================================================================================

    // ① Sector 1 (Outbound Straight): 18 m-tall 360° Helical Inversion Loop right off the Starting Grid
    ConstructHelicalLoopSurface({
        Key:            "HelicalLoop",
        ShapePrefix:    "GrandPrixLoop",
        Origin:         [-20.0, -38.3, 0.0],
        Yaw:            0.0,
        Radius:         8.8,
        Width:          11.4,
        HelicalShift:   8.6,
        Thickness:      0.66,
        KerbWidth:      0.65,
        KerbHeight:     0.32,
        AccentMaterial: CourseMaterial.PaintYellow
    }),

    // ② Sector 2 (Outbound Straight): 64 m Triple-Crest Sinusoidal Camelback Wave Roller Bridge
    ConstructWaveDeckSurface({
        Key:            "CamelbackWaves",
        ShapePrefix:    "CamelbackWaves",
        Origin:         [42.0, -29.7, 0.0],
        Yaw:            0.0,
        Length:         64.0,
        Width:          14.5,
        WaveCount:      3,
        Amplitude:      0.92,
        Thickness:      0.56,
        AccentMaterial: CourseMaterial.PaintBlue
    }),

    // ③ Sector 3 (Outbound Straight): 54 m Skyline Asymmetric Tabletop Mega-Jump before Turn 1
    ConstructTabletopRampSurface({
        Key:            "SkylineTabletop",
        ShapePrefix:    "SkylineTabletop",
        Origin:         [90.0, -29.7, 0.0],
        Yaw:            0.0,
        UpLength:       18.0,
        DeckLength:     12.0,
        DownLength:     24.0,
        Height:         3.30,
        Width:          14.5,
        Thickness:      0.62,
        AccentMaterial: CourseMaterial.KerbRed
    }),

    // ④ Turn 1 ("Thunderdome" East Hairpin): 180° Progressive Parabolic 47° Velodrome Bowl + C² Wall-Ride Coping
    ConstructBankedTurnSurface({
        Key:            "EastVelodromeBowl",
        ShapePrefix:    "VelodromeBowl",
        Origin:         [164.0, 0.0, 0.0],
        StartAngle:     -0.5 * Math.PI,
        SweepAngle:     Math.PI,
        InnerRadius:    24.0,
        OuterRadius:    46.0,
        RampAngle:      0.15 * Math.PI,
        MinimumSlope:   0.25,
        PeakSlope:      1.08,
        CopingWidth:    3.4,
        CopingLift:     2.2,
        Thickness:      0.68,
        AccentMaterial: CourseMaterial.PaintYellow
    }),

    // ⑤ Sector 4 (North Return Straight, Westbound): 84 m Zero-G Heartline S-Twist Sky-Bridge (+35° -> 0° -> −35°)
    ConstructHeartlineRibbonSurface({
        Key:            "HeartlineSwitchback",
        ShapePrefix:    "HeartlineSwitchback",
        Origin:         [110.0, 35.0, 0.0],
        Yaw:            Math.PI,
        Length:         84.0,
        Width:          13.8,
        BridgeHeight:   3.70,
        PeakAngle:      (35.0 * Math.PI) / 180.0,
        RampFraction:   0.22,
        CrossFraction:  0.26,
        Thickness:      0.60,
        AccentMaterial: CourseMaterial.PaintBlue
    }),

    // ⑥ Sector 5 (North Return Straight, Westbound): 56 m × 13.2 m Neon 360° Corkscrew Full-Pipe Tunnel + 45° Skirts
    ConstructFullPipeSurface({
        Key:            "FullPipe",
        Origin:         [26.0, 35.0, 0.0],
        Yaw:            Math.PI,
        Radius:         6.6,
        Length:         56.0,
        Thickness:      0.70,
        SkirtRadius:    6.8,
        SkirtAngle:     Math.PI * 0.25
    }),

    // ⑦ Sector 6 (North Return Straight, Westbound): 62 m Twin-Wing ±38° V-Camber Split Canyon (Infield + Stadium Wings)
    ConstructTwistedRibbonSurface({
        Key:            "TwinWingInfield",
        ShapePrefix:    "TwinWing38",
        Origin:         [-47.0, 25.8, 0.0],
        Yaw:            0.0,
        Length:         62.0,
        Width:          9.0,
        TwistLength:    20.0,
        PeakAngle:      (38.0 * Math.PI) / 180.0,
        BankSign:       1.0,
        Thickness:      0.58,
        AccentMaterial: CourseMaterial.PaintGreen
    }),
    ConstructTwistedRibbonSurface({
        Key:            "TwinWingOuter",
        ShapePrefix:    "TwinWing38",
        Origin:         [-47.0, 44.2, 0.0],
        Yaw:            Math.PI,
        Length:         62.0,
        Width:          9.0,
        TwistLength:    20.0,
        PeakAngle:      (38.0 * Math.PI) / 180.0,
        BankSign:       1.0,
        Thickness:      0.58,
        AccentMaterial: CourseMaterial.PaintYellow
    }),

    // ⑧ Turn 2 ("Sunset Slingshot" West Hairpin): 180° Progressive 47° Banked Bowl back onto the Start/Finish Straight
    ConstructBankedTurnSurface({
        Key:            "WestSlingshotBowl",
        ShapePrefix:    "VelodromeBowl",
        Origin:         [-96.0, 0.0, 0.0],
        StartAngle:     0.5 * Math.PI,
        SweepAngle:     Math.PI,
        InnerRadius:    24.0,
        OuterRadius:    46.0,
        RampAngle:      0.15 * Math.PI,
        MinimumSlope:   0.25,
        PeakSlope:      1.08,
        CopingWidth:    3.4,
        CopingLift:     2.2,
        Thickness:      0.68,
        AccentMaterial: CourseMaterial.PaintYellow
    }),

    // ⑨ Infield Stunt Expressway West: Twin 45° Skate Spine Aerial Gap over glowing target bullseye
    ConstructTransitionRampSurface({
        Key:            "LaunchSpine45",
        ShapePrefix:    "Spine45",
        Origin:         [-44.0, 0.0, 0.0],
        Yaw:            0.0,
        Radius:         12.0,
        Width:          13.0,
        MaximumAngle:   Math.PI * 0.25,
        Extension:      2.2,
        Thickness:      0.66,
        AccentMaterial: CourseMaterial.KerbRed
    }),
    ConstructTransitionRampSurface({
        Key:            "LandingSpine45",
        ShapePrefix:    "Spine45",
        Origin:         [-8.0, 0.0, 0.0],
        Yaw:            Math.PI,
        Radius:         12.0,
        Width:          13.0,
        MaximumAngle:   Math.PI * 0.25,
        Extension:      2.2,
        Thickness:      0.66,
        AccentMaterial: CourseMaterial.PaintGreen
    }),

    // ⑩ Infield Stunt Expressway Centre: 50 m High-Altitude Whale-Tail Step-Up Kicker (4.5 m sky deck)
    ConstructTabletopRampSurface({
        Key:            "WhaleTailStepUp",
        ShapePrefix:    "WhaleTailStepUp",
        Origin:         [22.0, 0.0, 0.0],
        Yaw:            0.0,
        UpLength:       16.0,
        DeckLength:     14.0,
        DownLength:     20.0,
        Height:         4.50,
        Width:          13.0,
        Thickness:      0.64,
        AccentMaterial: CourseMaterial.PaintBlue
    }),

    // ⑪ Infield Stunt Expressway East Finale: 22 m-wide 125° Over-Vert Inversion Cradle
    ConstructTransitionRampSurface({
        Key:            "OverVertCradle125",
        Origin:         [124.0, 0.0, 0.0],
        Yaw:            0.0,
        Radius:         10.5,
        Width:          22.0,
        MaximumAngle:   (125.0 * Math.PI) / 180.0,
        Extension:      0.0,
        Thickness:      0.70,
        AccentMaterial: CourseMaterial.PaintBlue
    }),

    // ===================================================================================================================
    // [TRACK B · NORTH WING] SPLIT OVER/UNDER SUBTERRANEAN TUNNEL + SKY-BRIDGE + UNDERPASS + SERPENTINE WAVES
    // ===================================================================================================================

    // ⑫ Track B Split Lower Fork: 92 m Excavated Underground Subway Tunnel (-5.2 m deep, roofed under ground boulevard!)
    ConstructSubmergedTrenchSurface({
        Key:                "TrackBSubwayTunnel",
        ShapePrefix:        "SubwayTrench52",
        Origin:             [-36.0, 84.0, 0.0],
        Yaw:                0.0,
        DownLength:         24.0,
        TunnelLength:       44.0,
        UpLength:           24.0,
        Width:              13.6,
        Depth:              5.20,
        Roofed:             true,
        GroundDeckOverRoof: true,
        AccentMaterial:     CourseMaterial.GateLamp
    }),

    // ⑬ Track B Split Upper Fork: 108 m Elevated Sky-Bridge Overpass (+5.0 m deck spanning over the ground Underpass road!)
    ConstructTabletopRampSurface({
        Key:            "TrackBSkyBridge",
        ShapePrefix:    "SkyBridge50",
        Origin:         [-44.0, 104.0, 0.0],
        Yaw:            0.0,
        UpLength:       26.0,
        DeckLength:     56.0,
        DownLength:     26.0,
        Height:         5.00,
        Width:          14.0,
        Thickness:      0.62,
        AccentMaterial: CourseMaterial.PaintYellow
    }),

    // ⑭ Track B East Hairpin: 180° Superelevated Bowl turning West onto Track B Return Straight
    ConstructBankedTurnSurface({
        Key:            "TrackBEastBowl",
        ShapePrefix:    "VelodromeBowl",
        Origin:         [156.0, 130.0, 0.0],
        StartAngle:     -0.5 * Math.PI,
        SweepAngle:     Math.PI,
        InnerRadius:    24.0,
        OuterRadius:    46.0,
        RampAngle:      0.15 * Math.PI,
        MinimumSlope:   0.25,
        PeakSlope:      1.08,
        CopingWidth:    3.4,
        CopingLift:     2.2,
        Thickness:      0.68,
        AccentMaterial: CourseMaterial.PaintBlue
    }),

    // ⑮ Track B North Return Straight: 72 m Serpentine Alternating-Camber Banked Rhythm Rollers (±28°)
    ConstructSerpentineWaveSurface({
        Key:            "TrackBSerpentineWave",
        ShapePrefix:    "SerpentineWave72",
        Origin:         [104.0, 166.0, 0.0],
        Yaw:            Math.PI,
        Length:         72.0,
        Width:          14.5,
        WaveCount:      3,
        Amplitude:      0.92,
        PeakAngle:      (28.0 * Math.PI) / 180.0,
        Thickness:      0.58,
        AccentMaterial: CourseMaterial.PaintGreen
    }),

    // ⑯ Track B West Return Hairpin: 180° Bowl feeding back into Split Fork & West Inter-Track Boulevard
    ConstructBankedTurnSurface({
        Key:            "TrackBWestBowl",
        ShapePrefix:    "VelodromeBowl",
        Origin:         [-96.0, 130.0, 0.0],
        StartAngle:     0.5 * Math.PI,
        SweepAngle:     Math.PI,
        InnerRadius:    24.0,
        OuterRadius:    46.0,
        RampAngle:      0.15 * Math.PI,
        MinimumSlope:   0.25,
        PeakSlope:      1.08,
        CopingWidth:    3.4,
        CopingLift:     2.2,
        Thickness:      0.68,
        AccentMaterial: CourseMaterial.PaintYellow
    }),

    // ===================================================================================================================
    // [TRACK C · SOUTH WING] KINETIC WAVE BOLLARDS + VIADUCT OVER/UNDER CANYON + WESTBOUND 360° LOOP & STEEP WING
    // ===================================================================================================================

    // ⑰ Track C Outbound Viaduct Bridge (+5.0 m sky span crossing at 90° OVER the sunken Canyon Underpass!)
    ConstructTabletopRampSurface({
        Key:            "TrackCViaductBridge",
        ShapePrefix:    "SkyBridge50",
        Origin:         [24.0, -94.0, 0.0],
        Yaw:            0.0,
        UpLength:       26.0,
        DeckLength:     56.0,
        DownLength:     26.0,
        Height:         5.00,
        Width:          14.0,
        Thickness:      0.62,
        AccentMaterial: CourseMaterial.KerbRed
    }),

    // ⑱ Inter-Track South Canyon Underpass (-5.2 m sunken open-cut tunnel diving right UNDER TrackCViaductBridge!)
    ConstructSubmergedTrenchSurface({
        Key:                "TrackCUnderpassTunnel",
        ShapePrefix:        "SubwayTrench52",
        Origin:             [78.0, -56.0, 0.0],
        Yaw:                -0.5 * Math.PI,
        DownLength:         24.0,
        TunnelLength:       44.0,
        UpLength:           24.0,
        Width:              13.6,
        Depth:              5.20,
        Roofed:             false,
        GroundDeckOverRoof: false,
        AccentMaterial:     CourseMaterial.PaintYellow
    }),

    // ⑲ Track C East Hairpin: 180° Superelevated Bowl onto South Mega-Stunt Backstretch
    ConstructBankedTurnSurface({
        Key:            "TrackCEastBowl",
        ShapePrefix:    "VelodromeBowl",
        Origin:         [156.0, -130.0, 0.0],
        StartAngle:     -0.5 * Math.PI,
        SweepAngle:     Math.PI,
        InnerRadius:    24.0,
        OuterRadius:    46.0,
        RampAngle:      0.15 * Math.PI,
        MinimumSlope:   0.25,
        PeakSlope:      1.08,
        CopingWidth:    3.4,
        CopingLift:     2.2,
        Thickness:      0.68,
        AccentMaterial: CourseMaterial.KerbRed
    }),

    // ⑳ Track C South Backstretch (Westbound): 18 m-tall Crimson 360° Helical Inversion Loop
    ConstructHelicalLoopSurface({
        Key:            "TrackCHelicalLoop",
        ShapePrefix:    "GrandPrixLoop",
        Origin:         [108.0, -162.0, 0.0],
        Yaw:            Math.PI,
        Radius:         8.8,
        Width:          11.4,
        HelicalShift:   8.6,
        Thickness:      0.66,
        KerbWidth:      0.65,
        KerbHeight:     0.32,
        AccentMaterial: CourseMaterial.KerbRed
    }),

    // ㉑ Track C South Backstretch: 56 m Extreme 46° Steep Corkscrew Wall-Ride Ribbon
    ConstructTwistedRibbonSurface({
        Key:            "TrackCCorkscrewWing",
        ShapePrefix:    "SteepWing46",
        Origin:         [36.0, -175.0, 0.0],
        Yaw:            Math.PI,
        Length:         56.0,
        Width:          11.0,
        TwistLength:    18.0,
        PeakAngle:      (46.0 * Math.PI) / 180.0,
        BankSign:       1.0,
        Thickness:      0.60,
        AccentMaterial: CourseMaterial.PaintBlue
    }),

    // ㉒ Track C South Backstretch: 72 m Serpentine Alternating-Camber Wave Rollers
    ConstructSerpentineWaveSurface({
        Key:            "TrackCSerpentineWave",
        ShapePrefix:    "SerpentineWave72",
        Origin:         [-38.0, -166.0, 0.0],
        Yaw:            Math.PI,
        Length:         72.0,
        Width:          14.5,
        WaveCount:      3,
        Amplitude:      0.92,
        PeakAngle:      (28.0 * Math.PI) / 180.0,
        Thickness:      0.58,
        AccentMaterial: CourseMaterial.PaintYellow
    }),

    // ㉓ Track C West Slingshot Hairpin: 180° Bowl back onto the Kinetic Wave Bollard Avenue & West Connector
    ConstructBankedTurnSurface({
        Key:            "TrackCWestBowl",
        ShapePrefix:    "VelodromeBowl",
        Origin:         [-96.0, -130.0, 0.0],
        StartAngle:     0.5 * Math.PI,
        SweepAngle:     Math.PI,
        InnerRadius:    24.0,
        OuterRadius:    46.0,
        RampAngle:      0.15 * Math.PI,
        MinimumSlope:   0.25,
        PeakSlope:      1.08,
        CopingWidth:    3.4,
        CopingLift:     2.2,
        Thickness:      0.68,
        AccentMaterial: CourseMaterial.PaintGreen
    }),

    // ===================================================================================================================
    // [TRACK D · SEISMIC COLLAPSE WING] REAR-TO-FRONT COLLAPSING SKY-BRIDGE (+5.0 m) & COLLAPSING SINKHOLE ROAD (0.0 m)
    // ===================================================================================================================

    // ㉔ Collapsing Sky-Bridge (Eastbound at Y = -250.0, X: -52 -> +112, 112 m fracturing elevated span at Z = +5.0 m)
    ConstructCollapseDeckSurface({
        Key:            "CollapseSkyBridge",
        ShapePrefix:    "SkyBridge50",
        Origin:         [-52.0, -250.0, 0.0],
        Yaw:            0.0,
        UpLength:       26.0,
        DeckLength:     112.0,
        DownLength:     26.0,
        Height:         5.00,
        Width:          14.0,
        Thickness:      0.62,
        BayCount:       14,
        ChasmDepth:     5.00,
        AccentMaterial: CourseMaterial.PaintYellow
    }),

    // ㉕ Track D East Turnaround Bowl (sweeps Y = -250 Eastbound around onto Y = -318 Westbound Collapse Road)
    ConstructBankedTurnSurface({
        Key:            "TrackDEastBowl",
        ShapePrefix:    "VelodromeBowl",
        Origin:         [156.0, -284.0, 0.0],
        StartAngle:     -0.5 * Math.PI,
        SweepAngle:     Math.PI,
        InnerRadius:    24.0,
        OuterRadius:    46.0,
        RampAngle:      0.15 * Math.PI,
        MinimumSlope:   0.25,
        PeakSlope:      1.08,
        CopingWidth:    3.4,
        CopingLift:     2.2,
        Thickness:      0.68,
        AccentMaterial: CourseMaterial.BannerAmber
    }),

    // ㉖ Subterranean Sand Sinkhole Chasm directly beneath Collapsing Road (X: +56 -> -56, -5.20 m floor + escape ramps!)
    ConstructSubmergedTrenchSurface({
        Key:                "CollapseSinkholeChasm",
        ShapePrefix:        "SubwayTrench52",
        Origin:             [56.0, -318.0, 0.0],
        Yaw:                Math.PI,
        DownLength:         12.0,
        TunnelLength:       88.0,
        GalleryTileLength:  44.0,
        UpLength:           12.0,
        Width:              13.6,
        Depth:              5.20,
        Roofed:             false,
        GroundDeckOverRoof: false,
        AccentMaterial:     CourseMaterial.BannerAmber
    }),

    // ㉗ Collapsing Faultline Road (Westbound at Y = -318.0, X: +56 -> -56, flush Z = 0.0 m highway over the -5.2 m chasm!)
    ConstructCollapseDeckSurface({
        Key:            "CollapseSinkholeRoad",
        ShapePrefix:    "SkyBridge50",
        Origin:         [56.0, -318.0, 0.0],
        Yaw:            Math.PI,
        UpLength:       0.0,
        DeckLength:     112.0,
        DownLength:     0.0,
        Height:         0.0,
        Width:          14.8,
        Thickness:      0.62,
        BayCount:       14,
        ChasmDepth:     5.20,
        AccentMaterial: CourseMaterial.KerbRed
    }),

    // ㉘ Track D West Turnaround Bowl
    ConstructBankedTurnSurface({
        Key:            "TrackDWestBowl",
        ShapePrefix:    "VelodromeBowl",
        Origin:         [-96.0, -284.0, 0.0],
        StartAngle:     0.5 * Math.PI,
        SweepAngle:     Math.PI,
        InnerRadius:    24.0,
        OuterRadius:    46.0,
        RampAngle:      0.15 * Math.PI,
        MinimumSlope:   0.25,
        PeakSlope:      1.08,
        CopingWidth:    3.4,
        CopingLift:     2.2,
        Thickness:      0.68,
        AccentMaterial: CourseMaterial.PaintYellow
    }),

    // ===================================================================================================================
    // [TRACK E · 3-LANE SUBWAY BOULEVARD] [road][tunnel down][road] -- [road][road][road] -- [road][tunnel up][road]
    // ===================================================================================================================

    // ㉙ Centre Subway Portal & Underground Station Gallery flanked by continuous Z = 0 Left & Right surface [road] lanes!
    ConstructSubmergedTrenchSurface({
        Key:                "SubwayThreeLaneCenter",
        ShapePrefix:        "SubwayTrench52",
        Origin:             [-68.0, 256.0, 0.0],
        Yaw:                0.0,
        DownLength:         24.0,
        TunnelLength:       88.0,
        GalleryTileLength:  44.0,
        UpLength:           24.0,
        Width:              13.6,
        Depth:              5.20,
        Roofed:             true,
        GroundDeckOverRoof: true,
        AccentMaterial:     CourseMaterial.GateLamp
    })
]);

const SegmentBundle = ConstructSurfaceSegmentDescriptors(InversionArenaSurfaces);

export const InversionPhysicsCutouts = Object.freeze(
    InversionArenaSurfaces.flatMap((Surface) => Surface.PhysicsCutouts || [])
);

export const InversionDistanceCutouts = Object.freeze(
    InversionArenaSurfaces.filter((Surface) => Surface.DistanceCutout).map((Surface) => Surface.DistanceCutout)
);

const VisualGroundCutouts = InversionArenaSurfaces.flatMap((Surface) => Surface.VisualCutouts || []);

export const InversionArenaShapes = Object.freeze({
    ...SegmentBundle.Shapes,
    ...ConstructCollapseProxyShapes(),
    ...ConstructTramShapes(),
    LoopPylon:         { Emit: () => EmitBoxFacets(0.85,  0.85, 18.8, CourseMaterial.SteelDark),      Voxel: 0.25, Cards: 0, Distance: false },
    LoopCrossBeam:     { Emit: () => EmitBoxFacets(0.80, 23.60,  0.75, CourseMaterial.SteelDark),     Voxel: 0.18, Cards: 0, Distance: false },
    LoopCrownLamp:     { Emit: () => EmitBoxFacets(0.45,  9.20,  0.16, CourseMaterial.GateLamp),      Voxel: 0.12, Cards: 0, Distance: false },
    RaceGantryPost:    { Emit: () => EmitBoxFacets(0.75,  0.75,  7.60, CourseMaterial.SteelDark),     Voxel: 0.22, Cards: 0, Distance: false },
    RaceGantryBeam:    { Emit: () => EmitBoxFacets(1.10, 24.40,  0.90, CourseMaterial.WallCobalt),    Voxel: 0.20, Cards: 0, Distance: false },
    RaceGantryLamp:    { Emit: () => EmitBoxFacets(0.55, 18.00,  0.18, CourseMaterial.GateLamp),      Voxel: 0.14, Cards: 0, Distance: false },
    SpineDeckPylon:    { Emit: () => EmitBoxFacets(0.70, 12.60,  3.40, CourseMaterial.TunnelConcrete), Voxel: 0.22, Cards: 0, Distance: false },
    BridgePier:        { Emit: () => EmitBoxFacets(1.10, 13.40,  4.36, CourseMaterial.TunnelConcrete), Voxel: 0.24, Cards: 0, Distance: false },
    StationPlatform:   { Emit: () => EmitBoxFacets(32.0,  3.40,  0.42, CourseMaterial.ApronConcrete,
                         [CourseMaterial.PaintYellow, CourseMaterial.PaintYellow, CourseMaterial.BarrierConcrete,
                          CourseMaterial.BarrierConcrete, CourseMaterial.ApronConcrete, CourseMaterial.TunnelConcrete]), Voxel: 0.28, Cards: 6 },
    LongBarrier:       { Emit: () => EmitBoxFacets(8.00,  0.65,  0.85, CourseMaterial.BarrierConcrete), Voxel: 0.20, Cards: 6 },
    TunnelCeilingLamp: { Emit: () => EmitBoxFacets(4.60,  0.48,  0.10, CourseMaterial.GateLamp),      Voxel: 0.16, Cards: 0, Distance: false },
    BollardSocket:     { Emit: () => EmitBoxFacets(0.76,  0.76,  0.04, CourseMaterial.SteelDark),     Voxel: 0.12, Cards: 0, Distance: false },
    KineticBollard:    { Emit: () => EmitBoxFacets(0.46,  0.46,  1.42, CourseMaterial.SteelDark,
                         [CourseMaterial.PaintYellow, CourseMaterial.GateLamp, CourseMaterial.PaintYellow,
                          CourseMaterial.GateLamp, CourseMaterial.GateLamp, CourseMaterial.SteelDark]), Voxel: 0.11, Cards: 10 },
    WaveBollard:       { Emit: () => EmitBoxFacets(0.54,  0.54,  1.76, CourseMaterial.WallCobalt,
                         [CourseMaterial.BannerAmber, CourseMaterial.GateLamp, CourseMaterial.BannerAmber,
                          CourseMaterial.GateLamp, CourseMaterial.GateLamp, CourseMaterial.SteelDark]), Voxel: 0.13, Cards: 10 },
    TriggerBeacon:     { Emit: () => EmitBoxFacets(0.95,  0.95,  4.20, CourseMaterial.WallCrimson),   Voxel: 0.24, Cards: 8 }
});

export const InversionArenaTerrainHulls = Object.freeze(SegmentBundle.TerrainHulls);

//------------------------------------------------------------------------------------------------------------------------
//                                  STARTING GRID, TELEPORTS & STUNT EVENTS
//------------------------------------------------------------------------------------------------------------------------

export const InversionArenaSpawn = Object.freeze({
    Position: Object.freeze([-88.0, -38.3]),
    Yaw:      0.0
});

export const InversionArenaZones = Object.freeze([
    { Name: "Start Grid",                Position: [-88.0,  -38.3], Yaw:   0.0, Note: "Track A Grid → 360° Helical Loop" },
    { Name: "Waves & Tabletop",          Position: [ -2.0,  -29.7], Yaw:   0.0, Note: "Track A Triple Camelback Waves → Skyline Tabletop" },
    { Name: "Turn 1 Bowl",               Position: [140.0,  -31.5], Yaw:   0.0, Note: "Track A 180° Thunderdome 47° Superelevated Bowl" },
    { Name: "Heartline S-Bridge",        Position: [164.0,   35.0], Yaw: 180.0, Note: "Track A 84 m Zero-G Heartline +35°/−35° Sky-Bridge" },
    { Name: "Corkscrew Pipe",            Position: [112.0,   14.6], Yaw: 160.0, Note: "Track A 360° Upside-Down Ceiling Carve in Full-Pipe" },
    { Name: "Twin-Wing V",               Position: [  2.0,   29.8], Yaw: 180.0, Note: "Track A ±38° Split V-Camber Canyon → Turn 2 Bowl" },
    { Name: "Infield Spine",             Position: [-86.0,    0.0], Yaw:   0.0, Note: "Track A 45° Spine Gap → 4.5 m Whale-Tail Kicker" },
    { Name: "125° Cradle",               Position: [ 74.0,    0.0], Yaw:   0.0, Note: "Track A 22 m 125° Over-Vert Inversion Wall" },
    { Name: "Track B · Split Tunnel/Sky", Position: [-82.0,   94.0], Yaw:   0.0, Note: "Left: -5.2 m Underground Tunnel · Right: +5.0 m Sky-Bridge" },
    { Name: "Track B · Underpass Road",   Position: [ 12.0,   58.0], Yaw:  90.0, Note: "Drive OVER -5.2 m Subway & UNDER +5.0 m Sky-Bridge" },
    { Name: "Track B · Linear Bollards",  Position: [ 58.0,  166.0], Yaw: 180.0, Note: "Proximity Trigger #1 — Linear Retracting Bollard Strip" },
    { Name: "Track C · Wave Bollards",    Position: [-98.0,  -94.0], Yaw:   0.0, Note: "Proximity Trigger #2 — 84 m Seesaw Travelling-Wave Bollards" },
    { Name: "Track C · Canyon Underpass", Position: [ 78.0,  -46.0], Yaw: -90.0, Note: "Dive -5.2 m UNDER the +5.0 m Track C Viaduct Bridge" },
    { Name: "Track C · South 360° Loop",  Position: [148.0, -162.0], Yaw: 180.0, Note: "Westbound 360° Loop → 46° Corkscrew Wing → Serpentine Waves" },
    { Name: "Track D · Collapsing Bridge", Position: [-92.0, -250.0], Yaw:   0.0, Note: "Outrun rear-to-front +5 m Bridge collapse, movie cracks & sand!" },
    { Name: "Track D · Collapsing Road",   Position: [  84.0, -318.0], Yaw: 180.0, Note: "Outrun rear-to-front Sinkhole Road collapse & sand fissures!" },
    { Name: "Track E · 3-Lane Subway",     Position: [-104.0,  256.0], Yaw:   0.0, Note: "[road][tunnel down][road] → [road][road][road] → [road][tunnel up][road]" },
    { Name: "Track F · Trams & Trains",    Position: [ -98.0,  314.0], Yaw:   0.0, Note: "Two-way Articulated Streetcar Trams & Express Commuter Trains" }
]);

export const InversionArenaDrills = Object.freeze([
    {
        Id:       "grandprix",
        Name:     "Track A GP Lap",
        Glyph:    "Flag",
        Note:     "Full 1.05 km Track A lap: Loop → Waves → Tabletop → Bowl 1 → Heartline → Pipe → V-Wings → Bowl 2",
        Groups:   ["circuit"],
        Teleport: { Position: [-92.0, -38.3], Yaw: 0.0 },
        Start:    { Axis: "x", At: -82.0, From: -47.0, To: -23.0, Direction:  1.0 },
        Sector1:  { Axis: "x", At: 154.0, From: -47.0, To: -23.0, Direction:  1.0 },
        Sector2:  { Axis: "x", At:  -4.0, From:  23.0, To:  47.0, Direction: -1.0 },
        Finish:   { Axis: "x", At: -82.0, From: -47.0, To: -23.0, Direction:  1.0 }
    },
    {
        Id:       "loop360",
        Name:     "360° Inversion Loop",
        Glyph:    "RefreshCw",
        Note:     "Invert 180° through the 18 m Helical Loop onto the Wave Bridge",
        Groups:   ["loop"],
        Teleport: { Position: [-88.0, -38.3], Yaw: 0.0 },
        Start:    { Axis: "x", At: -31.0, From: -46.0, To: -30.0, Direction: 1.0 },
        Finish:   { Axis: "x", At: -15.5, From: -36.0, To: -22.0, Direction: 1.0 }
    },
    {
        Id:       "heartline",
        Name:     "Heartline S-Bridge",
        Glyph:    "TrendingUp",
        Note:     "Whip +35° Left → 0° Heartline → −35° Right across the elevated Sky-Bridge",
        Groups:   ["heartline"],
        Teleport: { Position: [166.0, 35.0], Yaw: 180.0 },
        Start:    { Axis: "x", At: 152.0, From: 26.0, To: 44.0, Direction: -1.0 },
        Finish:   { Axis: "x", At:  68.0, From: 26.0, To: 44.0, Direction: -1.0 }
    },
    {
        Id:       "pipecork",
        Name:     "Full-Pipe Corkscrew",
        Glyph:    "CircleDot",
        Note:     "Carve 45° → 90° → 180° upside-down across the Full-Pipe Tunnel ceiling",
        Groups:   ["pipe"],
        Teleport: { Position: [112.0, 14.6], Yaw: 160.0 },
        Start:    { Axis: "x", At: 54.0, From: 27.0, To: 43.0, Direction: -1.0 },
        Finish:   { Axis: "x", At: -2.5, From: 27.0, To: 43.0, Direction: -1.0 }
    },
    {
        Id:       "spinetransfer",
        Name:     "Infield Spine Gap",
        Glyph:    "Zap",
        Note:     "Launch the 45° Infield Skate Spine across the gap onto the receiver ramp",
        Groups:   ["spine"],
        Teleport: { Position: [-86.0, 0.0], Yaw: 0.0 },
        Lip:      -33.9,
        LateralY:   0.0,
        HalfSpan:   7.5
    }
]);

export const InversionClearZones = Object.freeze([
    [-148.0,  -52.0, 214.0,  -20.0],   // Track A South Outbound Straight
    [-148.0,   20.0, 214.0,   52.0],   // Track A North Return Straight
    [ 148.0, -356.0, 218.0,  356.0],   // East Bowls & Inter-Track Avenue (Tracks A..F)
    [-148.0, -356.0, -76.0,  356.0],   // West Bowls & Inter-Track Avenue (Tracks A..F)
    [ -88.0,  -14.0, 138.0,   14.0],   // Track A Infield Stunt Expressway
    [-148.0,   72.0, 214.0,  184.0],   // Track B Subterranean Split & Return Corridors
    [-148.0, -186.0, 214.0,  -74.0],   // Track C Kinetic Wave & Backstretch Corridors
    [-148.0, -346.0, 214.0, -228.0],   // Track D Collapsing Bridge & Collapsing Road Corridors
    [-148.0,  234.0, 214.0,  356.0],   // Track E 3-Lane Subway & Track F Tram/Train Corridors
    [  -4.0,   52.0,  28.0,  140.0],   // North Underpass Connector Boulevard
    [  64.0, -140.0,  92.0,  -52.0]    // South Canyon Underpass Connector
]);

//------------------------------------------------------------------------------------------------------------------------
//                           PROXIMITY TRIGGER ZONES & KINETIC BOLLARD STRIPS
//------------------------------------------------------------------------------------------------------------------------

export function ResolveInversionBollards()
{
    // ① Trigger #1 (Track B Return Straight, Westbound X: +32 -> -28, Y = +166):
    //    Simple Linear Retracting Bollard Strip — 7 sequential gate rows × 4 bollards across the road
    const LinearPosts = [];
    const LinearRows = 7;
    for (let Row = 0; Row < LinearRows; ++Row)
    {
        const X = 28.0 - Row * 9.0;
        const NormalizedU = Row / (LinearRows - 1);
        for (const OffsetY of [-4.8, -1.6, 1.6, 4.8])
        {
            LinearPosts.push({
                Shape:       "KineticBollard",
                Position:    [X, 166.0 + OffsetY, 0.0],
                Yaw:         0.0,
                Height:      1.42,
                NormalizedU,
                Side:        OffsetY >= 0.0 ? 1 : -1,
                InnerLane:   true
            });
        }
    }

    // ② Trigger #2 (Track C Outbound Avenue, Eastbound X: -76 -> +8, Y = -94):
    //    84 m Travelling Seesaw Wave Bollard Strip — 16 longitudinal stations × 2 counter-phased ranks:
    //    1 side rises while the opposite side sinks, and the entry end goes UP while the far end goes DOWN!
    const WavePosts = [];
    const WaveStations = 16;
    for (let Station = 0; Station < WaveStations; ++Station)
    {
        const X = -76.0 + Station * 5.6;
        const NormalizedU = Station / (WaveStations - 1);
        const InnerToggle = (Station & 1) === 1;
        const LeftY  = InnerToggle ? -90.6 : -87.8;
        const RightY = InnerToggle ? -97.4 : -100.2;
        WavePosts.push({
            Shape:       "WaveBollard",
            Position:    [X, LeftY, 0.0],
            Yaw:         0.0,
            Height:      1.76,
            NormalizedU,
            Side:        1,
            InnerLane:   InnerToggle
        });
        WavePosts.push({
            Shape:       "WaveBollard",
            Position:    [X, RightY, 0.0],
            Yaw:         0.0,
            Height:      1.76,
            NormalizedU,
            Side:        -1,
            InnerLane:   InnerToggle
        });
    }

    return [
        {
            Id:          "linearStrip",
            Name:        "Track B Linear Bollards",
            ShortName:   "Linear Bollards (B)",
            Mode:        "linear",
            Trigger:     { MinX: -38.0, MaxX: 62.0, MinY: 155.0, MaxY: 177.0 },
            HoldSeconds: 1.8,
            OpenSpeed:   3.8,
            CloseSpeed:  1.6,
            Beacon:      { Shape: "TriggerBeacon", Position: [38.0, 175.2, 0.0], Yaw: 0.0 },
            Posts:       LinearPosts
        },
        {
            Id:          "waveStrip",
            Name:        "Track C Wave Bollards",
            ShortName:   "Wave Bollards (C)",
            Mode:        "wave",
            Trigger:     { MinX: -106.0, MaxX: 20.0, MinY: -106.0, MaxY: -82.0 },
            HoldSeconds: 2.4,
            OpenSpeed:   3.4,
            CloseSpeed:  1.4,
            WaveSpeed:   3.4,
            Beacon:      { Shape: "TriggerBeacon", Position: [-82.0, -85.2, 0.0], Yaw: 0.0 },
            Posts:       WavePosts
        }
    ];
}

//------------------------------------------------------------------------------------------------------------------------
//                                  MULTI-TRACK SURFACE & PAINTED LIVERY
//------------------------------------------------------------------------------------------------------------------------

const PaintLift = 0.004;

function SubtractCutoutFromRects(Rects, Cutout)
{
    const [CX0, CY0, CX1, CY1] = Cutout;
    const Result = [];
    for (const Rect of Rects)
    {
        const [X0, Y0, X1, Y1] = Rect;
        if (X1 <= CX0 || X0 >= CX1 || Y1 <= CY0 || Y0 >= CY1)
        {
            Result.push(Rect);
            continue;
        }
        if (X0 < CX0) Result.push([X0, Y0, CX0, Y1]);
        if (X1 > CX1) Result.push([CX1, Y0, X1, Y1]);
        const MidX0 = Math.max(X0, CX0), MidX1 = Math.min(X1, CX1);
        if (MidX1 > MidX0)
        {
            if (Y0 < CY0) Result.push([MidX0, Y0, MidX1, CY0]);
            if (Y1 > CY1) Result.push([MidX0, CY1, MidX1, Y1]);
        }
    }
    return Result;
}

export function EmitInversionGroundFacets()
{
    const Facets = [];
    const MinX = InversionArenaBounds.Minimum[0], MaxX = InversionArenaBounds.Maximum[0];
    const MinY = InversionArenaBounds.Minimum[1], MaxY = InversionArenaBounds.Maximum[1];
    const CentreX = 0.5 * (MinX + MaxX);
    const Outer = 460.0;

    // ① Surrounding stadium turf outside the multi-track asphalt pad
    EmitQuad(Facets, [CentreX - Outer, -Outer, -0.02], [CentreX + Outer, -Outer, -0.02],
             [CentreX + Outer, Outer, -0.02], [CentreX - Outer, Outer, -0.02], CourseMaterial.Grass);

    // ② Multi-track asphalt & concrete grid with exact aperture cutouts over subterranean tunnel portals
    const Cell = 12.0;
    const Rows = Math.ceil((MaxX - MinX) / Cell);
    const Cols = Math.ceil((MaxY - MinY) / Cell);
    for (let Row = 0; Row < Rows; ++Row)
    {
        for (let Col = 0; Col < Cols; ++Col)
        {
            const X0 = MinX + Row * Cell, X1 = Math.min(MaxX, X0 + Cell);
            const Y0 = MinY + Col * Cell, Y1 = Math.min(MaxY, Y0 + Cell);
            const UnderCollapseBridge = X1 > -56.0 && X0 < 56.0 && Y1 > -262.0 && Y0 < -238.0;
            const OnRaceCorridor =
                (Y0 <= -22.0 && Y1 >= -48.0) || (Y0 <= 48.0 && Y1 >= 22.0) || (Y0 <= 12.0 && Y1 >= -12.0) ||
                (Y0 <= 116.0 && Y1 >= 74.0)  || (Y0 <= 180.0 && Y1 >= 152.0) ||
                (Y0 <= -80.0 && Y1 >= -108.0) || (Y0 <= -152.0 && Y1 >= -184.0) ||
                (Y0 <= -238.0 && Y1 >= -262.0) || (Y0 <= -304.0 && Y1 >= -332.0) ||
                (Y0 <= 276.0 && Y1 >= 236.0) || (Y0 <= 352.0 && Y1 >= 306.0);
            const Checker = ((Row >> 1) + (Col >> 1)) & 1;
            const Family = UnderCollapseBridge
                ? CourseMaterial.Earth
                : (OnRaceCorridor ? CourseMaterial.Asphalt : (Checker ? CourseMaterial.AsphaltPatch : CourseMaterial.Asphalt));

            let Pieces = [[X0, Y0, X1, Y1]];
            for (const Cutout of VisualGroundCutouts)
                Pieces = SubtractCutoutFromRects(Pieces, Cutout);
            for (const [PX0, PY0, PX1, PY1] of Pieces)
                EmitQuad(Facets, [PX0, PY0, 0.0], [PX1, PY0, 0.0], [PX1, PY1, 0.0], [PX0, PY1, 0.0], Family);
        }
    }

    const Paint = (X0, Y0, X1, Y1, Family, Lift = PaintLift) =>
        EmitQuad(Facets, [Math.min(X0, X1), Math.min(Y0, Y1), Lift], [Math.max(X0, X1), Math.min(Y0, Y1), Lift],
                 [Math.max(X0, X1), Math.max(Y0, Y1), Lift], [Math.min(X0, X1), Math.max(Y0, Y1), Lift], Family);

    const EmitChevron = (TipX, CentreY, DirSign, SpanY, ThicknessX, Family) =>
    {
        const BackX = TipX - DirSign * 3.2;
        if (DirSign > 0.0)
        {
            EmitQuad(Facets, [BackX, CentreY - SpanY, PaintLift], [BackX + ThicknessX, CentreY - SpanY, PaintLift],
                     [TipX + ThicknessX, CentreY, PaintLift], [TipX, CentreY, PaintLift], Family);
            EmitQuad(Facets, [TipX, CentreY, PaintLift], [TipX + ThicknessX, CentreY, PaintLift],
                     [BackX + ThicknessX, CentreY + SpanY, PaintLift], [BackX, CentreY + SpanY, PaintLift], Family);
        }
        else
        {
            EmitQuad(Facets, [TipX - ThicknessX, CentreY, PaintLift], [TipX, CentreY, PaintLift],
                     [BackX, CentreY - SpanY, PaintLift], [BackX - ThicknessX, CentreY - SpanY, PaintLift], Family);
            EmitQuad(Facets, [BackX - ThicknessX, CentreY + SpanY, PaintLift], [BackX, CentreY + SpanY, PaintLift],
                     [TipX, CentreY, PaintLift], [TipX - ThicknessX, CentreY, PaintLift], Family);
        }
    };

    const EmitChevronY = (CentreXPos, TipY, DirSign, SpanX, ThicknessY, Family) =>
    {
        const BackY = TipY - DirSign * 3.2;
        EmitQuad(Facets, [CentreXPos - SpanX, BackY, PaintLift], [CentreXPos, TipY, PaintLift],
                 [CentreXPos, TipY + DirSign * ThicknessY, PaintLift],
                 [CentreXPos - SpanX, BackY + DirSign * ThicknessY, PaintLift], Family);
        EmitQuad(Facets, [CentreXPos, TipY, PaintLift], [CentreXPos + SpanX, BackY, PaintLift],
                 [CentreXPos + SpanX, BackY + DirSign * ThicknessY, PaintLift],
                 [CentreXPos, TipY + DirSign * ThicknessY, PaintLift], Family);
    };

    const EmitRing = (CentreXPos, CentreYPos, InnerRadius, OuterRadius, Segments, Family) =>
    {
        for (let Step = 0; Step < Segments; ++Step)
        {
            const A0 = (2.0 * Math.PI * Step) / Segments;
            const A1 = (2.0 * Math.PI * (Step + 1)) / Segments;
            EmitQuad(Facets,
                     [CentreXPos + InnerRadius * Math.cos(A0), CentreYPos + InnerRadius * Math.sin(A0), PaintLift],
                     [CentreXPos + OuterRadius * Math.cos(A0), CentreYPos + OuterRadius * Math.sin(A0), PaintLift],
                     [CentreXPos + OuterRadius * Math.cos(A1), CentreYPos + OuterRadius * Math.sin(A1), PaintLift],
                     [CentreXPos + InnerRadius * Math.cos(A1), CentreYPos + InnerRadius * Math.sin(A1), PaintLift], Family);
        }
    };

    // ③ [Track A] Grand Prix Alternating Red/White Track Edge Kerbs (preserved intact)
    for (let X = -96.0, Idx = 0; X < 164.0; X += 4.0, ++Idx)
    {
        const KerbColor = (Idx & 1) ? CourseMaterial.PaintWhite : CourseMaterial.KerbRed;
        Paint(X, -46.4, X + 4.0, -45.5, KerbColor);
        Paint(X, -24.5, X + 4.0, -23.6, KerbColor);
        Paint(X,  23.6, X + 4.0,  24.5, KerbColor);
        Paint(X,  45.5, X + 4.0,  46.4, KerbColor);
    }

    // ④ [Track A] Checkered Start/Finish Line at X = −82.0 + 6 F1 Starting Grid Boxes
    for (let Row = 0; Row < 2; ++Row)
    {
        for (let Sq = 0; Sq < 22; ++Sq)
        {
            const Y0 = -45.4 + Sq * 0.95;
            const Shade = ((Row + Sq) & 1) ? CourseMaterial.PaintWhite : CourseMaterial.SteelDark;
            Paint(-82.6 + Row * 0.9, Y0, -81.7 + Row * 0.9, Y0 + 0.95, Shade, 0.005);
        }
    }
    for (let Slot = 0; Slot < 6; ++Slot)
    {
        const GX = -86.5 - Slot * 4.5;
        const GY = (Slot & 1) ? -32.2 : -38.3;
        Paint(GX - 0.15, GY - 1.5, GX + 0.15, GY + 1.5, CourseMaterial.PaintWhite);
        Paint(GX - 2.6,  GY - 1.5, GX,        GY - 1.3, CourseMaterial.PaintWhite);
        Paint(GX - 2.6,  GY + 1.3, GX,        GY + 1.5, CourseMaterial.PaintWhite);
    }

    // ⑤ [Track A] Direction Chevrons & Infield Stunt Expressway Bullseyes
    for (const X of [-70.0, -56.0, -42.0, 2.0, 80.0, 152.0])
        EmitChevron(X, -35.0, 1.0, 3.6, 1.1, CourseMaterial.PaintYellow);
    for (const X of [158.0, 62.0, -8.0, -84.0])
        EmitChevron(X,  35.0, -1.0, 3.6, 1.1, CourseMaterial.PaintBlue);
    Paint(-88.0, -7.2, 134.0, -6.9, CourseMaterial.PaintBlue);
    Paint(-88.0,  6.9, 134.0,  7.2, CourseMaterial.PaintBlue);
    for (const X of [-74.0, -60.0, 6.0, 82.0, 100.0])
        EmitChevron(X, 0.0, 1.0, 3.0, 0.95, CourseMaterial.PaintGreen);
    EmitRing(-26.0, 0.0, 3.4, 4.0, 40, CourseMaterial.KerbRed);
    EmitRing(-26.0, 0.0, 1.2, 1.6, 28, CourseMaterial.PaintYellow);
    EmitRing( 96.0, 0.0, 4.2, 4.8, 44, CourseMaterial.PaintBlue);

    // ⑥ Inter-Track Connector Boulevards & Underpass Guide Markings (Track A <-> Track B & Track C)
    Paint(-97.5, -104.0, -96.9, 104.0, CourseMaterial.PaintYellow);
    Paint(-82.1, -104.0, -81.5, 104.0, CourseMaterial.PaintYellow);
    for (const Y of [62.0, 74.0])
        EmitChevronY(-89.5, Y, 1.0, 3.2, 1.0, CourseMaterial.PaintGreen);
    for (const Y of [-62.0, -74.0])
        EmitChevronY(-89.5, Y, -1.0, 3.2, 1.0, CourseMaterial.KerbRed);

    // Track B Underpass Boulevard at X = +12 (drives OVER -5.2 m Subway Tunnel & UNDER +5.0 m Sky-Bridge!)
    Paint( 4.6, 56.0,  5.2, 132.0, CourseMaterial.PaintBlue);
    Paint(18.8, 56.0, 19.4, 132.0, CourseMaterial.PaintBlue);
    for (const Y of [64.0, 84.0, 118.0])
        EmitChevronY(12.0, Y, 1.0, 3.0, 1.0, CourseMaterial.PaintYellow);

    // ⑦ [Track B] Split Over/Under Fork Markings + Proximity Trigger #1 Sensor Pad (Linear Bollards)
    for (const X of [-70.0, -56.0])
    {
        EmitChevron(X,  84.0, 1.0, 3.0, 1.0, CourseMaterial.GateLamp);
        EmitChevron(X, 104.0, 1.0, 3.0, 1.0, CourseMaterial.PaintYellow);
    }
    Paint(34.0, 159.0, 52.0, 173.0, CourseMaterial.WallCobalt, 0.003);
    Paint(-32.0, 159.2, 52.0, 159.8, CourseMaterial.GateLamp, 0.005);
    Paint(-32.0, 172.2, 52.0, 172.8, CourseMaterial.GateLamp, 0.005);
    for (const X of [48.0, 38.0])
        EmitChevron(X, 166.0, -1.0, 3.4, 1.0, CourseMaterial.PaintGreen);

    // ⑧ [Track C] Proximity Trigger #2 Sensor Pad (84 m Travelling Wave Bollards) & South Loop Guide
    Paint(-94.0, -101.0, -78.0, -87.0, CourseMaterial.WallCobalt, 0.003);
    Paint(-94.0, -101.4,  10.0, -100.8, CourseMaterial.BannerAmber, 0.005);
    Paint(-94.0,  -87.2,  10.0,  -86.6, CourseMaterial.GateLamp, 0.005);
    for (const X of [-90.0, -80.0])
        EmitChevron(X, -94.0, 1.0, 3.4, 1.0, CourseMaterial.PaintYellow);
    for (const X of [146.0, 130.0])
        EmitChevron(X, -162.0, -1.0, 3.4, 1.0, CourseMaterial.KerbRed);

    // ⑨ [Track D] Seismic Collapse Sky-Bridge (Y = -250) & Collapse Faultline Road (Y = -318) Hazard Livery
    Paint(-94.0, -257.2, -52.0, -256.6, CourseMaterial.BannerAmber, 0.005);
    Paint(-94.0, -243.4, -52.0, -242.8, CourseMaterial.BannerAmber, 0.005);
    for (const X of [-82.0, -64.0])
        EmitChevron(X, -250.0, 1.0, 3.4, 1.0, CourseMaterial.BannerAmber);
    for (const X of [104.0, 92.0, 68.0])
        EmitChevron(X, -318.0, -1.0, 3.4, 1.0, CourseMaterial.KerbRed);

    // ⑩ [Track E] 3-Lane Subway Boulevard: [road][tunnel down][road] -- [road][road][road] -- [road][tunnel up][road]
    //    Outer boundary lines (Y = 238.5 & Y = 273.5) + 3-lane dividers (Y = 248.2 & Y = 263.8)
    Paint(-112.0, 238.4, 132.0, 239.0, CourseMaterial.PaintWhite, 0.005);
    Paint(-112.0, 273.0, 132.0, 273.6, CourseMaterial.PaintWhite, 0.005);
    for (let X = -108.0; X < 128.0; X += 8.0)
    {
        Paint(X, 248.0, X + 4.5, 248.5, CourseMaterial.PaintYellow, 0.005);
        Paint(X, 263.5, X + 4.5, 264.0, CourseMaterial.PaintYellow, 0.005);
    }
    //    Approach & middle -- [road][road][road] -- chevrons across all 3 lanes!
    for (const X of [-92.0, -78.0, 82.0])
    {
        EmitChevron(X, 243.5, 1.0, 2.4, 0.9, CourseMaterial.PaintGreen);
        EmitChevron(X, 256.0, 1.0, 2.8, 1.0, CourseMaterial.GateLamp);
        EmitChevron(X, 268.5, 1.0, 2.4, 0.9, CourseMaterial.PaintGreen);
    }
    for (const X of [-24.0, 0.0, 24.0])
    {
        EmitChevron(X, 243.5, 1.0, 2.4, 0.9, CourseMaterial.PaintGreen);
        EmitChevron(X, 256.0, 1.0, 2.8, 1.0, CourseMaterial.PaintYellow);
        EmitChevron(X, 268.5, 1.0, 2.4, 0.9, CourseMaterial.PaintGreen);
    }

    // ⑪ [Track F] Dedicated Streetcar Tram & Express Rail Transit Boulevard (Y = +308 .. +350)
    Paint(-142.0, 308.2, 206.0, 308.8, CourseMaterial.PaintYellow, 0.005);
    Paint(-142.0, 330.8, 206.0, 331.4, CourseMaterial.PaintYellow, 0.005);
    Paint(-142.0, 335.6, 206.0, 350.4, CourseMaterial.TunnelConcrete, 0.002);

    return Facets;
}

//------------------------------------------------------------------------------------------------------------------------
//                                  STADIUM BARRIERS, GANTRIES, CONES & SMASHABLES
//------------------------------------------------------------------------------------------------------------------------

export function ResolveInversionPlacements()
{
    const Degrees = Math.PI / 180.0;
    const List = [...SegmentBundle.Placements];
    const Add = (Shape, Name, Position, Yaw = 0.0, Material = -1, Collider = true) =>
        List.push({ Shape, Name, Position, Yaw, Material, Collider });

    // ① [Track A] Divider Walls at Y = ±55.5 with wide Open-World Connector Gateways into [Track B] and [Track C]
    for (let X = -152.0; X <= 216.0; X += 4.0)
    {
        const NorthGateway = (X >= -104.0 && X <= -76.0) || (X >= 0.0 && X <= 24.0);
        const SouthGateway = (X >= -104.0 && X <= -76.0) || (X >= 64.0 && X <= 92.0);
        if (!NorthGateway)
            Add("Jersey", `TrackA North ${X.toFixed(0)}`, [X,  55.5, 0.0], 0.0);
        if (!SouthGateway)
            Add("Jersey", `TrackA South ${X.toFixed(0)}`, [X, -55.5, 0.0], 0.0);
    }

    // Inner-Wing Divider Walls at Y = ±202.0 with wide 32 m Open-World Gateways into [Track D], [Track E] & [Track F]
    for (let X = -148.0; X <= 216.0; X += 8.0)
    {
        const OuterGateway = (X >= -108.0 && X <= -76.0) || (X >= 148.0 && X <= 180.0);
        if (!OuterGateway)
        {
            Add("LongBarrier", `Wing Divider N ${X.toFixed(0)}`, [X,  202.0, 0.0], 0.0);
            Add("LongBarrier", `Wing Divider S ${X.toFixed(0)}`, [X, -202.0, 0.0], 0.0);
        }
    }

    // Outer Complex Perimeter Walls around the full 6-Track Stadium ([−154..+220] × [−360..+360])
    for (let X = -148.0; X <= 216.0; X += 16.0)
    {
        Add("LongBarrier", `Complex North ${X.toFixed(0)}`, [X,  360.0, 0.0], 0.0);
        Add("LongBarrier", `Complex South ${X.toFixed(0)}`, [X, -360.0, 0.0], 0.0);
    }
    for (let Y = -352.0; Y <= 352.0; Y += 16.0)
    {
        Add("LongBarrier", `Complex West ${Y.toFixed(0)}`, [-152.5, Y, 0.0], 90.0 * Degrees);
        Add("LongBarrier", `Complex East ${Y.toFixed(0)}`, [ 220.5, Y, 0.0], 90.0 * Degrees);
    }

    // ② [Track A] Pit-wall divider islands (preserved intact)
    for (let X = -68.0; X <= 136.0; X += 8.0)
    {
        if (Math.abs(X - 4.0) > 12.0 && (X < 52.0 || X > 116.0))
        {
            Add("Jersey", `South Pit Wall ${X.toFixed(0)}`, [X, -21.0, 0.0], 0.0);
            Add("Jersey", `North Pit Wall ${X.toFixed(0)}`, [X,  21.0, 0.0], 0.0);
        }
    }

    // ③ Overhead Grand Prix & Track Wing Timing / Signpost Gantries
    const AddRaceGantry = (Label, X, CentreY, Yaw = 0.0) =>
    {
        const CosY = Math.cos(Yaw), SinY = Math.sin(Yaw);
        Add("RaceGantryPost", `${Label} post L`, [X + 12.2 * SinY, CentreY - 12.2 * CosY, 0.0], Yaw);
        Add("RaceGantryPost", `${Label} post R`, [X - 12.2 * SinY, CentreY + 12.2 * CosY, 0.0], Yaw);
        Add("RaceGantryBeam", `${Label} beam`,   [X, CentreY, 7.2], Yaw, -1, false);
        Add("RaceGantryLamp", `${Label} lamp`,   [X, CentreY, 7.0], Yaw, -1, false);
    };
    AddRaceGantry("Start/Finish Gantry",     -82.0,  -35.0);
    AddRaceGantry("Sector 1 Turn-In",        154.0,  -35.0);
    AddRaceGantry("Sector 2 Return",         158.0,   35.0);
    AddRaceGantry("Sector 3 Split-Wing",      -6.0,   35.0);
    AddRaceGantry("Track B Split Portal",    -56.0,   94.0);
    AddRaceGantry("Track B Linear Trigger",   36.0,  166.0);
    AddRaceGantry("Track C Wave Trigger",    -82.0,  -94.0);
    AddRaceGantry("Track D Collapse Bridge", -54.0, -250.0);
    AddRaceGantry("Track D Collapse Road",    64.0, -318.0);
    AddRaceGantry("Track E 3-Lane Subway",   -72.0,  256.0);
    AddRaceGantry("Track F Tramway Avenue",  -76.0,  319.5);

    // ④ Architectural steel A-frame portals cradling BOTH 18 m 360° Helical Loops (Track A & Track C)
    for (const PortalX of [-26.5, -20.0, -13.5])
    {
        Add("LoopPylon",     `LoopA pylon S ${PortalX}`, [PortalX, -45.8,  0.0], 0.0);
        Add("LoopPylon",     `LoopA pylon N ${PortalX}`, [PortalX, -22.8,  0.0], 0.0);
        Add("LoopCrossBeam", `LoopA beam ${PortalX}`,    [PortalX, -34.3, 18.8], 0.0, -1, false);
        Add("LoopCrownLamp", `LoopA lamp ${PortalX}`,    [PortalX, -34.3, 18.6], 0.0, -1, false);
    }
    for (const PortalX of [101.5, 108.0, 114.5])
    {
        Add("LoopPylon",     `LoopC pylon S ${PortalX}`, [PortalX, -177.8,  0.0], 0.0);
        Add("LoopPylon",     `LoopC pylon N ${PortalX}`, [PortalX, -154.8,  0.0], 0.0);
        Add("LoopCrossBeam", `LoopC beam ${PortalX}`,    [PortalX, -166.3, 18.8], 0.0, -1, false);
        Add("LoopCrownLamp", `LoopC lamp ${PortalX}`,    [PortalX, -166.3, 18.6], 0.0, -1, false);
    }

    // ⑤ Bridge support piers & Underpass Portals (clear of the Underpass & Canyon roadways!)
    Add("SpineDeckPylon", "Tabletop pier",      [114.0,  -29.7, 0.0], 0.0, -1, false);
    Add("SpineDeckPylon", "Heartline pier E",   [130.0,   35.0, 0.0], 0.0, -1, false);
    Add("SpineDeckPylon", "Heartline pier C",   [110.0,   35.0, 0.0], 0.0, -1, false);
    Add("SpineDeckPylon", "Heartline pier W",   [ 90.0,   35.0, 0.0], 0.0, -1, false);
    Add("SpineDeckPylon", "WhaleTail pier",     [ 45.0,    0.0, 0.0], 0.0, -1, false);
    // Track B Sky-Bridge piers flanking the X = +12 Ground Underpass Boulevard (wide 22 m drive-through span!)
    Add("BridgePier",     "SkyBridge pier W",   [ -4.0,  104.0, 0.0], 0.0);
    Add("BridgePier",     "SkyBridge pier E",   [ 28.0,  104.0, 0.0], 0.0);
    // Track C Viaduct Bridge piers flanking the X = +78 Sunken Canyon Underpass (wide 24 m span!)
    Add("BridgePier",     "Viaduct pier W",     [ 62.0,  -94.0, 0.0], 0.0);
    Add("BridgePier",     "Viaduct pier E",     [ 94.0,  -94.0, 0.0], 0.0);

    // Subterranean Tunnel Ceiling LED Light Strips inside Track B's -5.2 m Subway Gallery
    for (let X = -8.0; X <= 28.0; X += 9.0)
    {
        Add("TunnelCeilingLamp", `Subway lamp L ${X}`, [X, 80.5, -0.86], 0.0, -1, false);
        Add("TunnelCeilingLamp", `Subway lamp R ${X}`, [X, 87.5, -0.86], 0.0, -1, false);
    }

    // [Track E] 3-Lane Subway Ceiling LED Light Strips inside the 88 m Underground Subway Station Gallery
    for (let X = -38.0; X <= 38.0; X += 10.0)
    {
        Add("TunnelCeilingLamp", `Subway3L lamp L ${X}`, [X, 252.5, -0.86], 0.0, -1, false);
        Add("TunnelCeilingLamp", `Subway3L lamp R ${X}`, [X, 259.5, -0.86], 0.0, -1, false);
    }

    // [Track F] Dedicated 4-Track Streetcar Tramway & Express Rail Corridor (steel grooved rails, catenary & island platform)
    Add("StationPlatform", "Tram Central Island", [16.0, 319.5, 0.0], 0.0);
    for (let X = -132.0; X <= 198.0; X += 22.0)
    {
        for (const TrackCenterY of [314.0, 325.0, 340.0, 346.5])
        {
            Add("TramRailBar", `Rail S ${TrackCenterY} ${X}`, [X, TrackCenterY - 0.72, 0.02], 0.0, -1, false);
            Add("TramRailBar", `Rail N ${TrackCenterY} ${X}`, [X, TrackCenterY + 0.72, 0.02], 0.0, -1, false);
        }
    }
    for (let X = -120.0; X <= 188.0; X += 28.0)
    {
        Add("CatenaryPole", `Tram catenary pole ${X}`, [X, 319.5, 0.0], 0.0, -1, false);
        Add("CatenaryArm",  `Tram catenary arm ${X}`,  [X, 319.5, 6.2], 0.0, -1, false);
        Add("CatenaryPole", `Train catenary pole ${X}`, [X, 343.25, 0.0], 0.0, -1, false);
        Add("CatenaryArm",  `Train catenary arm ${X}`,  [X, 343.25, 6.4], 0.0, -1, false);
    }

    // Recessed floor sockets under all Linear & Wave Kinetic Bollards
    for (const Zone of ResolveInversionBollards())
    {
        for (let Index = 0; Index < Zone.Posts.length; ++Index)
        {
            const P = Zone.Posts[Index].Position;
            Add("BollardSocket", `${Zone.Id} socket ${Index}`, [P[0], P[1], 0.0], 0.0, -1, false);
        }
    }

    // ⑥ Clustered stadium floodlight poles (<= 14 poles inside cluster grid)
    for (const X of [-72.0, -36.0, 0.0, 36.0, 72.0, 108.0, 144.0])
    {
        const SouthAngle = 90.0 * Degrees;
        Add("Pole",     `South Floodlight ${X}`, [X, -49.5,  0.0], 0.0);
        Add("PoleHead", `South Head ${X}`,       [X, -48.8, 10.8], SouthAngle, -1, false);

        const NorthAngle = -90.0 * Degrees;
        Add("Pole",     `North Floodlight ${X}`, [X,  49.5,  0.0], 0.0);
        Add("PoleHead", `North Head ${X}`,       [X,  48.8, 10.8], NorthAngle, -1, false);
    }

    // ⑦ Grand Prix Paddock Materials Showcase beside the Start Straight
    Add("GardenAluminium", "Aluminium sphere", [-68.0, -17.0, 0.0], 0.0);
    Add("GardenGold",      "Gold sphere",      [-64.5, -17.0, 0.0], 0.0);
    Add("GardenGlass",     "Glass sphere",     [-61.0, -17.0, 0.0], 0.0);
    Add("GardenMirror",    "Standing mirror",  [-57.0, -17.5, 0.0], 0.0);

    return List;
}

export function ResolveInversionCones()
{
    const List = [];
    const Push = (X, Y, Group) => List.push({ Position: [X, Y, 0.0], Yaw: 0.0, Group });

    for (let X = -76.0; X <= -36.0; X += 10.0)
    {
        Push(X, -43.8, "loop");
        Push(X, -32.8, "loop");
    }
    for (let Deg = -60; Deg <= 60; Deg += 30)
    {
        const Rad = (Deg * Math.PI) / 180.0;
        Push(164.0 + 23.2 * Math.cos(Rad), 23.2 * Math.sin(Rad), "circuit");
        Push(-96.0 - 23.2 * Math.cos(Rad), 23.2 * Math.sin(Rad), "circuit");
    }
    for (const X of [64.0, 58.0])
    {
        Push(X, 28.8, "pipe");
        Push(X, 41.2, "pipe");
    }
    for (const X of [-66.0, -54.0])
    {
        Push(X, -6.4, "spine");
        Push(X,  6.4, "spine");
    }
    return List;
}

export function ResolveInversionBreakables()
{
    const List = [];
    const Add = (Name, Shape, Material, X, Y, Yaw = 0.0, Options = {}) =>
    {
        const Approach = {
            Position: [X - 18.0 * Math.cos(Yaw), Y - 18.0 * Math.sin(Yaw)],
            Yaw:      Yaw * 180.0 / Math.PI
        };
        List.push({
            Name, Shape, Material,
            Position:      [X, Y, 0.0],
            Yaw,
            Approach,
            Capacity:      Options.Capacity || 40,
            Ceiling:       Options.Ceiling || 28,
            StrengthScale: Options.StrengthScale || 1.0,
            DensityScale:  Options.DensityScale || 1.0
        });
    };

    const Pane     = { Kind: "box", Extent: [0.10, 3.20, 2.50] };
    const Tempered = { Kind: "box", Extent: [0.10, 3.20, 2.50] };
    const Crate    = { Kind: "box", Extent: [1.10, 1.10, 1.10] };
    const Barrier  = { Kind: "box", Extent: [0.55, 2.20, 0.95] };

    Add("Tabletop Victory Glass", Pane,     "glass",     148.0, -29.7, Math.PI * 0.5, { Capacity: 44, StrengthScale: 0.65 });
    Add("Pipe Exit Glass Gate",   Tempered, "tempered",   -5.0,  35.0, Math.PI * 0.5, { Capacity: 44, StrengthScale: 0.65 });
    Add("Spine Landing Pane",     Pane,     "glass",       6.0,   0.0, Math.PI * 0.5, { Capacity: 44, StrengthScale: 0.65 });
    Add("Subway Exit Glass",      Pane,     "glass",      70.0,  84.0, Math.PI * 0.5, { Capacity: 44, StrengthScale: 0.65 });
    Add("Viaduct Landing Glass",  Tempered, "tempered",  136.0, -94.0, Math.PI * 0.5, { Capacity: 44, StrengthScale: 0.65 });
    Add("Infield Chicane A",      Barrier,  "plastic",    86.0,  -2.2, Math.PI * 0.5, { Capacity: 24 });
    Add("Infield Chicane B",      Barrier,  "plastic",    86.0,   2.2, Math.PI * 0.5, { Capacity: 24 });
    Add("Paddock Crate 1",        Crate,    "wood",       -4.0, -12.0,  0.20,         { DensityScale: 0.32, Capacity: 28 });
    Add("Paddock Crate 2",        Crate,    "wood",       -4.0,  12.0, -0.20,         { DensityScale: 0.32, Capacity: 28 });

    return List;
}

//------------------------------------------------------------------------------------------------------------------------
//                      SEISMIC COLLAPSING BRIDGE & COLLAPSING ROAD DESCRIPTORS
//------------------------------------------------------------------------------------------------------------------------

export function ResolveInversionCollapseSpans()
{
    const BridgeSurface = InversionArenaSurfaces.find((S) => S.Key === "CollapseSkyBridge");
    const RoadSurface   = InversionArenaSurfaces.find((S) => S.Key === "CollapseSinkholeRoad");
    return [
        {
            Id:          "collapseBridge",
            Name:        "Track D Collapsing Sky-Bridge",
            ShortName:   "Collapsing Bridge",
            Kind:        "bridge",
            Surface:     BridgeSurface,
            StartWorld:  [BridgeSurface.Origin[0] + BridgeSurface.UpLength * BridgeSurface.CosineYaw,
                          BridgeSurface.Origin[1] + BridgeSurface.UpLength * BridgeSurface.SineYaw, 0.0],
            Yaw:         0.0,
            CosineYaw:   1.0,
            SineYaw:     0.0,
            SpanLength:  112.0,
            DeckZ:       5.00,
            ChasmDepth:  5.00,
            CrackSpeed:  26.5,
            DropSpeed:   15.5,
            LeadDelay:   0.55,
            ProxyOffset: 0
        },
        {
            Id:          "collapseRoad",
            Name:        "Track D Collapsing Sinkhole Road",
            ShortName:   "Collapsing Road",
            Kind:        "road",
            Surface:     RoadSurface,
            StartWorld:  [56.0, -318.0, 0.0],
            Yaw:         Math.PI,
            CosineYaw:   -1.0,
            SineYaw:     0.0,
            SpanLength:  112.0,
            DeckZ:       0.0,
            ChasmDepth:  5.20,
            CrackSpeed:  26.5,
            DropSpeed:   15.5,
            LeadDelay:   0.55,
            ProxyOffset: BridgeSurface.BayCount
        }
    ];
}

//------------------------------------------------------------------------------------------------------------------------
//                     SEPARATE ARTICULATED TRAM & EXPRESS TRAIN TRAFFIC DESCRIPTORS
//------------------------------------------------------------------------------------------------------------------------

export function ResolveInversionTrams()
{
    return [
        // ① Eastbound Streetcar Line (Y = +314.0): 2 coupled two-car articulated yellow city trams stopping at Central Island
        {
            Id:              "tramEast1",
            Name:            "Streetcar Tram E-101",
            Kind:            "tram",
            Shape:           "TramCarBody",
            CarCount:        2,
            CarLength:       11.2,
            CarWidth:        2.65,
            CarHeight:       3.30,
            CarSpacing:      11.8,
            StartX:          -136.0,
            EndX:             204.0,
            LaneY:            314.0,
            BaseZ:            0.0,
            Direction:        1.0,
            CruiseSpeed:      12.5,
            StationX:         22.0,
            StationDwell:     2.2,
            InitialProgress:  28.0
        },
        {
            Id:              "tramEast2",
            Name:            "Streetcar Tram E-102",
            Kind:            "tram",
            Shape:           "TramCarBody",
            CarCount:        2,
            CarLength:       11.2,
            CarWidth:        2.65,
            CarHeight:       3.30,
            CarSpacing:      11.8,
            StartX:          -136.0,
            EndX:             204.0,
            LaneY:            314.0,
            BaseZ:            0.0,
            Direction:        1.0,
            CruiseSpeed:      12.5,
            StationX:         22.0,
            StationDwell:     2.2,
            InitialProgress:  198.0
        },
        // ② Westbound Streetcar Line (Y = +325.0): 2 coupled two-car articulated yellow city trams
        {
            Id:              "tramWest1",
            Name:            "Streetcar Tram W-201",
            Kind:            "tram",
            Shape:           "TramCarBody",
            CarCount:        2,
            CarLength:       11.2,
            CarWidth:        2.65,
            CarHeight:       3.30,
            CarSpacing:      11.8,
            StartX:           204.0,
            EndX:            -136.0,
            LaneY:            325.0,
            BaseZ:            0.0,
            Direction:       -1.0,
            CruiseSpeed:      12.5,
            StationX:         10.0,
            StationDwell:     2.2,
            InitialProgress:  62.0
        },
        {
            Id:              "tramWest2",
            Name:            "Streetcar Tram W-202",
            Kind:            "tram",
            Shape:           "TramCarBody",
            CarCount:        2,
            CarLength:       11.2,
            CarWidth:        2.65,
            CarHeight:       3.30,
            CarSpacing:      11.8,
            StartX:           204.0,
            EndX:            -136.0,
            LaneY:            325.0,
            BaseZ:            0.0,
            Direction:       -1.0,
            CruiseSpeed:      12.5,
            StationX:         10.0,
            StationDwell:     2.2,
            InitialProgress:  232.0
        },
        // ③ Express Commuter / Subway Rail Corridor (Y = +340.0 Eastbound & Y = +346.5 Westbound): 3-car heavy rail trains
        {
            Id:              "trainExpressEast",
            Name:            "Express Train R-401",
            Kind:            "train",
            Shape:           "TrainCoachBody",
            CarCount:        3,
            CarLength:       13.6,
            CarWidth:        2.92,
            CarHeight:       3.52,
            CarSpacing:      14.2,
            StartX:          -138.0,
            EndX:             206.0,
            LaneY:            340.0,
            BaseZ:            0.0,
            Direction:        1.0,
            CruiseSpeed:      21.5,
            StationX:         null,
            InitialProgress:  84.0
        },
        {
            Id:              "trainExpressWest",
            Name:            "Express Train R-402",
            Kind:            "train",
            Shape:           "TrainCoachBody",
            CarCount:        3,
            CarLength:       13.6,
            CarWidth:        2.92,
            CarHeight:       3.52,
            CarSpacing:      14.2,
            StartX:           206.0,
            EndX:            -138.0,
            LaneY:            346.5,
            BaseZ:            0.0,
            Direction:       -1.0,
            CruiseSpeed:      21.5,
            StationX:         null,
            InitialProgress:  156.0
        }
    ];
}
