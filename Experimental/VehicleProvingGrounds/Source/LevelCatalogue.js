//============================================================================================================================================
//                                                          LEVELCATALOGUE.JS
//============================================================================================================================================
// 🧩 Which level the demo loads. ?level=city is the abandoned city; the proving grounds are the default (and ?level=proving).
//    Every consumer imports the level API from here, so the level is chosen in one place and the engine never branches on it.

import * as ProvingGrounds from "./LevelStructure.js";
import * as AbandonedCity from "./CityLevelStructure.js";

export const LevelCatalogue = Object.freeze({
    proving: Object.freeze({ Title: "Proving Grounds", Module: ProvingGrounds }),
    city:    Object.freeze({ Title: "Abandoned City", Module: AbandonedCity })
});

// 📝 The level name from a query string: an unknown or missing ?level= falls back to the proving grounds.
export function ResolveLevelName(Search = "")
{
    const Name = new URLSearchParams(Search).get("level");
    return Object.prototype.hasOwnProperty.call(LevelCatalogue, Name) ? Name : "proving";
}

export const LevelName = ResolveLevelName(globalThis.location ? globalThis.location.search : "");
const Active = LevelCatalogue[LevelName].Module;

export const { LevelShapes, ResolveLevelPlacements, ResolveConePlacements, ResolveBreakables, EmitLevelGroundFacets,
               TrainingDrills, ArenaZones, LevelClearZones } = Active;
