/*==========================================================================================================================================
                                           JOLT PHYSICS DIVISION DEFINITION
==========================================================================================================================================*/

#include "JoltPhysicsDivision.h"

#include <Jolt/Jolt.h>
#include <Jolt/Core/Factory.h>
#include <Jolt/Core/JobSystemThreadPool.h>
#include <Jolt/Core/TempAllocator.h>
#include <Jolt/RegisterTypes.h>
#include <Jolt/Physics/Body/BodyCreationSettings.h>
#include <Jolt/Physics/Body/BodyInterface.h>
#include <Jolt/Physics/Collision/Shape/BoxShape.h>
#include <Jolt/Physics/PhysicsSystem.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <unordered_map>

JPH_SUPPRESS_WARNINGS

namespace Frontier
{

namespace
{

enum PhysicsLayer : JPH::ObjectLayer
{
    StaticLayer = 0,
    MovingLayer = 1,
    LayerCount = 2
};

namespace Broadphase
{
static constexpr JPH::BroadPhaseLayer StaticLayer(0);
static constexpr JPH::BroadPhaseLayer MovingLayer(1);
static constexpr JPH::uint LayerCount = 2;
} // namespace Broadphase

class VehicleBroadPhaseInterface final : public JPH::BroadPhaseLayerInterface
{
  public:
    VehicleBroadPhaseInterface()
    {
        ObjectToBroadphase_[StaticLayer] = Broadphase::StaticLayer;
        ObjectToBroadphase_[MovingLayer] = Broadphase::MovingLayer;
    }

    [[nodiscard]] JPH::uint GetNumBroadPhaseLayers() const override
    {
        return Broadphase::LayerCount;
    }

    [[nodiscard]] JPH::BroadPhaseLayer GetBroadPhaseLayer(JPH::ObjectLayer Layer) const override
    {
        return ObjectToBroadphase_[Layer];
    }

  private:
    JPH::BroadPhaseLayer ObjectToBroadphase_[LayerCount];
};

class VehicleObjectLayerPairFilter final : public JPH::ObjectLayerPairFilter
{
  public:
    [[nodiscard]] bool ShouldCollide(JPH::ObjectLayer LayerOne, JPH::ObjectLayer LayerTwo) const override
    {
        return LayerOne == MovingLayer || LayerTwo == MovingLayer;
    }
};

class VehicleObjectVsBroadPhaseFilter final : public JPH::ObjectVsBroadPhaseLayerFilter
{
  public:
    [[nodiscard]] bool ShouldCollide(JPH::ObjectLayer Object, JPH::BroadPhaseLayer BroadphaseLayer) const override
    {
        return Object == MovingLayer || BroadphaseLayer == Broadphase::MovingLayer;
    }
};

void TracePhysics(const char* Format, ...)
{
    (void)Format;
}

void InitializeJolt()
{
    JPH::RegisterDefaultAllocator();
    JPH::Trace = TracePhysics;
    JPH::Factory::sInstance = new JPH::Factory();
    JPH::RegisterTypes();
}

class JoltRuntimeInitialization
{
  public:
    JoltRuntimeInitialization()
    {
        static std::once_flag Initialized;
        std::call_once(Initialized, InitializeJolt);
    }
};

} // namespace

struct JoltPhysicsDivision::Implementation
{
    // ⚠️ Runtime registration must precede construction of Jolt's allocator and job-system objects.
    JoltRuntimeInitialization Runtime;
    VehicleBroadPhaseInterface BroadPhaseInterface;
    VehicleObjectVsBroadPhaseFilter ObjectVsBroadPhaseFilter;
    VehicleObjectLayerPairFilter ObjectLayerPairFilter;
    JPH::TempAllocatorImpl TemporaryAllocator{10 * 1024 * 1024};
    JPH::JobSystemThreadPool JobSystem{JPH::cMaxPhysicsJobs, JPH::cMaxPhysicsBarriers,
                                      std::max(1, static_cast<int>(std::thread::hardware_concurrency()) - 1)};
    JPH::PhysicsSystem Physics;
    JPH::BodyInterface* BodyInterface = nullptr;
    std::unordered_map<JoltBodyHandle, JPH::BodyID> Bodies;
    JoltBodyHandle NextHandle = 1;
    double Accumulator = 0.0;

    ~Implementation()
    {
        for (const auto& [Handle, BodyId] : Bodies)
        {
            (void)Handle;
            BodyInterface->RemoveBody(BodyId);
            BodyInterface->DestroyBody(BodyId);
        }
    }

    Implementation()
    {
        Physics.Init(8192, 0, 65536, 10240, BroadPhaseInterface, ObjectVsBroadPhaseFilter, ObjectLayerPairFilter);
        Physics.SetGravity(JPH::Vec3(0.0f, 0.0f, -9.81f));
        BodyInterface = &Physics.GetBodyInterface();
    }

