#pragma once
/*==========================================================================================================================================
                                                              PLUMEMATH.H
==========================================================================================================================================*/
// 🧩 Contiguous 3-vector helpers used by the 1:1 PlumeSpace port of Experimental/VehicleHmiPrototype.

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace Frontier
{

struct PlumeVec3
{
    float X = 0.0f;
    float Y = 0.0f;
    float Z = 0.0f;
};

struct PlumeVec4
{
    float X = 0.0f;
    float Y = 0.0f;
    float Z = 0.0f;
    float W = 0.0f;
};

inline PlumeVec3 operator+(PlumeVec3 A, PlumeVec3 B) { return { A.X + B.X, A.Y + B.Y, A.Z + B.Z }; }
inline PlumeVec3 operator-(PlumeVec3 A, PlumeVec3 B) { return { A.X - B.X, A.Y - B.Y, A.Z - B.Z }; }
inline PlumeVec3 operator*(PlumeVec3 A, float S) { return { A.X * S, A.Y * S, A.Z * S }; }
inline PlumeVec3 operator*(float S, PlumeVec3 A) { return A * S; }
inline PlumeVec4 operator+(PlumeVec4 A, PlumeVec4 B) { return { A.X + B.X, A.Y + B.Y, A.Z + B.Z, A.W + B.W }; }
inline PlumeVec4 operator*(PlumeVec4 A, float S) { return { A.X * S, A.Y * S, A.Z * S, A.W * S }; }

inline float PlumeDot(PlumeVec3 A, PlumeVec3 B) { return A.X * B.X + A.Y * B.Y + A.Z * B.Z; }
inline float PlumeDot(PlumeVec4 A, PlumeVec4 B) { return A.X * B.X + A.Y * B.Y + A.Z * B.Z + A.W * B.W; }
inline float PlumeLength(PlumeVec3 A) { return std::sqrt(PlumeDot(A, A)); }

inline PlumeVec3 PlumeCross(PlumeVec3 A, PlumeVec3 B)
{
    return { A.Y * B.Z - A.Z * B.Y, A.Z * B.X - A.X * B.Z, A.X * B.Y - A.Y * B.X };
}

inline PlumeVec3 PlumeNormalize(PlumeVec3 A)
{
    const float Length = PlumeLength(A);
    return Length > 1.0e-8f ? A * (1.0f / Length) : PlumeVec3{ 0.0f, 0.0f, 1.0f };
}

inline PlumeVec3 PlumeClampVec(PlumeVec3 A, float Lo, float Hi)
{
    return { std::clamp(A.X, Lo, Hi), std::clamp(A.Y, Lo, Hi), std::clamp(A.Z, Lo, Hi) };
}

inline PlumeVec4 PlumeMaxVec(PlumeVec4 A, PlumeVec4 B)
{
    return { std::max(A.X, B.X), std::max(A.Y, B.Y), std::max(A.Z, B.Z), std::max(A.W, B.W) };
}

inline PlumeVec4 PlumeClampVec(PlumeVec4 A, PlumeVec4 Lo, PlumeVec4 Hi)
{
    return { std::clamp(A.X, Lo.X, Hi.X), std::clamp(A.Y, Lo.Y, Hi.Y),
             std::clamp(A.Z, Lo.Z, Hi.Z), std::clamp(A.W, Lo.W, Hi.W) };
}

inline PlumeVec3 PlumeMix(PlumeVec3 A, PlumeVec3 B, float T)
{
    return A * (1.0f - T) + B * T;
}

inline float PlumeMix(float A, float B, float T) { return A + (B - A) * T; }

inline int PlumeWrap(int Cell, int Extent)
{
    if (Extent <= 0) return 0;
    int Wrapped = Cell % Extent;
    if (Wrapped < 0) Wrapped += Extent;
    return Wrapped;
}

inline std::array<float, 3> PlumeToArray(PlumeVec3 A) { return { A.X, A.Y, A.Z }; }
inline PlumeVec3 PlumeFromArray(const std::array<float, 3>& A) { return { A[0], A[1], A[2] }; }

} // namespace Frontier
