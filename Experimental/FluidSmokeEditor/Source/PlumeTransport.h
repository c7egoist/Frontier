#pragma once
/*==========================================================================================================================================
                                                           PLUMETRANSPORT.H
==========================================================================================================================================*/
// 🧩 1:1 C++ port of the plume compute shaders — every WGSL entry point becomes a CPU pass with the same name and
//    the same math, iterating the same lattice:
//      Shaders/PlumeAdvection.wgsl  → AdvectVelocity, AdvectThermo, ResolveSunTransmittance
//      Shaders/PlumeVorticity.wgsl  → ResolveCurl, ConfineVorticity
//      Shaders/PlumePressure.wgsl   → ResolveDivergence, RelaxPressure, ProjectVelocity

#include "PlumeSpace.h"

namespace FluidSmoke
{

//------------------------------------------------------------------------------------------------------------------------
//                                                 LATTICE SAMPLING (repeat XY, clamp Z)
//------------------------------------------------------------------------------------------------------------------------

// 📝 textureSampleLevel with the lattice sampler: trilinear, repeat address mode on U and V, clamp on W.
[[nodiscard]] Vec4 SampleVelocityState(const PlumeSpace& Space, int State, const Vec3& Position) noexcept;
[[nodiscard]] Vec4 SampleThermoState(const PlumeSpace& Space, int State, const Vec3& Position) noexcept;
[[nodiscard]] Vec4 SampleLightState(const PlumeSpace& Space, const Vec3& Position) noexcept;

//------------------------------------------------------------------------------------------------------------------------
//                                                 PlumeAdvection.wgsl
//------------------------------------------------------------------------------------------------------------------------

// 📝 ResolveSolid: (velocity, 1) inside geometry, (0, 0) in open air; a velocity cell inside a moving occupant
//    takes that occupant's point velocity.
[[nodiscard]] Vec4 ResolveSolid(const PlumeSpace& Space, const SceneDistanceField& Field, const Vec3& Position, float Edge) noexcept;

[[nodiscard]] Vec3 SampleLatticeVelocity(const PlumeSpace& Space, const Vec3& Position, float Activity, int VelocityState) noexcept;

void AdvectVelocity(PlumeSpace& Space, const SceneDistanceField& Field) noexcept;
void AdvectThermo(PlumeSpace& Space, const SceneDistanceField& Field) noexcept;
void ResolveSunTransmittance(PlumeSpace& Space) noexcept;

//------------------------------------------------------------------------------------------------------------------------
//                                                 PlumeVorticity.wgsl
//------------------------------------------------------------------------------------------------------------------------

void ResolveCurl(PlumeSpace& Space) noexcept;
void ConfineVorticity(PlumeSpace& Space) noexcept;

//------------------------------------------------------------------------------------------------------------------------
//                                                 PlumePressure.wgsl
//------------------------------------------------------------------------------------------------------------------------

void ResolveDivergence(PlumeSpace& Space) noexcept;
void RelaxPressure(PlumeSpace& Space, int SourceIndex) noexcept;
void ProjectVelocity(PlumeSpace& Space, int PressureIndex) noexcept;

} // namespace FluidSmoke
