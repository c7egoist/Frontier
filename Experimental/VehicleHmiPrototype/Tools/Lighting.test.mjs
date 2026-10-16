// The clustered lighting: IES import, the photometric profiles, cluster binning, the lamps, and the fixtures' geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParseIesProfile, ResampleIesProfile, BuildLowBeamGrid, BuildHighBeamGrid, BuildFogGrid, BuildStreetGrid, BuildProfileSet,
         ProfileSamples, ProfileTexels, ProfileCount, ProfileIds, BuildGrid } from '../Source/Lighting/IesProfiles.js';
import { MakeLight, PackLight, BinLights, ResolveCell, ClusterLimits, ClusterCount, LightType, PackGrid } from '../Source/Lighting/ClusteredLightStore.js';
import { ConstructLampSettings, ResolveLampAction, ApplyLampAction, BuildVehicleLights, ResolveLensScales, BeamStates, VehicleLampLayout } from '../Source/Lighting/VehicleLamps.js';
import { BuildStreetLights } from '../Source/Lighting/StreetLighting.js';
import { BuildEffectLights } from '../Source/Lighting/EffectLights.js';
import { ResolveLevelPlacements } from '../Source/LevelStructure.js';
import { ConstructMaterialSpecification, CourseMaterial } from '../Source/MaterialSpecification.js';
import { EmitLampPoleFacets, EmitLampArmFacets, EmitLampHeadFacets, EmitLedBuildingFacets, EmitRoofBarFacets, ResolveRoofHeight,
         ResolveLedStripRows, LampPostLayout, LedBuildingLayout, RoofBarLayout, ResolveLampHeadLens, LedBuildingPlacement } from '../Source/LightFixtureStructure.js';

const Identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const Close = (A, B, Tolerance = 1e-3) => assert.ok(Math.abs(A - B) <= Tolerance, `${A} vs ${B}`);
const Grid = (Table, H, V) => Table[(V + 90) / 2 * ProfileSamples + (H + 90) / 2];
const Bounds = (Facets) => {
    const Min = [Infinity, Infinity, Infinity], Max = [-Infinity, -Infinity, -Infinity];
    for (const Facet of Facets) for (const Corner of Facet.Corners) for (let A = 0; A < 3; ++A) { Min[A] = Math.min(Min[A], Corner[A]); Max[A] = Math.max(Max[A], Corner[A]); }
    return { Min, Max };
};

//------------------------------------------------------------------------------------------------------------------------
test('an LM-63 file parses and resamples onto the exhibit grid, peak-normalised', () => {
    const Text = ['IESNA:LM-63-2002', '[TEST] synthetic', 'TILT=NONE', '1 1000 1 3 2 1 2 0.1 0.1 0.1', '1 1 20', '0 45 90', '0 90',
                  '1000 500 0', '1000 500 0'].join('\n');
    const Ies = ParseIesProfile(Text);
    assert.deepEqual(Ies.Gamma, [0, 45, 90]);
    assert.deepEqual(Ies.Plane, [0, 90]);
    assert.equal(Ies.Candela[0][1], 500);
    const Table = ResampleIesProfile(Ies);
    assert.equal(Table.length, ProfileTexels);
    Close(Math.max(...Table), 1, 1e-6);
    Close(Grid(Table, 0, -90), 1);                 // straight down: γ = 0, the peak
    Close(Grid(Table, 0, 0), 0);                   // horizontal forward: γ = 90, zero
    Close(Grid(Table, 0, -46), 0.51, 0.02);        // γ ≈ 44°, between 1000 cd (nadir) and 500 cd (45°)
    assert.throws(() => ParseIesProfile('IESNA:LM-63-2002\nTILT=INCLUDE\n'), /TILT=INCLUDE/);
    assert.throws(() => ParseIesProfile('IESNA:LM-63-2002\n'), /no TILT/);
    assert.throws(() => ParseIesProfile('TILT=NONE\n1 1000 1 3 2 1 2 0.1 0.1 0.1\n1 1 20\n0 45\n'), /ends before/);
});

