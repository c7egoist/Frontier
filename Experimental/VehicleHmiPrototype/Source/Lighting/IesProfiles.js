//============================================================================================================================================
//                                                          IESPROFILES.JS
//============================================================================================================================================
// 🧩 Photometric distributions for the clustered lights: an IES LM-63 importer, tabulated profile grids, and the analytic
//    automotive and street distributions the exhibit ships with (low beam, high beam, fog, roof flood, street downlight).

// 📐 Every profile is one (horizontal, vertical) grid in the light's own frame, not an IES (C, γ) grid. Horizontal h is the
//    signed angle from the forward axis towards the light's right, vertical v is the signed angle towards its up, both in
//    degrees over [−90°, 90°] in ProfileStepDegrees steps. The shader (ClusteredLights.wgsl) reads the same grid with the
//    same convention, so the values here are the candela distribution directly, normalised to a peak of one.
export const ProfileStepDegrees = 2.0;                                                    // [°]
export const ProfileSamples     = Math.round(180.0 / ProfileStepDegrees) + 1;             // [-] 91 per axis
export const ProfileTexels      = ProfileSamples * ProfileSamples;                        // [-] one table row per profile

export const ProfileIds = Object.freeze({
    LowBeam:   0,   // [-] asymmetric cut-off, hot spot and a dimmer spill
    HighBeam:  1,   // [-] full-width reflector beam, no cut-off
    Fog:       2,   // [-] wide, flat and low; a hard upper cut-off
    Flood:     3,   // [-] roof-bar flood: wide, flat-topped
    Street:    4,   // [-] street luminaire: full cut-off, cos-shaped downlight
    Imported:  5    // [-] an LM-63 file loaded at run time (ResampleIesProfile)
});
export const ProfileCount = 6;

//------------------------------------------------------------------------------------------------------------------------
//                                                    IES LM-63 IMPORT
//------------------------------------------------------------------------------------------------------------------------

// 📝 Parses an LM-63 (IESNA) text file with TILT=NONE. The numeric block is: ten header numbers (lamp count, lumens per lamp,
//    candela multiplier, vertical angle count, horizontal angle count, photometric type, units, width, length, height), three
//    more (ballast factor, ballast-lamp factor, input watts), the vertical angles γ from the nadir, the horizontal angles C,
//    then the candela table with one row per horizontal angle. Returns { Gamma, Plane, Candela[plane][gamma], Multiplier }.
export function ParseIesProfile(Text)
{
    const Lines = String(Text).split(/\r?\n/);
    const TiltAt = Lines.findIndex((Line) => /^\s*TILT=/i.test(Line));
    if (TiltAt < 0)
        throw new Error("IES: no TILT= line");
    if (/^\s*TILT=INCLUDE/i.test(Lines[TiltAt]))
        throw new Error("IES: TILT=INCLUDE files (with a tilt table) are not supported");
    const Numbers = Lines.slice(TiltAt + 1).join(" ").trim().split(/[\s,]+/).filter((Token) => Token.length > 0).map(Number);
    if (Numbers.some((Value) => !Number.isFinite(Value)))
        throw new Error("IES: the numeric block contains a non-number");
    let Cursor = 0;
    const Take = (Count) =>
    {
        if (Cursor + Count > Numbers.length)
            throw new Error("IES: the file ends before its candela table");
        const Slice = Numbers.slice(Cursor, Cursor + Count);
        Cursor += Count;
        return Slice;
    };
    const Header = Take(10);
    const Ballast = Take(3);
    const Multiplier = Header[2] * Ballast[0];
    const GammaCount = Header[3], PlaneCount = Header[4];
    if (GammaCount < 2 || PlaneCount < 1)
        throw new Error("IES: the table needs at least two vertical angles and one horizontal angle");
    const Gamma = Take(GammaCount);
    const Plane = Take(PlaneCount);
    const Table = Take(GammaCount * PlaneCount);
    const Candela = [];
    for (let P = 0; P < PlaneCount; ++P)
        Candela.push(Table.slice(P * GammaCount, (P + 1) * GammaCount).map((Value) => Math.max(0, Value)));
    return { Gamma, Plane, Candela, Multiplier };
}

