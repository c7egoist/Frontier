/*==========================================================================================================================================
                                                             SESSIONPOLICY.H
==========================================================================================================================================*/
// 🧩 Declarative session policy contract: slot transforms, placement mode (Stand vs Grid), ready gate, countdown, and round rules.

#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace Frontier
{

enum class SessionPlacementMode : uint8_t
{
    Stand = 0,   // [-] - Fixed showcase turntable / plinth stands (Studio Lobby)
    Grid  = 1    // [-] - Staggered starting grid slots (Proving Grounds / circuit)
};

struct SessionSlotSpecification
{
    std::array<float, 3> PositionMetres = {0.0f, 0.0f, 0.0f};   // [m]   - Authored world slot origin (z-up)
    float                YawDegrees     = 0.0f;                 // [deg] - Authored heading about +Z
    std::string          Label          = "Slot";               // [-]   - Human-readable stand / grid label
};

struct SessionPolicy
{
    std::string                           Identifier           = "session.default";
    std::string                           Title                = "Session";
    std::string                           LevelRelativePath    = "Content/Levels/Lobby.levelspace";
    std::string                           EnvironmentArchive   = "Lobby";
    uint32_t                              MaximumParticipants  = 5u;
    SessionPlacementMode                  Placement            = SessionPlacementMode::Stand;
    bool                                  PhysicsSimulated     = false;
    bool                                  RequireReadyGate     = false;
    double                                CountdownSeconds     = 3.0;
    double                                RoundDurationSeconds = 0.0;
    std::vector<SessionSlotSpecification> Slots{};
};

} // namespace Frontier