test('the built-in automotive and street distributions have their characters', () => {
    const Low = BuildLowBeamGrid({ CutoffDegrees: -0.6, RightRise: 0.8, AimDegrees: 0 });
    const High = BuildHighBeamGrid({ Spread: 1, AimDegrees: 0 });
    const Fog = BuildFogGrid({ CutoffDegrees: -2.5 });
    const Street = BuildStreetGrid();
    for (const Table of [Low, High, Fog, Street]) Close(Math.max(...Table), 1, 1e-6);
    assert.ok(Grid(Low, -2, -2) > 0.9, 'low beam hot spot below the horizon');
    assert.ok(Grid(Low, 0, 6) < 0.02, 'low beam is cut above the line: nothing into the sky');
    assert.ok(Grid(High, 20, -2) > Grid(Low, 20, -2), 'high beam reaches wider than low beam');
    assert.ok(Grid(High, 0, 6) > 10 * Grid(Low, 0, 6) && Grid(High, 0, 6) > 0.05, 'high beam is not cut: it lights above the axis');
    assert.ok(Grid(Fog, 0, 10) < 0.02 && Grid(Fog, 0, -8) > 0.9, 'fog lamps are low and cut above');
    assert.equal(Grid(Street, 0, 0), 1, 'a street lamp is brightest straight down');
    assert.equal(Grid(Street, 0, -90), 0, 'and throws nothing horizontally');
    const Set = BuildProfileSet(ConstructLampSettings());
    assert.equal(Set.length, ProfileCount * ProfileTexels);
    assert.ok(Set.slice(ProfileIds.Imported * ProfileTexels).every((Value) => Value === 0), 'imported slots stay empty');
    assert.equal(BuildGrid(() => 0).reduce((Sum, Value) => Sum + Value, 0), 0, 'an empty distribution stays empty');
});

test('an imported IES profile lands in its own slot of the table', () => {
    const Ies = ParseIesProfile(['TILT=NONE', '1 1000 1 3 2 1 2 0.1 0.1 0.1', '1 1 20', '0 45 90', '0 90', '1000 500 0', '1000 500 0'].join('\n'));
    const Imported = ResampleIesProfile(Ies);
    const Set = BuildProfileSet(ConstructLampSettings(), Imported);
    assert.deepEqual(Array.from(Set.slice(ProfileIds.Imported * ProfileTexels, (ProfileIds.Imported + 1) * ProfileTexels)), Array.from(Imported));
    assert.ok(Set.slice(ProfileIds.LowBeam * ProfileTexels, (ProfileIds.LowBeam + 1) * ProfileTexels).some((Value) => Value > 0));
});

//------------------------------------------------------------------------------------------------------------------------
test('clusters bin each light into the cells its reach touches, and keep the earliest lights when a cell is full', () => {
    const Light = MakeLight({ Type: LightType.Point, Position: [10, 0, 2], Forward: [0, 0, -1], Up: [1, 0, 0], Colour: [1, 1, 1], Reach: 3 });
    const { Ranges, Entries, Stats } = BinLights([Light]);
    const Cell = ResolveCell([10, 0, 2]);
    assert.ok(Cell !== null);
    assert.ok(Array.from(Entries.slice(Ranges[Cell * 2], Ranges[Cell * 2] + Ranges[Cell * 2 + 1])).includes(0));
    assert.equal(Stats.Dropped, 0);
    assert.equal(ResolveCell([10000, 0, 0]), null);
    const Far = MakeLight({ Type: LightType.Point, Position: [5000, 0, 0], Forward: [0, 0, -1], Up: [1, 0, 0], Colour: [1, 1, 1], Reach: 3 });
    assert.equal(BinLights([Far]).Stats.Entries, 0, 'a light off the grid is in no cell');
    const Crowd = Array.from({ length: ClusterLimits.MaxPerCell + 12 }, () => MakeLight({ Type: LightType.Point, Position: [10, 0, 2], Forward: [0, 0, -1], Up: [1, 0, 0],
                                                              Colour: [1, 1, 1], Reach: 1 }));
    const Crowded = BinLights(Crowd);
    assert.equal(Crowded.Stats.BusiestCell, ClusterLimits.MaxPerCell);
    assert.ok(Crowded.Stats.Dropped >= 12, 'the lights beyond the cell cap are counted as dropped');
    const CellIndex = ResolveCell([10, 0, 2]);
    assert.deepEqual(Array.from(Crowded.Entries.slice(Crowded.Ranges[CellIndex * 2], Crowded.Ranges[CellIndex * 2] + ClusterLimits.MaxPerCell)),
                     Array.from({ length: ClusterLimits.MaxPerCell }, (_, I) => I), 'the earliest lights are kept');
    assert.equal(Crowded.Ranges.length, ClusterCount * 2);
    assert.equal(PackGrid(7).byteLength, 48);
});

