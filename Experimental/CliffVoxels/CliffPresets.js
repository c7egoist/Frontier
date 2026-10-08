//============================================================================================================================================
//                                                             CLIFFPRESETS.JS
//============================================================================================================================================
// 📦 Geological preset specifications and pipeline stage metadata for Voxel Cliffs.

export const CliffStageInfo = [
    {
        stage: 1,
        name: 'Landform Mass',
        subtitle: 'SDF base volume & overhangs',
        description: 'True 3D signed distance field defining buttresses, amphitheatres, sheer cliffs, and >90° overhang undercuts.'
    },
    {
        stage: 2,
        name: 'Sedimentary Strata',
        subtitle: 'Gaea Stacks differential hardness',
        description: 'Planar bedding with configurable dip angle and per-band hardness. Soft shale layers erode inward into alcoves; hard caprocks form protruding ledges.'
    },
    {
        stage: 3,
        name: 'Rock Jointing',
        subtitle: 'Columnar & block fractures',
        description: '3D Voronoi cellular jointing creating vertical hexagonal dolerite pillars or orthogonal sedimentary block sets.'
    },
    {
        stage: 4,
        name: 'Thermal & Gullies',
        subtitle: 'Talus repose & hydraulic chutes',
        description: 'Angle-of-repose scree ramp at the base with boulder debris, and vertical erosion gullies carved down the cliff face.'
    },
    {
        stage: 5,
        name: 'Satmaps & Surface Nets',
        subtitle: 'Topological masks & PBR triplanar',
        description: 'Surface Nets polygonization with per-vertex slope, strata, cavity, and flow satmaps driving rich geological shading.'
    }
];

export const CliffPresets = {
    sandstone_canyon: {
        id: 'sandstone_canyon',
        label: 'Sandstone Canyon',
        description: 'Stratified sedimentary escarpment with amphitheater alcove, sharp caprock ledges, and talus slope.',
        spec: {
            preset: 'sandstone_canyon',
            seed: 4821,
            resolution: 64, // 64x56x64
            cliffHeight: 18.0,
            cliffWidth: 26.0,
            cliffDepth: 16.0,
            overhangStrength: 0.45,
            asymmetry: 0.35,
            strataFreq: 0.85,
            strataDip: 6.0,
            strataStrike: 25.0,
            strataHardnessVar: 0.85,
            strataUndercut: 0.9,
            jointType: 'block',
            jointScale: 0.45,
            jointDepth: 0.5,
            talusHeight: 4.5,
            talusRepose: 33.0,
            gullyDepth: 0.65,
            materialPalette: 'sandstone'
        }
    },

    dolerite_spires: {
        id: 'dolerite_spires',
        label: 'Dolerite Spires',
        description: 'Clustered vertical needle pinnacles with hexagonal columnar jointing and flared crests.',
        spec: {
            preset: 'dolerite_spires',
            seed: 8192,
            resolution: 64,
            cliffHeight: 22.0,
            cliffWidth: 22.0,
            cliffDepth: 22.0,
            overhangStrength: 0.55,
            asymmetry: 0.5,
            strataFreq: 0.3,
            strataDip: 12.0,
            strataStrike: 45.0,
            strataHardnessVar: 0.4,
            strataUndercut: 0.3,
            jointType: 'columnar',
            jointScale: 0.85,
            jointDepth: 0.9,
            talusHeight: 3.5,
            talusRepose: 36.0,
            gullyDepth: 0.35,
            materialPalette: 'dolerite'
        }
    },

    coastal_cliff: {
        id: 'coastal_cliff',
        label: 'Coastal Sea Cliff',
        description: 'Sheer marine cliff featuring a deep sea-level wave notch with severe >90° overhang and detached sea stack.',
        spec: {
            preset: 'coastal_cliff',
            seed: 6204,
            resolution: 64,
            cliffHeight: 19.0,
            cliffWidth: 28.0,
            cliffDepth: 18.0,
            overhangStrength: 0.75,
            asymmetry: 0.25,
            strataFreq: 0.7,
            strataDip: 4.0,
            strataStrike: 10.0,
            strataHardnessVar: 0.65,
            strataUndercut: 0.7,
            jointType: 'block',
            jointScale: 0.55,
            jointDepth: 0.6,
            talusHeight: 2.0,
            talusRepose: 28.0,
            gullyDepth: 0.8,
            materialPalette: 'coastal'
        }
    },

    rugged_crag: {
        id: 'rugged_crag',
        label: 'Alpine Rugged Crag',
        description: 'Asymmetric frost-shattered granite ridge with steep arêtes and deep gully chutes.',
        spec: {
            preset: 'rugged_crag',
            seed: 9451,
            resolution: 64,
            cliffHeight: 20.0,
            cliffWidth: 25.0,
            cliffDepth: 18.0,
            overhangStrength: 0.4,
            asymmetry: 0.65,
            strataFreq: 0.4,
            strataDip: 28.0,
            strataStrike: 65.0,
            strataHardnessVar: 0.5,
            strataUndercut: 0.45,
            jointType: 'block',
            jointScale: 0.6,
            jointDepth: 0.75,
            talusHeight: 5.5,
            talusRepose: 38.0,
            gullyDepth: 0.9,
            materialPalette: 'crag'
        }
    },

    monument_butte: {
        id: 'monument_butte',
        label: 'Monument Butte & Mesa',
        description: 'Iconic red rock mesa with flat caprock, sheer stepped vertical tiers, and wide debris apron.',
        spec: {
            preset: 'monument_butte',
            seed: 3108,
            resolution: 64,
            cliffHeight: 20.0,
            cliffWidth: 24.0,
            cliffDepth: 24.0,
            overhangStrength: 0.35,
            asymmetry: 0.15,
            strataFreq: 0.9,
            strataDip: 1.5,
            strataStrike: 0.0,
            strataHardnessVar: 0.9,
            strataUndercut: 1.0,
            jointType: 'block',
            jointScale: 0.4,
            jointDepth: 0.45,
            talusHeight: 6.0,
            talusRepose: 32.0,
            gullyDepth: 0.5,
            materialPalette: 'monument'
        }
    }
};

export const DefaultCliffSpec = { ...CliffPresets.sandstone_canyon.spec };
