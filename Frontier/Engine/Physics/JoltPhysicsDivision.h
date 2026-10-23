/*==========================================================================================================================================
                                               JOLT PHYSICS DIVISION
==========================================================================================================================================*/
// 🧩 Native Jolt Physics rigid-body world boundary for the vehicle physics port.

#pragma once

#include <cstdint>
#include <memory>

namespace Frontier
{

using JoltBodyHandle = uint32_t;

struct VehiclePhysicsVector3
{
    double X = 0.0; // [m] or [m/s], depending on the query
    double Y = 0.0;
    double Z = 0.0;
};

struct JoltBoxDescription
{
    VehiclePhysicsVector3 Position;     // [m] - centre of mass position
    VehiclePhysicsVector3 HalfExtent;    // [m] - positive half size on each axis
    double Mass = 0.0;                   // [kg] - zero creates a static body
    double Friction = 0.6;               // [-]
    double Restitution = 0.0;             // [-]
};

struct JoltBodyMotion
{
    VehiclePhysicsVector3 Position;      // [m]
    VehiclePhysicsVector3 LinearVelocity; // [m/s]
};

class JoltPhysicsDivision
{
  public:
    JoltPhysicsDivision();
    ~JoltPhysicsDivision();

    JoltPhysicsDivision(const JoltPhysicsDivision&) = delete;
    JoltPhysicsDivision& operator=(const JoltPhysicsDivision&) = delete;
    JoltPhysicsDivision(JoltPhysicsDivision&&) noexcept;
    JoltPhysicsDivision& operator=(JoltPhysicsDivision&&) noexcept;

    [[nodiscard]] JoltBodyHandle AddBox(JoltBoxDescription Description);
    void RemoveBody(JoltBodyHandle Handle) noexcept;
    void Advance(double ElapsedSeconds) noexcept;
    [[nodiscard]] JoltBodyMotion ReadMotion(JoltBodyHandle Handle) const;
    [[nodiscard]] uint32_t BodyCount() const noexcept;
    [[nodiscard]] static const char* BackendName() noexcept;

  private:
    struct Implementation;
    std::unique_ptr<Implementation> Implementation_;
};

} // namespace Frontier