test('a light packs to the 20-float record the shader reads, with an orthonormal frame', () => {
    const Light = MakeLight({ Type: LightType.Spot, Position: [1, 2, 3], Forward: [1, 0, 0], Up: [1, 0, 1], Colour: [4, 5, 6], Reach: 7, Profile: 2, Shadow: true });
    const Packed = PackLight(Light);
    assert.equal(Packed.length, ClusterLimits.RecordFloats);
    assert.deepEqual(Array.from(Packed.slice(0, 4)), [1, 2, 3, 7]);
    assert.equal(Packed[7], LightType.Spot);
    assert.equal(Packed[11], 2);
    assert.equal(Packed[15], 1, 'the shadow flag');
    const Dot = Packed[4] * Packed[8] + Packed[5] * Packed[9] + Packed[6] * Packed[10];
    Close(Dot, 0, 1e-6);
});

//------------------------------------------------------------------------------------------------------------------------
test('the I key steps the beam off, low, high; Shift+I toggles fog; L toggles the roof flood; other modifiers are left alone', () => {
    const Key = (Code, Modifiers = {}) => ({ code: Code, ctrlKey: false, altKey: false, metaKey: false, repeat: false, shiftKey: false, ...Modifiers });
    assert.equal(ResolveLampAction(Key('KeyI')), 'Beam');
    assert.equal(ResolveLampAction(Key('KeyI', { shiftKey: true })), 'Fog');
    assert.equal(ResolveLampAction(Key('KeyL')), 'RoofFlood');
    assert.equal(ResolveLampAction(Key('KeyI', { ctrlKey: true })), null);
    assert.equal(ResolveLampAction(Key('KeyI', { repeat: true })), null);
    assert.equal(ResolveLampAction(Key('KeyJ')), null, 'the distance-slice inset moved from I to J');
    const Lamps = ConstructLampSettings();
    const Cycle = [];
    for (let Step = 0; Step < 4; ++Step) { ApplyLampAction(Lamps, 'Beam'); Cycle.push(BeamStates[Lamps.Beam]); }
    assert.deepEqual(Cycle, ['Low', 'High', 'Off', 'Low']);
    ApplyLampAction(Lamps, 'Fog');
    assert.equal(Lamps.Fog, true);
    assert.match(ApplyLampAction(Lamps, 'RoofFlood'), /roof flood/);
    ApplyLampAction(Lamps, 'Fog');
    assert.equal(Lamps.Fog, false);
});

test('the headlamps, fog lamps and roof flood attach to the body and follow its transform', () => {
    const Lamps = ConstructLampSettings();
    assert.deepEqual(BuildVehicleLights(Lamps, Identity, null), [], 'nothing on: no lights');
    Lamps.Beam = 1;
    const Low = BuildVehicleLights(Lamps, Identity, null);
    assert.equal(Low.length, 2);
    assert.ok(Low.every((Light) => Light.Type === LightType.Spot && Light.Profile === ProfileIds.LowBeam && Light.Shadow));
    Close(Low[0].Position[0], VehicleLampLayout.HeadlampX); Close(Low[0].Position[1], -VehicleLampLayout.HeadlampY); Close(Low[1].Position[1], VehicleLampLayout.HeadlampY);
    Lamps.Beam = 2;
    assert.ok(BuildVehicleLights(Lamps, Identity, null).every((Light) => Light.Profile === ProfileIds.HighBeam));
    Lamps.Beam = 0; Lamps.Fog = true;
    assert.equal(BuildVehicleLights(Lamps, Identity, null).length, 2);
    Lamps.Fog = false; Lamps.RoofFlood = true;
    const Roof = { Position: [0.5, 0, 1.3], Forward: [1, 0, -0.05], Up: [0, 0, 1] };
    const Flood = BuildVehicleLights(Lamps, Identity, Roof);
    assert.equal(Flood.length, 1);
    assert.equal(Flood[0].Profile, ProfileIds.Flood);
    // A car turned a quarter turn about +Z and moved to (10, 20): the headlamp at (3.13, 0.70, 0.43) lands at (9.30, 23.13, 0.43).
    const Turned = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1];
    Lamps.Fog = false; Lamps.RoofFlood = false; Lamps.Beam = 1;
    const Moved = BuildVehicleLights(Lamps, Turned, null);
    Close(Moved[1].Position[0], 9.30); Close(Moved[1].Position[1], 23.13); Close(Moved[1].Position[2], 0.43);
    Close(Moved[1].Forward[1], 1, 1e-6);                          // the beam now points along +Y
    const Lens = ResolveLensScales({ Beam: 0, Fog: false, RoofFlood: false });
    assert.ok(Lens.Headlight < 1 && Lens.FogLens < 1 && Lens.FloodLens < 1);
    assert.equal(ResolveLensScales({ Beam: 2, Fog: true, RoofFlood: true }).Headlight, 1);
});

