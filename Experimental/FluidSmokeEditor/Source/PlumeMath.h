#pragma once
/*==========================================================================================================================================
                                                             PLUMEMATH.H
==========================================================================================================================================*/
// 🧩 Vector / quaternion helpers — the 1:1 C++ port of the TransformProjection.js functions the plume
//    sources use (AddVector, ScaleVector, MultiplyAddVector, RotateVector, MultiplyQuaternion,
//    ConstructAxisQuaternion).

#include <array>
#include <cmath>

namespace FluidSmoke
{

using Vec3 = std::array<float, 3>;
using Quat = std::array<float, 4>;   // [x, y, z, w]

constexpr float Pi = 3.14159265358979f;

inline Vec3 AddVector(const Vec3& A, const Vec3& B) { return { A[0] + B[0], A[1] + B[1], A[2] + B[2] }; }
inline Vec3 SubtractVector(const Vec3& A, const Vec3& B) { return { A[0] - B[0], A[1] - B[1], A[2] - B[2] }; }
inline Vec3 ScaleVector(const Vec3& A, float S) { return { A[0] * S, A[1] * S, A[2] * S }; }
inline Vec3 MultiplyAddVector(const Vec3& A, const Vec3& B, float S) { return { A[0] + B[0] * S, A[1] + B[1] * S, A[2] + B[2] * S }; }
inline float Dot(const Vec3& A, const Vec3& B) { return A[0] * B[0] + A[1] * B[1] + A[2] * B[2]; }
inline Vec3 Cross(const Vec3& A, const Vec3& B)
{
    return { A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0] };
}
inline float Length(const Vec3& A) { return std::sqrt(Dot(A, A)); }
inline Vec3 Normalize(const Vec3& A)
{
    const float L = Length(A);
    return L > 1e-8f ? ScaleVector(A, 1.0f / L) : Vec3{ 0.0f, 0.0f, 1.0f };
}
inline Vec3 MixVector(const Vec3& A, const Vec3& B, float T) { return { A[0] + (B[0] - A[0]) * T, A[1] + (B[1] - A[1]) * T, A[2] + (B[2] - A[2]) * T }; }
inline float Mix(float A, float B, float T) { return A + (B - A) * T; }

inline Quat MultiplyQuaternion(const Quat& A, const Quat& B)
{
    return { A[3] * B[0] + A[0] * B[3] + A[1] * B[2] - A[2] * B[1],
             A[3] * B[1] - A[0] * B[2] + A[1] * B[3] + A[2] * B[0],
             A[3] * B[2] + A[0] * B[1] - A[1] * B[0] + A[2] * B[3],
             A[3] * B[3] - A[0] * B[0] - A[1] * B[1] - A[2] * B[2] };
}

// 📝 Quaternion of the rotation about Axis by Angle radians (ConstructAxisQuaternion).
inline Quat ConstructAxisQuaternion(const Vec3& Axis, float Angle)
{
    const float Half = 0.5f * Angle;
    const float S = std::sin(Half);
    const Vec3 N = Normalize(Axis);
    return { N[0] * S, N[1] * S, N[2] * S, std::cos(Half) };
}

inline Vec3 RotateVector(const Quat& Q, const Vec3& V)
{
    const Vec3 Qv = { Q[0], Q[1], Q[2] };
    const Vec3 T = ScaleVector(Cross(Qv, V), 2.0f);
    return AddVector(V, AddVector(ScaleVector(T, Q[3]), Cross(Qv, T)));
}

} // namespace FluidSmoke