// 📝 Interpolates one table at an arbitrary plane and angle, mirroring the planes the file's span implies: 0–90° is
//    quadrant-symmetric, 0–180° mirrors about the 0°/180° plane, anything wider is taken as given.
function SampleIesTable(Ies, PlaneDegrees, GammaDegrees)
{
    const Planes = Ies.Plane, Gammas = Ies.Gamma, Last = Planes[Planes.length - 1];
    let C = ((PlaneDegrees % 360) + 360) % 360;
    if (Last <= 90.0)
    {
        if (C > 180.0) C = 360.0 - C;
        if (C > 90.0)  C = 180.0 - C;
    }
    else if (Last <= 180.0 && C > 180.0)
        C = 360.0 - C;
    const P0 = Math.max(0, Math.min(Planes.length - 2, Planes.findLastIndex((Value) => Value <= C)));
    const P1 = Math.min(Planes.length - 1, P0 + 1);
    const PlaneSpan = Planes[P1] - Planes[P0];
    const TP = PlaneSpan > 0 ? Math.max(0, Math.min(1, (C - Planes[P0]) / PlaneSpan)) : 0;
    const Gamma = Math.max(Gammas[0], Math.min(Gammas[Gammas.length - 1], GammaDegrees));
    const G0 = Math.max(0, Math.min(Gammas.length - 2, Gammas.findLastIndex((Value) => Value <= Gamma)));
    const G1 = G0 + 1;
    const GammaSpan = Gammas[G1] - Gammas[G0];
    const TG = GammaSpan > 0 ? (Gamma - Gammas[G0]) / GammaSpan : 0;
    const Row = (P) => Ies.Candela[P][G0] * (1 - TG) + Ies.Candela[P][G1] * TG;
    return (Row(P0) * (1 - TP) + Row(P1) * TP) * Ies.Multiplier;
}