//------------------------------------------------------------------------------------------------------------------------
test('the lamppost is a pole, an arm and a luminaire, and its lens faces down', () => {
    const Pole = Bounds(EmitLampPoleFacets()), Arm = Bounds(EmitLampArmFacets()), Head = EmitLampHeadFacets();
    assert.ok(Pole.Max[2] <= LampPostLayout.PoleHeight + 1e-6 && Pole.Min[2] >= -1e-6, 'the pole stands on the ground');
    assert.ok(Math.max(Math.abs(Pole.Min[0]), Math.abs(Pole.Max[0])) <= 0.31, 'the pole is collider-sized');
    close(Arm.Min[0], 0); close(Arm.Max[0], LampPostLayout.ArmLength); close(Arm.Min[2], LampPostLayout.ArmBottom, 1e-6);
    const Lens = Head.filter((Facet) => Facet.Family === CourseMaterial.StreetLens);
    assert.equal(Lens.length, 2);
    for (const Facet of Lens)
    {
        const [A, B, C] = Facet.Corners;
        const Normal = [(B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]),
                        (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])];
        assert.ok(Normal[2] < 0, 'the lens faces down');
    }
    const Lamp = ResolveLampHeadLens(10, 5, Math.PI / 2);
    close(Lamp.Position[0], 10); close(Lamp.Position[1], 5); close(Lamp.Position[2], LampPostLayout.LensZ);
    close(Lamp.Up[1], 1, 1e-9, 'the lens face runs along the arm');
    assert.deepEqual(Lamp.Forward, [0, 0, -1]);
    assert.ok(ResolveLevelPlacements().filter((Placement) => Placement.Shape === 'LampHead').length === 20, 'twenty street lamps are placed');
});

test('the LED building faces +X with three strip rows, and the roof bar sits on the roof', () => {
    const Building = Bounds(EmitLedBuildingFacets());
    close(Building.Max[0], LedBuildingLayout.Length / 2 + 0.03, 1e-6, 'the strips stand off the facade');
    const Rows = ResolveLedStripRows();
    assert.equal(Rows.length, 3);
    assert.ok(Rows.every((Row) => Row.Forward[0] === 1 && Row.Centre[0] > LedBuildingLayout.Length / 2));
    const Body = [];
    for (let X = -1; X <= 1; X += 0.25) for (let Y = -0.6; Y <= 0.6; Y += 0.3)
        Body.push({ Corners: [[X, Y, 1.24], [X + 0.1, Y, 1.24], [X, Y + 0.1, 1.24]], Family: 9 });
    close(ResolveRoofHeight(Body), 1.24, 1e-6);
    const Bar = Bounds(EmitRoofBarFacets(Body));
    assert.ok(Bar.Min[2] > 1.2 && Bar.Max[2] < 1.4, 'the bar is on the roof');
    close(Bar.Max[0] - Bar.Min[0], RoofBarLayout.Length + RoofBarLayout.LensProud, 1e-6, 'the lens stands proud of the housing');
});

test('the course lights come from the same placements as the geometry, and have the fixtures\' colours', () => {
    const Materials = ConstructMaterialSpecification();
    const Lights = BuildStreetLights(ResolveLevelPlacements(), Materials, ConstructLampSettings());
    const Count = (Type) => Lights.filter((Light) => Light.Type === Type).length;
    assert.equal(Count(LightType.Spot), 20, 'one IES street downlight per lamp');
    assert.equal(Count(LightType.Rect), 8 + 6 + 2 + 3 + 0, 'tunnel, hangar, gantry and LED strip rows are area lights');
    assert.ok(Lights.filter((Light) => Light.Type === LightType.Spot).every((Light) => Light.Profile === ProfileIds.Street && Light.Forward[2] === -1));
    assert.ok(Lights.every((Light) => Light.Colour.every(Number.isFinite) && Light.Reach > 0));
    const Led = Lights.find((Light) => Light.Reach === 18);
    assert.ok(Led && Led.Colour[2] > 0);
});

test('the effect lights stay within their bins and the set budget (sparks and derez)', () => {
    const Sparks = { Settings: { Enabled: true, Brightness: 1 }, Particles: Array.from({ length: 60 }, (_, I) => ({ Position: [I * 0.4, 0, 1], Kelvin: 2800, Size: 1 })) };
    const Lights = BuildEffectLights(Sparks, { Clock: 0, Settings: { Intensity: 1, Faces: false, GlowStrength: 6, Glow: '#35d6ff', Drag: 0.4 }, Emitters: [] });
    assert.ok(Lights.length > 0 && Lights.length <= 12);
    assert.ok(Lights.every((Light) => Light.Type === LightType.Point && Light.Shadow === false));
});

function close(A, B, Tolerance = 1e-6)
{
    assert.ok(Math.abs(A - B) <= Tolerance, `${A} vs ${B}`);
}
