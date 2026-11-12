// Scene graph, presets, and Outliner/Inspector schema for Project Zero 2.5D Fluid & Physical Foam Demo.

export const DEBUG_VIEWS = [
  { id: 0, label: 'Shaded Physical Foam' },
  { id: 1, label: 'Foam Continuum (Thick / Lace / Sub)' },
  { id: 2, label: 'Advected Flow Stretch' },
  { id: 3, label: 'Wave Height & Convergence' },
];

export const BOUNDARY_MODES = [
  { id: 0, label: 'Absorbing Sponge' },
  { id: 1, label: 'Reflective Tank' },
];

export const BOAT_MODES = [
  { id: 'figure8', label: 'Auto Figure-8' },
  { id: 'circle', label: 'Auto Circle' },
  { id: 'manual', label: 'Manual (WASD)' },
  { id: 'anchor', label: 'Stationary Anchor' },
];

export const OUTLINER_ROWS = [
  {
    Id: 'grp-water',
    Name: 'Water',
    Panel: 'group',
    Icon: 'folder-water',
    Parent: null,
    Depth: 0,
    Description: 'Bounded 2.5D shallow-water & continuum foam simulation volumes',
  },
  {
    Id: 'waterbody',
    Name: 'WaterBody',
    Panel: 'waterbody',
    Icon: 'waterbody',
    Parent: 'grp-water',
    Depth: 1,
    Description: 'Bounded 2.5D SWE + mass-conserving continuum foam & analytical cellular meniscus network',
  },
  {
    Id: 'grp-vessels',
    Name: 'Vessels',
    Panel: 'group',
    Icon: 'folder-vessels',
    Parent: null,
    Depth: 0,
    Description: '6-DOF hydrodynamic rigid-body vessels coupled to the 2.5D fluid heightfield',
  },
  {
    Id: 'boat',
    Name: 'Boat',
    Panel: 'boat',
    Icon: 'boat',
    Parent: 'grp-vessels',
    Depth: 1,
    Description: 'Coupled V-hull watercraft · buoyancy, Kelvin wake, bow breaking & prop wash',
  },
  {
    Id: 'grp-cameras',
    Name: 'Cameras',
    Panel: 'group',
    Icon: 'folder-cameras',
    Parent: null,
    Depth: 0,
    Description: 'Viewport navigation optics and ACES tone-mapping post stack',
  },
  {
    Id: 'camera',
    Name: 'Editor Camera',
    Panel: 'camera',
    Icon: 'camera',
    Parent: 'grp-cameras',
    Depth: 1,
    Description: 'Interactive 3D orbit/pan camera · Drag water to inject waves, right-drag to orbit',
  },
  {
    Id: 'post',
    Name: 'Post Process',
    Panel: 'post',
    Icon: 'post',
    Parent: 'grp-cameras',
    Depth: 1,
    Description: 'Exposure EV, ACES tone curve, contrast and surface glint bloom',
  },
  {
    Id: 'grp-world',
    Name: 'World',
    Panel: 'group',
    Icon: 'folder-world',
    Parent: null,
    Depth: 0,
    Description: 'Coastal shore terrain, celestial illumination, sky dome, wind shear and ocean basin floor',
  },
  {
    Id: 'shore',
    Name: 'Shore',
    Panel: 'shore',
    Icon: 'shore',
    Parent: 'grp-world',
    Depth: 1,
    Description: 'Sloping coastal beach terrain · wave shoaling, surf-zone breaking & wet swash sand',
  },
  {
    Id: 'atmosphere',
    Name: 'Atmosphere',
    Panel: 'atmosphere',
    Icon: 'atmosphere',
    Parent: 'grp-world',
    Depth: 1,
    Description: 'Procedural Rayleigh/Mie sky dome and water reflection environment',
  },
  {
    Id: 'sun',
    Name: 'Sun',
    Panel: 'sun',
    Icon: 'sun',
    Parent: 'grp-world',
    Depth: 1,
    Description: 'Directional sunlight driving GGX water glints, foam relief shading and seabed caustics',
  },
  {
    Id: 'wind',
    Name: 'Wind',
    Panel: 'wind',
    Icon: 'wind',
    Parent: 'grp-world',
    Depth: 1,
    Description: 'Surface wind shear dragging advected foam rafts and driving capillary chop',
  },
  {
    Id: 'seabed',
    Name: 'Ocean Basin',
    Panel: 'seabed',
    Icon: 'seabed',
    Parent: 'grp-world',
    Depth: 1,
    Description: 'Submerged basin bathymetry floor receiving Beer-Lambert absorption and optical caustics',
  },
];