// 📐 Resamples an imported IES distribution onto the exhibit grid. A grid direction (forward, right, up) = (1, tan h, tan v)
//    becomes IES coordinates with the forward axis as the C = 0 plane and the luminaire's down axis as the nadir (γ = 0).
export function ResampleIesProfile(Ies)
{
    return BuildGrid((H, V) =>
    {
        const Direction = NormalizeTriple([1.0, Math.tan(H * Math.PI / 180), Math.tan(V * Math.PI / 180)]);
        if (Direction[0] <= 0)
            return 0;
        const Gamma = Math.acos(Math.max(-1, Math.min(1, -Direction[2]))) * 180.0 / Math.PI;
        const Plane = (Math.atan2(Direction[1], Direction[0]) * 180.0 / Math.PI + 360.0) % 360.0;
        return SampleIesTable(Ies, Plane, Gamma);
    });
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   ANALYTIC PROFILES
//------------------------------------------------------------------------------------------------------------------------

function NormalizeTriple(V)
{
    const Length = Math.hypot(V[0], V[1], V[2]) || 1;
    return [V[0] / Length, V[1] / Length, V[2] / Length];
}

// 📝 Fills a grid from a function of (h, v) in degrees, then normalises it so its peak is one.
export function BuildGrid(Distribution)
{
    const Grid = new Float32Array(ProfileTexels);
    let Peak = 0;
    for (let Vi = 0; Vi < ProfileSamples; ++Vi)
        for (let Hi = 0; Hi < ProfileSamples; ++Hi)
        {
            const H = Hi * ProfileStepDegrees - 90.0, V = Vi * ProfileStepDegrees - 90.0;
            const Value = Math.max(0, Distribution(H, V));
            Grid[Vi * ProfileSamples + Hi] = Value;
            Peak = Math.max(Peak, Value);
        }
    if (Peak > 0)
        for (let Index = 0; Index < Grid.length; ++Index)
            Grid[Index] /= Peak;
    return Grid;
}

const Gaussian = (X, Centre, Width) => Math.exp(-(((X - Centre) / Width) ** 2));

// 📝 Low beam: a hot spot just under the horizon, a broad spill below it and a hard horizontal cut-off. ECE-style asymmetry
//    lifts the cut-off on the right by `RightRise` degrees (the kerb side under right-hand traffic).
export function BuildLowBeamGrid(Settings = {})
{
    const Cut = Settings.CutoffDegrees ?? -0.6;
    const RightRise = Settings.RightRise ?? 0.8;
    const Aim = Settings.AimDegrees ?? 0.0;
    return BuildGrid((H, V) =>
    {
        const Vertical = V - Aim;
        const Limit = Cut + RightRise * Math.min(1, Math.max(0, H) / 6.0);
        // Above the cut-off only a faint stray-light leak remains: nothing glows into the sky.
        const Cutoff = Vertical > Limit ? Math.exp(-(Vertical - Limit) * 3.0) * 0.02 : 1.0;
        const HotSpot = Gaussian(H, -2.0, 7.5) * Gaussian(Vertical, -1.8, 2.4);
        const Broad = 0.34 * Gaussian(H, 0.0, 19.0) * Gaussian(Vertical, -5.0, 6.5);
        const Spill = 0.05 * Gaussian(H, 0.0, 40.0) * Math.exp(Math.min(0, Vertical) / 18.0);
        return (HotSpot + Broad + Spill) * Cutoff;
    });
}

// 📝 High beam: a full reflector beam centred on the axis, hotter in the middle, with no cut-off at all.
export function BuildHighBeamGrid(Settings = {})
{
    const Aim = Settings.AimDegrees ?? 0.0;
    const Spread = Settings.Spread ?? 1.0;
    return BuildGrid((H, V) =>
    {
        const Vertical = V - Aim;
        const Core = Gaussian(H, 0.0, 9.0 * Spread) * Gaussian(Vertical, -0.6, 3.6 * Spread);
        const Wide = 0.42 * Gaussian(H, 0.0, 20.0 * Spread) * Gaussian(Vertical, -1.5, 8.0 * Spread);
        return Core + Wide;
    });
}

// 📝 Fog lamps: wide and flat, aimed low so the light stays on the road, cut hard above a few degrees below the axis.
export function BuildFogGrid(Settings = {})
{
    const Cut = Settings.CutoffDegrees ?? -2.5;
    return BuildGrid((H, V) =>
    {
        const Upper = V > Cut ? Math.exp(-(V - Cut) * 2.5) * 0.03 : 1.0;
        return Gaussian(H, 0.0, 26.0) * Gaussian(V, -7.5, 5.5) * Upper;
    });
}

// 📝 Roof flood bar: a wide, flat-topped beam (a super-Gaussian), aimed slightly down.
export function BuildFloodGrid(Settings = {})
{
    const Width = Settings.Width ?? 40.0, Height = Settings.Height ?? 22.0, Aim = Settings.AimDegrees ?? -4.0;
    return BuildGrid((H, V) => Math.exp(-((H / Width) ** 4)) * Math.exp(-(((V - Aim) / Height) ** 4)));
}

// 📝 Street luminaire: a downlight along the frame's forward axis (which points at the ground); full cut-off past 80° from the
//    nadir and cos^1.6 falloff inside it, so no light goes sideways into the sky.
export function BuildStreetGrid()
{
    return BuildGrid((H, V) =>
    {
        const Theta = Math.atan(Math.hypot(Math.tan(H * Math.PI / 180), Math.tan(V * Math.PI / 180))) * 180 / Math.PI;
        return Theta > 80.0 ? 0.0 : Math.cos(Theta * Math.PI / 180) ** 1.6;
    });
}

// 📝 The table for every profile, in ProfileIds order: the built-in distributions, and the imported one when a file is loaded.
export function BuildProfileSet(LampSettings, Imported = null)
{
    const Table = new Float32Array(ProfileCount * ProfileTexels);
    const Parts = [
        [ProfileIds.LowBeam,  BuildLowBeamGrid(LampSettings.LowBeam)],
        [ProfileIds.HighBeam, BuildHighBeamGrid(LampSettings.HighBeam)],
        [ProfileIds.Fog,      BuildFogGrid(LampSettings.FogLamp)],
        [ProfileIds.Flood,    BuildFloodGrid(LampSettings.Flood)],
        [ProfileIds.Street,   BuildStreetGrid()]
    ];
    for (const [Id, Grid] of Parts)
        Table.set(Grid, Id * ProfileTexels);
    if (Imported)
        Table.set(Imported, ProfileIds.Imported * ProfileTexels);
    return Table;
}
