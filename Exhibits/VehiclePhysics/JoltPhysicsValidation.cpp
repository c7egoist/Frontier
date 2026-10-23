/*==========================================================================================================================================
                                                JOLT PHYSICS VALIDATION
==========================================================================================================================================*/
// 🧩 Native integration proof: rigid-body gravity, ground contact, body removal and bounded stepping.

#include "Engine/Physics/JoltPhysicsDivision.h"

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>

int main()
{
    Frontier::JoltPhysicsDivision Physics;
    if (std::string(Frontier::JoltPhysicsDivision::BackendName()).find("native C++") == std::string::npos)
    {
        std::printf("FAIL backend identification\n");
        return 1;
    }

    const Frontier::JoltBodyHandle Crate = Physics.AddBox({{0.0, 0.0, 2.0}, {0.25, 0.25, 0.25}, 10.0, 0.7, 0.0});
    for (uint32_t Index = 0; Index < 600; ++Index)
    {
        Physics.Advance(1.0 / 120.0);
    }
    const Frontier::JoltBodyMotion Resting = Physics.ReadMotion(Crate);
    if (!std::isfinite(Resting.Position.Z) || std::abs(Resting.Position.Z - 0.25) > 0.03)
    {
        std::printf("FAIL native body did not settle on ground: z=%.9f\n", Resting.Position.Z);
        return 1;
    }

    const uint32_t BodiesBeforeRemoval = Physics.BodyCount();
    Physics.RemoveBody(Crate);
    if (Physics.BodyCount() + 1 != BodiesBeforeRemoval)
    {
        std::printf("FAIL native body was not removed\n");
        return 1;
    }

    const Frontier::JoltBodyHandle FastBox = Physics.AddBox({{2.0, 0.0, 3.0}, {0.1, 0.1, 0.1}, 5.0, 0.5, 0.0});
    Physics.Advance(0.0);
    const Frontier::JoltBodyMotion Unchanged = Physics.ReadMotion(FastBox);
    if (std::abs(Unchanged.Position.Z - 3.0) > 1e-6)
    {
        std::printf("FAIL zero-time advance moved body\n");
        return 1;
    }

    std::printf("Jolt native validation: gravity/contact/removal/zero-step checks passed (%s)\n",
                Frontier::JoltPhysicsDivision::BackendName());
    return 0;
}