function BaseSceneValues() {
  return {
    waterbody: {
      // Bounds
      BoundWidth: 52,
      BoundLength: 52,
      WaterDepth: 4.5,
      BoundsHeight: 2.2,
      ShowBounds: true,
      ShowTankWalls: true,
      SimResolution: 256,
      BoundaryMode: 0, // 0 = Absorbing Sponge, 1 = Reflective Tank
      // Wave Solver
      WaveSpeed: 8.2,
      SwellAmplitude: 0.24,
      SwellFrequency: 0.96,
      CrossChop: 0.26,
      WaveDamping: 0.16,
      VorticityConfinement: 1.25,
      BrushStrength: 1.25,
      BrushRadius: 1.8,
      // Physical Continuum Foam (Mass-Conserving · Bounded · Zero Textures / Zero Fake Particles)
      BreakingThreshold: 0.42,
      BreakingRate: 0.85,
      ConvergenceRate: 0.72,
      HullFoamChurn: 1.15,
      ThickDrainageRate: 0.92,
      LaceRuptureRate: 0.62,
      SubsurfaceDecay: 0.75,
      FoamAdvectSlip: 0.94,
      MaxFoamBudget: 0.95,
      // Analytical Cellular Microstructure
      CellScale: 3.4,
      FilamentStretch: 1.45,
      LaceCrispness: 0.72,
      FoamRelief: 1.15,
      SubsurfaceTintStrength: 0.78,
      // Water Optics
      AbsorptionDepth: 3.4,
      ShallowColor: '#199ca8',
      DeepColor: '#04223a',
      FresnelStrength: 1.0,
      RoughnessBase: 0.024,
    },
    boat: {
      ControlMode: 'figure8',
      ThrottleSpeed: 6.2,
      TurnAgility: 1.15,
      HullLength: 6.2,
      HullBeam: 2.35,
      DraftDepth: 0.66,
      BuoyancyStiffness: 18.0,
      PitchRollDamping: 3.8,
      WakeCoupling: 1.28,
      PropWashIntensity: 1.15,
      FollowBoat: false,
    },
    shore: {
      ShoreEnabled: true,
      ShoreWidth: 15.5,
      ShoreSlope: 0.22,
      ShoreCurve: 2.8,
      SurfBreakStrength: 0.95,
      SandWetness: 0.85,
      BeachColor: '#cdb68b',
    },
    camera: {
      YawDeg: 44,
      PitchDeg: 26,
      Distance: 35,
      TargetX: 2.0,
      TargetY: 0.4,
      TargetZ: 0.0,
      FovDeg: 44,
    },
    post: {
      ExposureEV: 0.1,
      Contrast: 1.06,
      Saturation: 1.06,
      Bloom: 0.22,
      Vignette: 0.2,
    },
    atmosphere: {
      ZenithColor: '#133b6b',
      HorizonColor: '#94c0dc',
      HazeDensity: 0.22,
      SkyBrightness: 1.04,
    },
    sun: {
      AzimuthDeg: 218,
      ElevationDeg: 35,
      Intensity: 3.3,
      SunColor: '#fff2d8',
      GlintPower: 460,
    },
    wind: {
      Speed: 5.8,
      DirectionDeg: 14,
      SurfaceDrift: 0.22,
      CapillaryChop: 0.36,
    },
    seabed: {
      SandColor: '#988666',
      CausticIntensity: 1.1,
      CausticScale: 1.15,
      TankGlassOpacity: 0.32,
      StudioGridOpacity: 0.3,
    },
  };
}

