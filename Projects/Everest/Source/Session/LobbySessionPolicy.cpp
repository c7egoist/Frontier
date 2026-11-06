/*==========================================================================================================================================
                                                        LOBBYSESSIONPOLICY.CPP
==========================================================================================================================================*/
// 🧩 Authored Everest session policies matching Lobby.facetspace stand coordinates and ProvingGroundVehicle starting grid.

#include "Session/LobbySessionPolicy.h"

namespace Everest
{

const std::array<GuestPresetCallsign, 5>& QueryLobbyPresetCallsigns() noexcept
{
    static constexpr std::array<GuestPresetCallsign, 5> Callsigns = {{
        {"NOVA-7", "GOLD II"},
        {"KESTREL", "PLATINUM I"},
        {"MIRAGE", "DIAMOND III"},
        {"ORION", "SILVER I"},
        {"VEGA-9", "GOLD IV"},
    }};
    return Callsigns;
}

std::string_view QueryLobbyGuestRecordName(uint32_t SlotIndex) noexcept
{
    switch (SlotIndex)
    {
        case 1u: return "Lobby Slot 2";
        case 2u: return "Lobby Slot 3";
        case 3u: return "Lobby Slot 4";
        case 4u: return "Lobby Slot 5";
        default: return {};
    }
}

Frontier::SessionPolicy QueryLobbySessionPolicy()
{
    Frontier::SessionPolicy Policy{};
    Policy.Identifier           = "everest.lobby";
    Policy.Title                = "Studio Lobby";
    Policy.LevelRelativePath    = "Content/Levels/Lobby.levelspace";
    Policy.EnvironmentArchive   = "Lobby";
    Policy.MaximumParticipants  = 5u;
    Policy.Placement            = Frontier::SessionPlacementMode::Stand;
    Policy.PhysicsSimulated     = false;
    Policy.RequireReadyGate     = false;
    Policy.CountdownSeconds     = 3.0;
    Policy.RoundDurationSeconds = 0.0;
    Policy.Slots                = {
        {{0.00f, 0.00f, 0.00f}, 0.0000f, "Turntable Hero"},
        {{7.42f, 7.42f, 0.53f}, -115.1645f, "Stand NE"},
        {{-7.42f, 7.42f, 0.53f}, -25.2101f, "Stand NW"},
        {{-7.42f, -7.42f, 0.53f}, 25.2101f, "Stand SW"},
        {{7.42f, -7.42f, 0.53f}, 115.1645f, "Stand SE"},
    };
    return Policy;
}

Frontier::SessionPolicy QueryProvingGroundSessionPolicy()
{
    Frontier::SessionPolicy Policy{};
    Policy.Identifier           = "everest.proving_ground";
    Policy.Title                = "Proving Grounds";
    Policy.LevelRelativePath    = "Content/Levels/ProvingGroundVehicle.levelspace";
    Policy.EnvironmentArchive   = "ProvingGround";
    Policy.MaximumParticipants  = 5u;
    Policy.Placement            = Frontier::SessionPlacementMode::Grid;
    Policy.PhysicsSimulated     = true;
    Policy.RequireReadyGate     = false;
    Policy.CountdownSeconds     = 0.0;
    Policy.RoundDurationSeconds = 0.0;
    Policy.Slots                = {
        {{-40.0f, 0.0f, 0.0f}, 0.0f, "Grid P1"},
        {{-47.0f, 3.2f, 0.0f}, 0.0f, "Grid P2"},
        {{-47.0f, -3.2f, 0.0f}, 0.0f, "Grid P3"},
        {{-54.0f, 3.2f, 0.0f}, 0.0f, "Grid P4"},
        {{-54.0f, -3.2f, 0.0f}, 0.0f, "Grid P5"},
    };
    return Policy;
}

} // namespace Everest
