/*==========================================================================================================================================
                                                           PLUMETRANSPORT.CPP
==========================================================================================================================================*/
// 🧩 1:1 C++ port of Shaders/PlumeAdvection.wgsl, PlumeVorticity.wgsl and PlumePressure.wgsl. Each @compute entry
//    point keeps its name and iterates its lattice cell-for-cell with the same math.
//
//    Pass parity follows the exhibit's RecordTransport: AdvectVelocity reads the current velocity state and writes
//    the next; every later pass of the step reads and refines that next buffer in place (Curl → Confine →
//    Divergence → Relax×sweeps → Project), then AdvectThermo backtraces through the final velocity.

#include "PlumeTransport.h"

#include <algorithm>
#include <cmath>

namespace FluidSmoke
{

namespace
{

constexpr float VelocitySolidReach = 0.0f;     // [cells]
constexpr float ThermoSolidReach   = -0.25f;   // [cells]
constexpr float SubgridHeatRise  = 1.4f;       // [m/s] at 40 K and above
constexpr float SubgridFlameRise = 1.1f;       // [m/s] at unit flame and above

inline int Wrap(int V, int E) { return ((V % E) + E) % E; }
inline int ClampInt(int V, int Lo, int Hi) { return std::min(std::max(V, Lo), Hi); }

inline size_t VelocityIndex(const PlumeRecord& P, int X, int Y, int Z)
{
    const Vec3i T = ResolveVelocityTexel(P, { X, Y, Z });
    return (static_cast<size_t>(T.Z) * P.VelocityExtent.Y + static_cast<size_t>(T.Y)) * P.VelocityExtent.X + T.X;
}

inline size_t ThermoIndex(const PlumeRecord& P, int X, int Y, int Z)
{
    const Vec3i T = ResolveThermoTexel(P, { X, Y, Z });
    return (static_cast<size_t>(T.Z) * P.ThermoExtent.Y + static_cast<size_t>(T.Y)) * P.ThermoExtent.X + T.X;
}

// 📝 textureLoad(VelocityState, ResolveVelocityTexel(Plume, clamp(Local)), 0)
inline Vec4 LoadVelocity(const PlumeSpace& Space, int State, int X, int Y, int Z)
{
    const PlumeRecord& P = Space.Record;
    const int Cx = ClampInt(X, 0, static_cast<int>(P.VelocityExtent.X) - 1);
    const int Cy = ClampInt(Y, 0, static_cast<int>(P.VelocityExtent.Y) - 1);
    const int Cz = ClampInt(Z, 0, static_cast<int>(P.VelocityExtent.Z) - 1);
    return Space.Velocity[State][VelocityIndex(P, Cx, Cy, Cz)];
}

// 📝 textureSampleLevel: trilinear, repeat on U/V (the toroidal wrap), clamp on W.
Vec4 Sample3D(const std::vector<Vec4>& Lattice, const PlumeRecord& P, bool Thermo, const Vec3& Position)
{
    const Vec3u Extent = Thermo ? P.ThermoExtent : P.VelocityExtent;
    const Vec3 C = Thermo ? ProjectThermoCoordinates(P, Position) : ProjectVelocityCoordinates(P, Position);
    float U = C[0] * static_cast<float>(Extent.X) - 0.5f;
    float V = C[1] * static_cast<float>(Extent.Y) - 0.5f;
    float W = C[2] * static_cast<float>(Extent.Z) - 0.5f;
    U = U - std::floor(U / static_cast<float>(Extent.X)) * static_cast<float>(Extent.X);   // repeat
    V = V - std::floor(V / static_cast<float>(Extent.Y)) * static_cast<float>(Extent.Y);   // repeat
    W = std::clamp(W, 0.0f, static_cast<float>(Extent.Z) - 1.0f);                           // clamp
    const int X0 = static_cast<int>(std::floor(U)), Y0 = static_cast<int>(std::floor(V)), Z0 = static_cast<int>(std::floor(W));
    const float Fx = U - X0, Fy = V - Y0, Fz = W - Z0;
    const int Ex = static_cast<int>(Extent.X), Ey = static_cast<int>(Extent.Y), Ez = static_cast<int>(Extent.Z);
    const auto Texel = [&](int X, int Y, int Z) -> Vec4
    {
        if (Thermo)
        {
            const Vec3i T = ResolveThermoTexel(P, { X, Y, Z });
            return Lattice[(static_cast<size_t>(T.Z) * Extent.Y + T.Y) * Extent.X + T.X];
        }
        const Vec3i T = ResolveVelocityTexel(P, { X, Y, Z });
        return Lattice[(static_cast<size_t>(T.Z) * Extent.Y + T.Y) * Extent.X + T.X];
    };
    Vec4 R{};
    for (int Zc = 0; Zc < 2; ++Zc)
    {
        const int Z = ClampInt(Z0 + Zc, 0, Ez - 1);
        const float Wz = Zc ? Fz : 1.0f - Fz;
        for (int Yc = 0; Yc < 2; ++Yc)
        {
            const int Y = Wrap(Y0 + Yc, Ey);
            const float Wy = Yc ? Fy : 1.0f - Fy;
            for (int Xc = 0; Xc < 2; ++Xc)
            {
                const int X = Wrap(X0 + Xc, Ex);
                const float Wx = Xc ? Fx : 1.0f - Fx;
                const Vec4 T = Texel(X, Y, Z);
                const float Wgt = Wx * Wy * Wz;
                R.X += T.X * Wgt; R.Y += T.Y * Wgt; R.Z += T.Z * Wgt; R.W += T.W * Wgt;
            }
        }
    }
    return R;
}

} // namespace

Vec4 SampleVelocityState(const PlumeSpace& Space, int State, const Vec3& Position) noexcept
{
    return Sample3D(Space.Velocity[State], Space.Record, false, Position);
}

Vec4 SampleThermoState(const PlumeSpace& Space, int State, const Vec3& Position) noexcept
{
    return Sample3D(Space.Thermo[State], Space.Record, true, Position);
}

Vec4 SampleLightState(const PlumeSpace& Space, const Vec3& Position) noexcept
{
    return Sample3D(Space.Light, Space.Record, false, Position);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 OBSTRUCTION (PlumeAdvection.wgsl)
//------------------------------------------------------------------------------------------------------------------------

Vec4 ResolveSolid(const PlumeSpace& Space, const SceneDistanceField& Field, const Vec3& Position, float Edge) noexcept
{
    const DistanceSample Sampled = Field.Sample(Position);
    if (Sampled.Distance >= VelocitySolidReach * Edge)
        return Vec4{ 0, 0, 0, 0 };
    Vec3 Velocity = { 0, 0, 0 };
    if (Sampled.Level < 4 && Space.Record.FrameSeconds > 0.0f)
    {
        const uint32_t Identity = Field.ResolveClipIdentity(Position);
        if (Identity < static_cast<uint32_t>(Field.QueryOccupants().size()))
        {
            const OccupantRecord& Occupant = Field.QueryOccupants()[Identity];
            if ((Occupant.Roles & RoleDynamic) != 0u)
                Velocity = Field.ResolveOccupantVelocity(Identity, Position, Space.Record.FrameSeconds);
        }
    }
    return Vec4{ Velocity[0], Velocity[1], Velocity[2], 1.0f };
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 VELOCITY ADVECTION
//------------------------------------------------------------------------------------------------------------------------

Vec3 SampleLatticeVelocity(const PlumeSpace& Space, const Vec3& Position, float Activity, int VelocityState) noexcept
{
    const PlumeRecord& P = Space.Record;
    Vec3 Velocity = Sample3D(Space.Velocity[VelocityState], P, false, Position).XYZ();
    const float Time = P.ElapsedSeconds;
    const float Frequency = P.TurbulenceScale;
    const Vec3 First = AddVector(ScaleVector(Position, Frequency), ScaleVector({ 0.43f, -0.31f, 0.27f }, Time));
    const Vec3 Second = AddVector(AddVector(ScaleVector(Position, Frequency * 2.37f), ScaleVector({ -0.61f, 0.53f, -0.89f }, Time)),
                                  { 1.7f, 4.1f, 2.9f });
    const Vec3 Swirl = { std::sin(First[1]) - std::sin(First[2]) + 0.45f * (std::sin(Second[1]) - std::sin(Second[2])),
                         std::sin(First[2]) - std::sin(First[0]) + 0.45f * (std::sin(Second[2]) - std::sin(Second[0])),
                         std::sin(First[0]) - std::sin(First[1]) + 0.45f * (std::sin(Second[0]) - std::sin(Second[1])) };
    return AddVector(Velocity, ScaleVector(Swirl, P.Turbulence * (0.3f + 0.7f * Activity)));
}

void AdvectVelocity(PlumeSpace& Space, const SceneDistanceField& Field) noexcept
{
    const PlumeRecord& P = Space.Record;
    const int S = Space.State;
    const int NS = 1 - S;
    const float Edge = P.LatticeA[1];
    const float Seconds = P.StepSeconds;
    const Vec3 Wind = P.Wind;
    for (uint32_t Z = 0; Z < P.VelocityExtent.Z; ++Z)
        for (uint32_t Y = 0; Y < P.VelocityExtent.Y; ++Y)
            for (uint32_t X = 0; X < P.VelocityExtent.X; ++X)
            {
                const Vec3 Position = ProjectVelocityWorld(P, { X, Y, Z });
                const Vec4 Solid = ResolveSolid(Space, Field, Position, Edge);
                if (Solid.W > 0.5f)
                {
                    Space.Velocity[NS][VelocityIndex(P, static_cast<int>(X), static_cast<int>(Y), static_cast<int>(Z))] = Solid;
                    continue;
                }

                // ① self-advection; a departure point outside the previous window brings the ambient wind
                Vec3 Velocity = Wind;
                if (ClassifyPriorVelocity(P, Position))
                {
                    const Vec4 Own = SampleVelocityState(Space, S, Position);
                    const Vec3 Departure = SubtractVector(Position, ScaleVector(Own.XYZ(), Seconds));
                    if (ClassifyPriorVelocity(P, Departure))
                        Velocity = SampleVelocityState(Space, S, Departure).XYZ();
                }

                // ② viscous relaxation toward the ambient flow, then buoyancy
                Velocity = AddVector(Wind, ScaleVector(SubtractVector(Velocity, Wind), P.VelocityRetention));
                if (ClassifyPriorThermo(P, Position))
                {
                    const Vec4 Thermo = SampleThermoState(Space, S, Position);
                    const float Lift = P.ForceXyz[0] * Thermo.Y / (1.0f + 0.125f * Thermo.Y);
                    Velocity[2] += (Lift - P.ForceXyz[1] * (Thermo.X + Thermo.W)) * Seconds;
                }

                // ③ sources impart their momentum as a relaxation toward the source velocity
                if (ClassifySourceBounds(P, Position))
                {
                    for (int Index = 0; Index < P.SourceCount; ++Index)
                    {
                        const PlumeSource& Source = Space.SourceRecords[Index];
                        const float Weight = ResolveSourceWeight(Source, Position, Edge);
                        const float Push = 1.0f - std::exp(-Weight * Seconds * (4.0f + 0.15f * (Source.SmokeRate + Source.SootRate) + 0.05f * Source.FlameRate));
                        Velocity = MixVector(Velocity, Source.Velocity, Push);
                    }
                }
                const float Speed = Length(Velocity);
                if (Speed > PlumeSpeedCeiling)
                    Velocity = ScaleVector(Velocity, PlumeSpeedCeiling / Speed);
                Space.Velocity[NS][VelocityIndex(P, static_cast<int>(X), static_cast<int>(Y), static_cast<int>(Z))] =
                    Vec4{ Velocity[0], Velocity[1], Velocity[2], 0.0f };
            }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 THERMO ADVECTION
//------------------------------------------------------------------------------------------------------------------------

void AdvectThermo(PlumeSpace& Space, const SceneDistanceField& Field) noexcept
{
    const PlumeRecord& P = Space.Record;
    const int S = Space.State;
    const int NS = 1 - S;   // the final velocity of this step
    const float Edge = P.LatticeA[0];
    const float Seconds = P.StepSeconds;
    int Low[3] = { 0x7FFFFFFF, 0x7FFFFFFF, 0x7FFFFFFF };
    int High[3] = { -0x7FFFFFFF, -0x7FFFFFFF, -0x7FFFFFFF };
    for (uint32_t Z = 0; Z < P.ThermoExtent.Z; ++Z)
        for (uint32_t Y = 0; Y < P.ThermoExtent.Y; ++Y)
            for (uint32_t X = 0; X < P.ThermoExtent.X; ++X)
            {
                const Vec3 Position = ProjectThermoWorld(P, { X, Y, Z });
                Vec4 Thermo{ 0, 0, 0, 0 };
                if (Field.Sample(Position).Distance >= ThermoSolidReach * Edge)
                {
                    // ① second-order (midpoint) backtrace through the final velocity of this step
                    float Activity = 0.0f;
                    float RiseX = 0.0f, RiseY = 0.0f;
                    if (ClassifyPriorThermo(P, Position))
                    {
                        const Vec4 Here = SampleThermoState(Space, S, Position);
                        Activity = std::clamp(0.6f * (Here.X + Here.W) + 0.02f * Here.Y + Here.Z, 0.0f, 1.0f);
                        RiseX = std::clamp(Here.Y / 40.0f, 0.0f, 1.0f);
                        RiseY = std::clamp(Here.Z, 0.0f, 1.0f);
                    }
                    const Vec3 Slip = { 0.0f, 0.0f, SubgridHeatRise * RiseX + SubgridFlameRise * RiseY };
                    const Vec3 Midpoint = SubtractVector(Position, ScaleVector(AddVector(SampleLatticeVelocity(Space, Position, Activity, NS), Slip), 0.5f * Seconds));
                    const Vec3 Departure = SubtractVector(Position, ScaleVector(AddVector(SampleLatticeVelocity(Space, Midpoint, Activity, NS), Slip), Seconds));
                    if (ClassifyPriorThermo(P, Departure))
                        Thermo = SampleThermoState(Space, S, Departure);

                    // ② combustion: a flame cell keeps heating its gas and sheds soot as it burns
                    const float Burning = std::max(Thermo.Z, 0.0f) * Seconds;
                    Thermo.Y += Burning * P.HeatRelease;
                    Thermo.W += Burning * P.SootShed;

                    // ③ per-second losses, converted for this step by the host
                    Thermo = Vec4{ Thermo.X * P.RetentionXyz[0], Thermo.Y * P.RetentionXyz[1], Thermo.Z * P.RetentionXyz[2],
                                   Thermo.W * P.SootRetention };

                    // ④ sources: smoke, heat, flame and soot per second at each Gaussian centre
                    if (ClassifySourceBounds(P, Position))
                    {
                        for (int Index = 0; Index < P.SourceCount; ++Index)
                        {
                            const PlumeSource& Source = Space.SourceRecords[Index];
                            const float Weight = ResolveSourceWeight(Source, Position, Edge) * Seconds;
                            Thermo.X += Source.SmokeRate * Weight;
                            Thermo.Y += Source.HeatRate * Weight;
                            Thermo.Z += Source.FlameRate * Weight;
                            Thermo.W += Source.SootRate * Weight;
                        }
                    }
                    Thermo.X = std::clamp(Thermo.X, 0.0f, 64.0f);
                    Thermo.Y = std::clamp(Thermo.Y, 0.0f, 4096.0f);
                    Thermo.Z = std::clamp(Thermo.Z, 0.0f, 16.0f);
                    Thermo.W = std::clamp(Thermo.W, 0.0f, 64.0f);
                }
                Space.Thermo[NS][ThermoIndex(P, static_cast<int>(X), static_cast<int>(Y), static_cast<int>(Z))] = Thermo;

                // ⑤ coverage: the march only enters the box of cells that hold anything visible
                if (Thermo.X > 0.002f || Thermo.W > 0.002f || Thermo.Z > 0.01f)
                {
                    Low[0] = std::min(Low[0], static_cast<int>(X)); High[0] = std::max(High[0], static_cast<int>(X));
                    Low[1] = std::min(Low[1], static_cast<int>(Y)); High[1] = std::max(High[1], static_cast<int>(Y));
                    Low[2] = std::min(Low[2], static_cast<int>(Z)); High[2] = std::max(High[2], static_cast<int>(Z));
                }
            }
    for (int Axis = 0; Axis < 3; ++Axis)
        if (Low[Axis] <= High[Axis])
        {
            Space.Coverage[Axis] = std::min(Space.Coverage[Axis], Low[Axis]);
            Space.Coverage[4 + Axis] = std::max(Space.Coverage[4 + Axis], High[Axis]);
        }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 SUN TRANSMITTANCE
//------------------------------------------------------------------------------------------------------------------------

namespace
{

float ResolveOpticalDepth(const PlumeSpace& Space, const Vec3& Position, const Vec3& Toward)
{
    const PlumeRecord& P = Space.Record;
    float Depth = 0.0f;
    float Travel = 0.25f * P.LatticeA[1];
    for (int Step = 0; Step < 8; ++Step)
    {
        const float Length = P.LatticeA[0] * (1.0f + 0.6f * static_cast<float>(Step));
        const Vec3 Sample = AddVector(Position, ScaleVector(Toward, Travel + 0.5f * Length));
        if (!ClassifyWindowInterior(Sample, { 2 * P.VelocityOrigin.X, 2 * P.VelocityOrigin.Y, 0 },
                                    P.ThermoExtent, P.LatticeA[0], P.LatticeA[2]))
            break;
        // 📝 the just-advected thermo (the pass binds the next thermo state)
        const Vec4 Thermo = SampleThermoState(Space, 1 - Space.State, Sample);
        Depth += (std::max(Thermo.X, 0.0f) * P.SmokeExtinction + std::max(Thermo.W, 0.0f) * P.SootExtinction) * Length;
        Travel += Length;
    }
    return Depth;
}

} // namespace

void ResolveSunTransmittance(PlumeSpace& Space) noexcept
{
    const PlumeRecord& P = Space.Record;
    for (uint32_t Z = 0; Z < P.VelocityExtent.Z; ++Z)
        for (uint32_t Y = 0; Y < P.VelocityExtent.Y; ++Y)
            for (uint32_t X = 0; X < P.VelocityExtent.X; ++X)
            {
                const Vec3 Position = ProjectVelocityWorld(P, { X, Y, Z });
                const float Sun = std::exp(-ResolveOpticalDepth(Space, Position, P.Sun) * 0.65f);
                const float Zenith = std::exp(-ResolveOpticalDepth(Space, Position, { 0.0f, 0.0f, 1.0f }) * 0.5f);
                Space.Light[VelocityIndex(P, static_cast<int>(X), static_cast<int>(Y), static_cast<int>(Z))] =
                    Vec4{ Sun, Zenith, 0.0f, 1.0f };
            }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 VORTICITY (PlumeVorticity.wgsl)
//------------------------------------------------------------------------------------------------------------------------

namespace
{

inline size_t LocalIndex(const PlumeRecord& P, int X, int Y, int Z)
{
    const int Ex = static_cast<int>(P.VelocityExtent.X), Ey = static_cast<int>(P.VelocityExtent.Y);
    const int Cx = ClampInt(X, 0, Ex - 1), Cy = ClampInt(Y, 0, static_cast<int>(P.VelocityExtent.Y) - 1),
              Cz = ClampInt(Z, 0, static_cast<int>(P.VelocityExtent.Z) - 1);
    return (static_cast<size_t>(Cz) * Ey + Cy) * Ex + Cx;
}

} // namespace

void ResolveCurl(PlumeSpace& Space) noexcept
{
    const PlumeRecord& P = Space.Record;
    const int NS = 1 - Space.State;   // the advected velocity
    const float Scale = 0.5f / P.LatticeA[1];
    for (uint32_t Z = 0; Z < P.VelocityExtent.Z; ++Z)
        for (uint32_t Y = 0; Y < P.VelocityExtent.Y; ++Y)
            for (uint32_t X = 0; X < P.VelocityExtent.X; ++X)
            {
                const int Xi = static_cast<int>(X), Yi = static_cast<int>(Y), Zi = static_cast<int>(Z);
                const Vec3 Xp = LoadVelocity(Space, NS, Xi + 1, Yi, Zi).XYZ();
                const Vec3 Xm = LoadVelocity(Space, NS, Xi - 1, Yi, Zi).XYZ();
                const Vec3 Yp = LoadVelocity(Space, NS, Xi, Yi + 1, Zi).XYZ();
                const Vec3 Ym = LoadVelocity(Space, NS, Xi, Yi - 1, Zi).XYZ();
                const Vec3 Zp = LoadVelocity(Space, NS, Xi, Yi, Zi + 1).XYZ();
                const Vec3 Zm = LoadVelocity(Space, NS, Xi, Yi, Zi - 1).XYZ();
                const Vec3 Omega = { (Yp[2] - Ym[2]) - (Zp[1] - Zm[1]),
                                     (Zp[0] - Zm[0]) - (Xp[2] - Xm[2]),
                                     (Xp[1] - Xm[1]) - (Yp[0] - Ym[0]) };
                const Vec3 W = ScaleVector(Omega, Scale);
                Space.Curl[LocalIndex(P, Xi, Yi, Zi)] = Vec4{ W[0], W[1], W[2], Length(W) };
            }
}

void ConfineVorticity(PlumeSpace& Space) noexcept
{
    const PlumeRecord& P = Space.Record;
    const int NS = 1 - Space.State;
    const float Scale = 0.5f / P.LatticeA[1];
    for (uint32_t Z = 0; Z < P.VelocityExtent.Z; ++Z)
        for (uint32_t Y = 0; Y < P.VelocityExtent.Y; ++Y)
            for (uint32_t X = 0; X < P.VelocityExtent.X; ++X)
            {
                const int Xi = static_cast<int>(X), Yi = static_cast<int>(Y), Zi = static_cast<int>(Z);
                const Vec4 Own = LoadVelocity(Space, NS, Xi, Yi, Zi);
                Vec3 Velocity = Own.XYZ();
                if (Own.W < 0.5f && P.ForceXyz[2] > 0.0f)
                {
                    const Vec3 Eta = { (Space.Curl[LocalIndex(P, Xi + 1, Yi, Zi)].W - Space.Curl[LocalIndex(P, Xi - 1, Yi, Zi)].W) * Scale,
                                       (Space.Curl[LocalIndex(P, Xi, Yi + 1, Zi)].W - Space.Curl[LocalIndex(P, Xi, Yi - 1, Zi)].W) * Scale,
                                       (Space.Curl[LocalIndex(P, Xi, Yi, Zi + 1)].W - Space.Curl[LocalIndex(P, Xi, Yi, Zi - 1)].W) * Scale };
                    const float L = Length(Eta);
                    if (L > 1.0e-5f)
                    {
                        const Vec3 Omega = Space.Curl[LocalIndex(P, Xi, Yi, Zi)].XYZ();
                        Velocity = AddVector(Velocity, ScaleVector(Cross(ScaleVector(Eta, 1.0f / L), Omega),
                                                                   P.ForceXyz[2] * P.LatticeA[1] * P.StepSeconds));
                    }
                }
                Space.Velocity[NS][VelocityIndex(P, Xi, Yi, Zi)] = Vec4{ Velocity[0], Velocity[1], Velocity[2], Own.W };
            }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 PRESSURE (PlumePressure.wgsl)
//------------------------------------------------------------------------------------------------------------------------

namespace
{

inline bool ClassifyInside(const PlumeRecord& P, int X, int Y, int Z)
{
    return X >= 0 && Y >= 0 && Z >= 0 && X < static_cast<int>(P.VelocityExtent.X) && Y < static_cast<int>(P.VelocityExtent.Y)
        && Z < static_cast<int>(P.VelocityExtent.Z);
}

// 📝 q at a neighbour under the boundary rules: below the floor and inside solids Neumann (the centre's q),
//    outside the window sideways or above open air at q = 0 (Dirichlet).
inline float ResolveNeighbourPressure(PlumeSpace& Space, int VelocityState, int SourceIndex, int X, int Y, int Z, float Centre)
{
    const PlumeRecord& P = Space.Record;
    if (Z < 0)
        return Centre;
    if (!ClassifyInside(P, X, Y, Z))
        return 0.0f;
    if (LoadVelocity(Space, VelocityState, X, Y, Z).W > 0.5f)
        return Centre;
    return Space.Pressure[SourceIndex][VelocityIndex(P, X, Y, Z)];
}

} // namespace

void ResolveDivergence(PlumeSpace& Space) noexcept
{
    const PlumeRecord& P = Space.Record;
    const int NS = 1 - Space.State;
    const float Scale = 0.5f / P.LatticeA[1];
    for (uint32_t Z = 0; Z < P.VelocityExtent.Z; ++Z)
        for (uint32_t Y = 0; Y < P.VelocityExtent.Y; ++Y)
            for (uint32_t X = 0; X < P.VelocityExtent.X; ++X)
            {
                const int Xi = static_cast<int>(X), Yi = static_cast<int>(Y), Zi = static_cast<int>(Z);
                const Vec4 Own = LoadVelocity(Space, NS, Xi, Yi, Zi);
                const float Flux = (LoadVelocity(Space, NS, Xi + 1, Yi, Zi).X - LoadVelocity(Space, NS, Xi - 1, Yi, Zi).X)
                                 + (LoadVelocity(Space, NS, Xi, Yi + 1, Zi).Y - LoadVelocity(Space, NS, Xi, Yi - 1, Zi).Y)
                                 + (LoadVelocity(Space, NS, Xi, Yi, Zi + 1).Z - LoadVelocity(Space, NS, Xi, Yi, Zi - 1).Z);
                Space.Divergence[LocalIndex(P, Xi, Yi, Zi)] = Own.W > 0.5f ? 0.0f : Flux * Scale;
                const Vec3 Position = ProjectVelocityWorld(P, { X, Y, Z });
                if (!ClassifyWindowInterior(Position, P.PriorVelocityOrigin, P.VelocityExtent, P.LatticeA[1], P.LatticeA[2]))
                {
                    const size_t Index = VelocityIndex(P, Xi, Yi, Zi);
                    Space.Pressure[0][Index] = 0.0f;
                    Space.Pressure[1][Index] = 0.0f;
                }
            }
}

void RelaxPressure(PlumeSpace& Space, int SourceIndex) noexcept
{
    const PlumeRecord& P = Space.Record;
    const int NS = 1 - Space.State;
    const int Target = 1 - SourceIndex;
    const float Edge = P.LatticeA[1];
    for (uint32_t Z = 0; Z < P.VelocityExtent.Z; ++Z)
        for (uint32_t Y = 0; Y < P.VelocityExtent.Y; ++Y)
            for (uint32_t X = 0; X < P.VelocityExtent.X; ++X)
            {
                const int Xi = static_cast<int>(X), Yi = static_cast<int>(Y), Zi = static_cast<int>(Z);
                const size_t Index = VelocityIndex(P, Xi, Yi, Zi);
                const float Centre = Space.Pressure[SourceIndex][Index];
                if (LoadVelocity(Space, NS, Xi, Yi, Zi).W > 0.5f)
                {
                    Space.Pressure[Target][Index] = Centre;
                    continue;
                }
                const float Sum = ResolveNeighbourPressure(Space, NS, SourceIndex, Xi + 1, Yi, Zi, Centre)
                                + ResolveNeighbourPressure(Space, NS, SourceIndex, Xi - 1, Yi, Zi, Centre)
                                + ResolveNeighbourPressure(Space, NS, SourceIndex, Xi, Yi + 1, Zi, Centre)
                                + ResolveNeighbourPressure(Space, NS, SourceIndex, Xi, Yi - 1, Zi, Centre)
                                + ResolveNeighbourPressure(Space, NS, SourceIndex, Xi, Yi, Zi + 1, Centre)
                                + ResolveNeighbourPressure(Space, NS, SourceIndex, Xi, Yi, Zi - 1, Centre);
                Space.Pressure[Target][Index] = (Sum - Space.Divergence[LocalIndex(P, Xi, Yi, Zi)] * Edge * Edge) / 6.0f;
            }
}

void ProjectVelocity(PlumeSpace& Space, int PressureIndex) noexcept
{
    const PlumeRecord& P = Space.Record;
    const int NS = 1 - Space.State;
    const float Scale = 0.5f / P.LatticeA[1];
    for (uint32_t Z = 0; Z < P.VelocityExtent.Z; ++Z)
        for (uint32_t Y = 0; Y < P.VelocityExtent.Y; ++Y)
            for (uint32_t X = 0; X < P.VelocityExtent.X; ++X)
            {
                const int Xi = static_cast<int>(X), Yi = static_cast<int>(Y), Zi = static_cast<int>(Z);
                const Vec4 Own = LoadVelocity(Space, NS, Xi, Yi, Zi);
                const size_t Index = VelocityIndex(P, Xi, Yi, Zi);
                if (Own.W > 0.5f)
                {
                    Space.Velocity[NS][Index] = Own;
                    continue;
                }
                const float Centre = Space.Pressure[PressureIndex][Index];
                const Vec3 Gradient = { (ResolveNeighbourPressure(Space, NS, PressureIndex, Xi + 1, Yi, Zi, Centre)
                                       - ResolveNeighbourPressure(Space, NS, PressureIndex, Xi - 1, Yi, Zi, Centre)) * Scale,
                                        (ResolveNeighbourPressure(Space, NS, PressureIndex, Xi, Yi + 1, Zi, Centre)
                                       - ResolveNeighbourPressure(Space, NS, PressureIndex, Xi, Yi - 1, Zi, Centre)) * Scale,
                                        (ResolveNeighbourPressure(Space, NS, PressureIndex, Xi, Yi, Zi + 1, Centre)
                                       - ResolveNeighbourPressure(Space, NS, PressureIndex, Xi, Yi, Zi - 1, Centre)) * Scale };
                Vec3 Velocity = SubtractVector(Own.XYZ(), Gradient);
                const float Speed = Length(Velocity);
                if (Speed > PlumeSpeedCeiling)
                    Velocity = ScaleVector(Velocity, PlumeSpeedCeiling / Speed);
                Space.Velocity[NS][Index] = Vec4{ Velocity[0], Velocity[1], Velocity[2], 0.0f };
            }
}

} // namespace FluidSmoke