export const SCENE_PRESETS = [
  {
    Id: 'calm-harbor',
    Name: 'Coastal Cove & Wake',
    Subtitle: 'Sandy cove shore · clear offshore blue, boat Kelvin wake & delicate surf foam',
    Build: () => BaseSceneValues(),
  },
  {
    Id: 'choppy-sea',
    Name: 'Surf Break & Swell',
    Subtitle: 'Onshore swells shoaling up the beach · crisp whitecaps & pitching boat run',
    Build: () => {
      const V = BaseSceneValues();
      V.waterbody.BoundWidth = 56;
      V.waterbody.BoundLength = 56;
      V.waterbody.WaterDepth = 5.2;
      V.waterbody.WaveSpeed = 9.4;
      V.waterbody.SwellAmplitude = 0.44;
      V.waterbody.SwellFrequency = 1.12;
      V.waterbody.CrossChop = 0.45;
      V.waterbody.WaveDamping = 0.13;
      V.waterbody.BreakingThreshold = 0.38;
      V.waterbody.BreakingRate = 1.1;
      V.waterbody.HullFoamChurn = 1.35;
      V.waterbody.ThickDrainageRate = 0.85;
      V.waterbody.LaceRuptureRate = 0.52;
      V.shore.ShoreWidth = 17.0;
      V.shore.SurfBreakStrength = 1.25;
      V.boat.ControlMode = 'circle';
      V.boat.ThrottleSpeed = 7.6;
      V.boat.WakeCoupling = 1.45;
      V.boat.PropWashIntensity = 1.35;
      V.wind.Speed = 10.4;
      V.wind.DirectionDeg = 10;
      V.wind.CapillaryChop = 0.62;
      V.sun.AzimuthDeg = 205;
      V.sun.ElevationDeg = 26;
      V.sun.SunColor = '#ffe6c2';
      V.atmosphere.ZenithColor = '#0d2952';
      V.atmosphere.HorizonColor = '#80a7c6';
      return V;
    },
  },
  {
    Id: 'wave-tank',
    Name: 'Wave Tank Lab',
    Subtitle: 'Reflective glass-wall bounds · clean wave interference & no-shore tank view',
    Build: () => {
      const V = BaseSceneValues();
      V.waterbody.BoundWidth = 34;
      V.waterbody.BoundLength = 34;
      V.waterbody.WaterDepth = 4.2;
      V.waterbody.BoundaryMode = 1; // Reflective tank walls
      V.waterbody.ShowBounds = true;
      V.waterbody.ShowTankWalls = true;
      V.waterbody.WaveSpeed = 8.8;
      V.waterbody.SwellAmplitude = 0.18;
      V.waterbody.SwellFrequency = 1.25;
      V.waterbody.CrossChop = 0.2;
      V.waterbody.WaveDamping = 0.12;
      V.waterbody.BreakingThreshold = 0.44;
      V.waterbody.AbsorptionDepth = 5.2;
      V.waterbody.ShallowColor = '#25b5c2';
      V.waterbody.DeepColor = '#073b59';
      V.shore.ShoreEnabled = false;
      V.boat.ControlMode = 'figure8';
      V.boat.ThrottleSpeed = 5.5;
      V.camera.TargetX = 0;
      V.camera.Distance = 27;
      V.camera.PitchDeg = 30;
      V.seabed.TankGlassOpacity = 0.44;
      V.seabed.CausticIntensity = 1.4;
      return V;
    },
  },
];

export function OutlinerMetadata(Row, Values, Telemetry) {
  if (Row.Panel === 'group') {
    const Count = OUTLINER_ROWS.filter((R) => R.Parent === Row.Id).length;
    return `${Count} item${Count === 1 ? '' : 's'}`;
  }
  const V = Values[Row.Id] || {};
  switch (Row.Panel) {
    case 'waterbody':
      return `${V.BoundWidth}×${V.BoundLength}×${Number(V.WaterDepth).toFixed(1)}m · ${V.SimResolution}²`;
    case 'boat': {
      const Spd = Telemetry?.boatSpeed != null ? Telemetry.boatSpeed.toFixed(1) : Number(V.ThrottleSpeed).toFixed(1);
      return `${Spd} m/s · ${V.ControlMode}`;
    }
    case 'shore':
      return V.ShoreEnabled ? `${Number(V.ShoreWidth).toFixed(1)}m beach · surf ${Number(V.SurfBreakStrength).toFixed(1)}` : 'Disabled';
    case 'camera':
      return `FOV ${Math.round(V.FovDeg)}° · ${Math.round(V.Distance)}m`;
    case 'post':
      return `${V.ExposureEV >= 0 ? '+' : ''}${Number(V.ExposureEV).toFixed(2)} EV`;
    case 'atmosphere':
      return `Haze ${Math.round(V.HazeDensity * 100)}%`;
    case 'sun':
      return `El ${Math.round(V.ElevationDeg)}° · Az ${Math.round(V.AzimuthDeg)}°`;
    case 'wind':
      return `${Number(V.Speed).toFixed(1)} m/s @ ${Math.round(V.DirectionDeg)}°`;
    case 'seabed':
      return `Caustics ${Number(V.CausticIntensity).toFixed(2)}`;
    default:
      return '';
  }
}

export function DeepClone(Obj) {
  return JSON.parse(JSON.stringify(Obj));
}
