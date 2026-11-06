/*==========================================================================================================================================
                                                            LOBBYSESSION.H
==========================================================================================================================================*/
// 🧩 Dynamic 1-to-5 vehicle Lobby session coordinator synchronizing SessionSpace roster slots onto Everest WorldSpace records.

#pragma once

#include "Frontier/Engine/Scene/WorldSpace.h"
#include "Frontier/Engine/Session/SessionSpace.h"
#include "Session/LobbySessionPolicy.h"

#include <cstdint>
#include <optional>
#include <string_view>

namespace Everest
{

class LobbySession
{
public:
    LobbySession();

    // Resets to solo local driver ("NOVA-7" on centre turntable Slot 0; all guest stands hidden).
    void ResetSolo(Frontier::WorldSpace& World);

    // Dynamically joins or removes guest drivers (Slots 1..4 -> "Lobby Slot 2..5") and updates WorldSpace visibility.
    std::optional<uint64_t> JoinGuestDriver(Frontier::WorldSpace& World,
                                            std::string_view      CustomCallsign = {},
                                            std::string_view      CustomRankBadge = {});
    bool                    LeaveGuestBySlot(Frontier::WorldSpace& World, uint32_t SlotIndex);
    bool                    LeaveLastGuest(Frontier::WorldSpace& World);
    void                    ConfigureTargetDriverCount(Frontier::WorldSpace& World, uint32_t DesiredCount);

    // Toggles ready state or advances countdown timers.
    bool ToggleLocalReady();
    void Advance(Frontier::WorldSpace& World, double DeltaSeconds);

    // Applies the current SessionSpace slot occupancy onto Lobby.levelspace Geometry & Vehicle records.
    bool SynchronizeWorldVisibility(Frontier::WorldSpace& World);

    [[nodiscard]] const Frontier::SessionSpace& QuerySession() const noexcept { return Session; }
    [[nodiscard]] Frontier::SessionSpace&       AccessSession() noexcept { return Session; }
    [[nodiscard]] uint64_t                      QueryLocalDriverIdentifier() const noexcept { return LocalDriverIdentifier; }
    [[nodiscard]] uint32_t                      QueryActiveVehicleCount() const noexcept;

private:
    Frontier::SessionSpace Session;
    uint64_t               LocalDriverIdentifier = 0u;
};

} // namespace Everest