    JoltBodyHandle AddBox(JoltBoxDescription Description)
    {
        if (!(Description.HalfExtent.X > 0.0 && Description.HalfExtent.Y > 0.0 && Description.HalfExtent.Z > 0.0))
        {
            throw std::invalid_argument("Jolt box half extents must all be positive");
        }

        const JPH::Vec3 HalfExtent(static_cast<float>(Description.HalfExtent.X),
                                   static_cast<float>(Description.HalfExtent.Y),
                                   static_cast<float>(Description.HalfExtent.Z));
        JPH::BoxShapeSettings ShapeSettings(HalfExtent);
        ShapeSettings.SetEmbedded();
        JPH::ShapeSettings::ShapeResult ShapeResult = ShapeSettings.Create();
        if (ShapeResult.HasError())
        {
            throw std::runtime_error(ShapeResult.GetError().c_str());
        }

        const bool IsDynamic = Description.Mass > 0.0;
        const JPH::ObjectLayer Layer = IsDynamic ? MovingLayer : StaticLayer;
        JPH::BodyCreationSettings Settings(
            ShapeResult.Get(),
            JPH::RVec3(static_cast<JPH::Real>(Description.Position.X),
                       static_cast<JPH::Real>(Description.Position.Y),
                       static_cast<JPH::Real>(Description.Position.Z)),
            JPH::Quat::sIdentity(),
            IsDynamic ? JPH::EMotionType::Dynamic : JPH::EMotionType::Static,
            Layer);
        Settings.mFriction = static_cast<float>(Description.Friction);
        Settings.mRestitution = static_cast<float>(Description.Restitution);
        if (IsDynamic)
        {
            Settings.mOverrideMassProperties = JPH::EOverrideMassProperties::CalculateInertia;
            Settings.mMassPropertiesOverride.mMass = static_cast<float>(Description.Mass);
            Settings.mMotionQuality = JPH::EMotionQuality::LinearCast;
        }

        JPH::Body* Body = BodyInterface->CreateBody(Settings);
        if (Body == nullptr)
        {
            throw std::runtime_error("Jolt body capacity exhausted");
        }
        const JPH::EActivation Activation = IsDynamic ? JPH::EActivation::Activate : JPH::EActivation::DontActivate;
        BodyInterface->AddBody(Body->GetID(), Activation);
        const JoltBodyHandle Handle = NextHandle++;
        Bodies.emplace(Handle, Body->GetID());
        return Handle;
    }
};

JoltPhysicsDivision::JoltPhysicsDivision()
    : Implementation_(std::make_unique<Implementation>())
{
    Implementation_->AddBox({{0.0, 0.0, -1.0}, {500.0, 500.0, 1.0}, 0.0, 0.9, 0.0});
}

JoltPhysicsDivision::~JoltPhysicsDivision() = default;
JoltPhysicsDivision::JoltPhysicsDivision(JoltPhysicsDivision&&) noexcept = default;
JoltPhysicsDivision& JoltPhysicsDivision::operator=(JoltPhysicsDivision&&) noexcept = default;

JoltBodyHandle JoltPhysicsDivision::AddBox(JoltBoxDescription Description)
{
    return Implementation_->AddBox(Description);
}

void JoltPhysicsDivision::RemoveBody(JoltBodyHandle Handle) noexcept
{
    const auto Found = Implementation_->Bodies.find(Handle);
    if (Found == Implementation_->Bodies.end())
    {
        return;
    }
    Implementation_->BodyInterface->RemoveBody(Found->second);
    Implementation_->BodyInterface->DestroyBody(Found->second);
    Implementation_->Bodies.erase(Found);
}

void JoltPhysicsDivision::Advance(double ElapsedSeconds) noexcept
{
    constexpr double FixedStep = 1.0 / 120.0;
    constexpr double MaximumAccumulatedTime = FixedStep * 12.0;
    if (!std::isfinite(ElapsedSeconds) || ElapsedSeconds <= 0.0)
    {
        return;
    }
    Implementation_->Accumulator = std::min(Implementation_->Accumulator + ElapsedSeconds, MaximumAccumulatedTime);
    while (Implementation_->Accumulator + 1.0e-12 >= FixedStep)
    {
        Implementation_->Physics.Update(static_cast<float>(FixedStep), 1,
                                        &Implementation_->TemporaryAllocator, &Implementation_->JobSystem);
        Implementation_->Accumulator -= FixedStep;
    }
}

JoltBodyMotion JoltPhysicsDivision::ReadMotion(JoltBodyHandle Handle) const
{
    const auto Found = Implementation_->Bodies.find(Handle);
    if (Found == Implementation_->Bodies.end())
    {
        throw std::out_of_range("Unknown Jolt body handle");
    }
    const JPH::RVec3 Position = Implementation_->BodyInterface->GetPosition(Found->second);
    const JPH::Vec3 LinearVelocity = Implementation_->BodyInterface->GetLinearVelocity(Found->second);
    return {{Position.GetX(), Position.GetY(), Position.GetZ()},
            {LinearVelocity.GetX(), LinearVelocity.GetY(), LinearVelocity.GetZ()}};
}

uint32_t JoltPhysicsDivision::BodyCount() const noexcept
{
    return static_cast<uint32_t>(Implementation_->Bodies.size());
}

const char* JoltPhysicsDivision::BackendName() noexcept
{
    return "Jolt Physics 5.4.0 · native C++";
}

} // namespace Frontier
