// AUTO-GENERATED from web/src/core/params.ts (GLOBALS_FIELDS) by tools/gen-globals.mjs.
// Do not edit by hand -- run `npm run gen:globals` after changing the schema.
// Byte size: 1008

#pragma once

struct Globals {
  /// render target size in pixels
  resolution: vec2<f32>,                    // @0
  invResolution: vec2<f32>,                 // @8
  /// seconds since start
  time: f32,                                // @16
  /// real frame delta (clamped)
  dt: f32,                                  // @20
  /// particle solver delta used this frame
  simDt: f32,                               // @24
  simDtInv: f32,                            // @28
  frame: u32,                               // @32
  frameParity: u32,                         // @36
  cameraPos: vec3<f32>,                     // @48
  cameraUnderwater: u32,                    // @60
  nearPlane: f32,                           // @64
  farPlane: f32,                            // @68
  /// projection y scale = 1/tan(fovY/2); used to size particle splats
  projScaleY: f32,                          // @72
  viewProj: mat4x4<f32>,                    // @80
  invViewProj: mat4x4<f32>,                 // @144
  view: mat4x4<f32>,                        // @208
  invView: mat4x4<f32>,                     // @272
  /// unit vector pointing *towards* the sun
  sunDir: vec3<f32>,                        // @336
  sunIntensity: f32,                        // @348
  sunColor: vec3<f32>,                      // @352
  exposure: f32,                            // @364
  windDir: vec2<f32>,                       // @368
  windSpeed: f32,                           // @376
  gravity: f32,                             // @380
  fogDensity: f32,                          // @384
  /// per-metre absorption, e.g. (0.35, 0.09, 0.05)
  waterTint: vec3<f32>,                     // @400
  foamBrightness: f32,                      // @412
  /// world XZ of the bathymetry domain centre
  bedOrigin: vec2<f32>,                     // @416
  /// open-ocean depth (m, positive down)
  bedDepth: f32,                            // @424
  /// maximum shoal rise (m); kept under the surface
  bedShoalAmp: f32,                         // @428
  /// shoal feature size (m)
  bedShoalScale: f32,                       // @432
  bedSeed: f32,                             // @436
  /// shallowest water depth over a shoal (m)
  bedMinDepth: f32,                         // @440
  /// half extent of the baked bathymetry texture (m)
  bedWorldHalf: f32,                        // @444
  /// amplitude of the analytic seed sea state (m)
  sweInitAmp: f32,                          // @448
  /// dominant wavelength of the seed sea state (m)
  sweInitWavelength: f32,                   // @452
  /// world shift applied this frame to camera-following lattices
  domainOffset: vec2<f32>,                  // @456
  /// min corner of the fine particle lattice (world XZ)
  sweOrigin: vec2<f32>,                     // @464
  sweSize: vec2<f32>,                       // @472
  /// lattice spacing (m). base area per particle = dx*dx
  sweDx: f32,                               // @480
  /// SPH kernel radius (m)
  sweH: f32,                                // @484
  /// rest column depth (m)
  sweDepth: f32,                            // @488
  sweViscosity: f32,                        // @492
  /// depth below which particles are parked (m)
  sweDryDepth: f32,                         // @496
  /// Froude-like threshold that spawns whitecaps
  sweBreaking: f32,                         // @500
  sweCellSize: f32,                         // @504
  sweCount: u32,                            // @508
  sweGridW: u32,                            // @512
  sweGridH: u32,                            // @516
  sweSubsteps: u32,                         // @520
  sweDamping: f32,                          // @524
  /// width (m) of the absorbing band on the domain edge
  sweSponge: f32,                           // @528
  /// min corner of the coarse lattice (world XZ)
  cswOrigin: vec2<f32>,                     // @536
  cswSize: vec2<f32>,                       // @544
  /// coarse lattice spacing (m); same solver, bigger cells
  cswDx: f32,                               // @552
  cswH: f32,                                // @556
  cswCellSize: f32,                         // @560
  cswCount: u32,                            // @564
  cswGridW: u32,                            // @568
  cswGridH: u32,                            // @572
  /// update rate of the coarse layer (Hz); lower than the fine one
  cswHz: f32,                               // @576
  waveCount: u32,                           // @580
  /// half-extent of the camera-following swell domain (m)
  waveDomain: f32,                          // @584
  waveAmp: f32,                             // @588
  waveAmpVariance: f32,                     // @592
  waveAmpMean: f32,                         // @596
  waveWavelength: f32,                      // @600
  waveSpeedScale: f32,                      // @604
  waveSteepness: f32,                       // @608
  /// extra spread of long waves with distance
  waveDistScale: f32,                       // @612
  /// min corner of the near-field grid
  mpmOrigin: vec3<f32>,                     // @624
  mpmDx: f32,                               // @636
  mpmGrid: vec3<u32>,                       // @640
  mpmMaxParticles: u32,                     // @652
  mpmParticleRadius: f32,                   // @656
  mpmMass: f32,                             // @660
  /// Tait equation stiffness k
  mpmStiffness: f32,                        // @664
  mpmGamma: f32,                            // @668
  mpmViscosity: f32,                        // @672
  mpmFriction: f32,                         // @676
  /// cells per tile edge (tiles are the dispatch unit)
  mpmTileSize: u32,                         // @680
  /// tiles per axis
  mpmTiles: vec3<u32>,                      // @688
  mpmActiveTiles: u32,                      // @700
  /// radius around the camera that is simulated (m)
  mpmActiveRadius: f32,                     // @704
  /// vertical extent of the near-field box (m)
  mpmDepth: f32,                            // @708
  mpmSubsteps: u32,                         // @712
  mpmCfl: f32,                              // @716
  /// reference density (kg/m^3), used for EOS + node thresholds
  mpmRestDensity: f32,                      // @720
  /// depth below the 2D surface at which 3D water is returned to it
  mpmAbsorbDepth: f32,                      // @724
  /// per-particle probability per frame of spawning a 3D particle at a breaking crest
  mpmSpawnRate: f32,                        // @728
  /// whitecap metric above which crests feed the 3D layer
  mpmSpawnBreaking: f32,                    // @732
  foamBreakingBias: f32,                    // @736
  foamCount: u32,                           // @740
  foamLifetime: f32,                        // @744
  foamSpawnRate: f32,                       // @748
  foamDrag: f32,                            // @752
  sprayCount: u32,                          // @756
  sprayLifetime: f32,                       // @760
  sprayGravity: f32,                        // @764
  foamFarOrigin: vec2<f32>,                 // @768
  foamFarSize: vec2<f32>,                   // @776
  nearHeightOrigin: vec2<f32>,              // @784
  nearHeightSize: vec2<f32>,                // @792
  farHeightOrigin: vec2<f32>,               // @800
  farHeightSize: vec2<f32>,                 // @808
  /// near height field resolution in texels
  nearHeightRes: vec2<u32>,                 // @816
  farHeightRes: vec2<u32>,                  // @824
  seaLevel: f32,                            // @832
  /// 1 when the near field was updated this frame
  nearHeightUse: f32,                       // @836
  detailAmp: f32,                           // @840
  detailScale: f32,                         // @844
  detailSpeed: f32,                         // @848
  sssStrength: f32,                         // @852
  ssrStrength: f32,                         // @856
  foamStrength: f32,                        // @860
  shoreFoam: f32,                           // @864
  /// clipmap geomorph amount 0..1 (0 = pure per-level grid)
  meshMorph: f32,                           // @868
  meshLevel0Spacing: f32,                   // @872
  meshLevels: u32,                          // @876
  meshRes: u32,                             // @880
  fluidParticleRadius: f32,                 // @884
  fluidFilterRadius: f32,                   // @888
  fluidThicknessScale: f32,                 // @892
  fluidRefraction: f32,                     // @896
  fluidSpecular: f32,                       // @900
  fluidAbsorb: f32,                         // @904
  fluidFoam: f32,                           // @908
  /// narrow-range filter depth tolerance (m)
  fluidFilterRange: f32,                    // @912
  /// speed (m/s) at which 3D particles start to read as foam
  fluidFoamSpeed: f32,                      // @916
  fluidScatter: f32,                        // @920
  shadowSteps: u32,                         // @924
  shadowSoftness: f32,                      // @928
  shadowStrength: f32,                      // @932
  /// wind -> surface stress coefficient (m/s^2 per unit windSpeed^2)
  windStress: f32,                          // @936
  /// interaction point in world XZ
  pointerPos: vec2<f32>,                    // @944
  pointerPrev: vec2<f32>,                   // @952
  pointerForce: f32,                        // @960
  pointerRadius: f32,                       // @964
  pointerActive: u32,                       // @968
  /// 0 none, 1 push, 2 stir, 3 calm, 4 lift (feeds the MPM layer)
  pointerMode: u32,                         // @972
  /// safety clamp on particle acceleration (m/s^2)
  maxAccel: f32,                            // @976
  /// quadratic bottom friction coefficient
  bottomDrag: f32,                          // @980
  /// 0 = shaded, 1 = height, 2 = normals, 3 = foam, 4 = velocity, 5 = cells
  debugView: u32,                           // @984
  qualityLevel: u32,                        // @988
  renderScale: f32,                         // @992
  /// hard cap of the SPH inner loop (perf guard)
  maxNeighbors: u32,                        // @996
  seed: u32,                                // @1000
};

@group(0) @binding(0) var<uniform> P: Globals;
