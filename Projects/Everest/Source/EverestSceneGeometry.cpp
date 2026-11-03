/*==========================================================================================================================================
                                                         EVERESTSCENEGEOMETRY.CPP
==========================================================================================================================================*/
// 🧩 Project Everest's scene geometry: binds the level's Geometry records to the proving ground's occupants by name, resolves
//    each record's transform and modifier stack into occupant placements for the viewport, and reports what each resolved to.

#include "EverestSceneGeometry.h"

#include <algorithm>
#include <cctype>
#include <cstring>
#include <set>

namespace Everest
{

namespace
{

// 📝 MaterialSpecification.js CourseMaterial, index-aligned (79 RimScrape, 80 TabletHousing, 81 RimBase).
constexpr const char* FamilyIdentifiers[] = {
    "CheckerLight",   "CheckerDark",     "Surround",      "Ramp",           "Bump",          "Cone",            "BodyCoat",
    "VehicleGlass",   "VehiclePlastic",  "Tyre",          "Hub",            "Brake",         "VehicleTrim",     "Headlight",
    "Taillight",      "VehicleDefault",  "WallCrimson",   "WallViridian",   "WallChalk",     "WallCobalt",      "TunnelConcrete",
    "StressAmber",    "StressTeal",      "StressViolet",  "StressIvory",    "StressLamp",    "Asphalt",         "AsphaltPatch",
    "ApronConcrete",  "PaintWhite",      "PaintYellow",   "KerbRed",        "TyreRubber",    "Grass",           "Gravel",
    "Cladding",       "ContainerOrange", "ContainerBlue", "ContainerGreen", "ContainerWhite", "ContainerRed",   "SteelDark",
    "LampWarm",       "LampCool",        "BarrierConcrete", "SeatBlue",     "Wood",          "WoodInterior",    "Glass",
    "GlassEdge",      "Concrete",        "ConcreteInterior", "Stone",       "StoneInterior", "Plastic",         "PlasticInterior",
    "Tempered",       "TemperedEdge",    "PaintGreen",    "PaintBlue",      "ConeOrange",    "ConeBand",        "ConeBase",
    "DerezGlow",      "DerezHot",        "DerezGlitch",   "GateLamp",       "GateLampRed",   "SignBoard",       "SignLetter",
    "CabinLeather",   "CabinTrim",       "CabinAccent",   "SteeringWheel",  "DisplayGlass",  "MirrorGlass",     "SeatFabric",
    "CabinCarpet",    "MirrorTrim",      "RimScrape",     "TabletHousing",  "RimBase"};

constexpr uint32_t MaterialStride = 48;   // [B] MaterialSpecification record: 12 floats

std::string ComposeSignature(const Frontier::GeometryConfiguration& Configuration)
{
    std::string Signature;
    for (const std::string& Stem : Configuration.OccupantStems) Signature += Stem + '\x1F';
    Signature += std::to_string(Configuration.OccupantFirst) + '/' + std::to_string(Configuration.OccupantCount);
    return Signature;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                    NAMES
//------------------------------------------------------------------------------------------------------------------------

std::string ResolveFamilyName(uint32_t Family)
{
    if (Family >= std::size(FamilyIdentifiers)) return "Family " + std::to_string(Family);
    // 📝 PascalCase to words, the first capitalised: "BarrierConcrete" → "Barrier concrete".
    std::string Words;
    for (const char* Cursor = FamilyIdentifiers[Family]; *Cursor != '\0'; ++Cursor)
    {
        const bool Capital = std::isupper(static_cast<unsigned char>(*Cursor)) != 0;
        if (Capital && !Words.empty()) Words += ' ';
        Words += Capital && !Words.empty() ? static_cast<char>(std::tolower(static_cast<unsigned char>(*Cursor))) : *Cursor;
    }
    return Words;
}

bool MatchOccupantStem(std::string_view Name, std::string_view Stem) noexcept
{
    if (Stem.empty() || Name.size() < Stem.size() || Name.compare(0, Stem.size(), Stem) != 0) return false;
    const std::string_view Remainder = Name.substr(Stem.size());
    if (Remainder.empty()) return true;
    const auto Digit = [](char Letter) { return std::isdigit(static_cast<unsigned char>(Letter)) != 0; };
    if (Remainder.front() != ' ') return std::all_of(Remainder.begin(), Remainder.end(), Digit);
    const std::string_view Token = Remainder.substr(1);
    if (Token.empty() || Token.find(' ') != std::string_view::npos) return false;
    return std::any_of(Token.begin(), Token.end(), Digit) || (Token.size() == 1 && std::isupper(static_cast<unsigned char>(Token.front())) != 0);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    SCENE GEOMETRY OCCUPANCY
//------------------------------------------------------------------------------------------------------------------------

void SceneGeometryOccupancy::Reset(const Frontier::GlobalIllumination::SceneStructure* Scene, std::vector<uint8_t> MaterialProfiles)
{
    Scene_     = Scene;
    Materials_ = std::move(MaterialProfiles);
    Archive_.clear();
    SetFamilies_.clear();
    Occupancies_.clear();
    if (Scene_ != nullptr)
    {
        Archive_.reserve(Scene_->Occupants.size());
        for (const auto& Occupant : Scene_->Occupants) Archive_.push_back(Occupant.Current);
        for (const auto& Set : Scene_->FacetSets)
        {
            std::set<uint32_t> Families;
            for (const auto& Facet : Set.Facets) Families.insert(Facet.Family);
            SetFamilies_.emplace_back(Families.begin(), Families.end());
        }
    }
    Snapshot_ = std::make_shared<const GeometryResolutions>();
    ++Generation_;
}

const Frontier::PlacementMatrix* SceneGeometryOccupancy::QueryArchiveTransform(uint32_t Occupant) const noexcept
{
    return Occupant < Archive_.size() ? &Archive_[Occupant] : nullptr;
}

void SceneGeometryOccupancy::Bind(Occupancy& Entry, const Frontier::GeometryConfiguration& Configuration) const
{
    Entry.Parts.clear();
    Entry.Anchors.clear();
    Entry.Resolution = {};
    auto& Resolution = Entry.Resolution;
    if (Scene_ == nullptr)
    {
        Resolution.Diagnostic = "The scene archive is not loaded yet.";
        return;
    }
    if (Configuration.OccupantStems.empty())
    {
        Resolution.Diagnostic = "The record names no occupants of the scene archive.";
        return;
    }
    const auto& Occupants = Scene_->Occupants;
    for (const std::string& Stem : Configuration.OccupantStems)
    {
        std::vector<uint32_t> Matches;
        for (uint32_t Index = 0; Index < Occupants.size(); ++Index)
            if (MatchOccupantStem(Occupants[Index].Name, Stem)) Matches.push_back(Index);
        const size_t First = std::min<size_t>(Configuration.OccupantFirst, Matches.size());
        const size_t Count = Configuration.OccupantCount == 0 ? Matches.size() - First : std::min<size_t>(Configuration.OccupantCount, Matches.size() - First);
        Entry.Parts.emplace_back(Matches.begin() + static_cast<std::ptrdiff_t>(First), Matches.begin() + static_cast<std::ptrdiff_t>(First + Count));
    }
    const size_t Placements = Entry.Parts.front().size();
    for (size_t Part = 0; Part < Entry.Parts.size(); ++Part)
    {
        if (Entry.Parts[Part].size() == Placements && Placements > 0) continue;
        Resolution.Diagnostic = "\"" + Configuration.OccupantStems[Part] + "\" matches " + std::to_string(Entry.Parts[Part].size()) +
                                " occupants where the first part matches " + std::to_string(Placements) + ".";
        Entry.Parts.clear();
        return;
    }
    for (const uint32_t Occupant : Entry.Parts.front()) Entry.Anchors.push_back(Archive_[Occupant]);
    const auto& Leading = Scene_->FacetSets[Occupants[Entry.Parts.front().front()].FacetSet];
    for (size_t Axis = 0; Axis < 3; ++Axis)
    {
        Entry.Extent[Axis]       = Leading.LocalMaximum[Axis] - Leading.LocalMinimum[Axis];
        Resolution.Extent[Axis] = static_cast<float>(Entry.Extent[Axis]);
    }
    Resolution.Bound    = true;
    Resolution.Authored = static_cast<uint32_t>(Placements);
    Resolution.Parts    = static_cast<uint32_t>(Entry.Parts.size());
    std::set<uint32_t> Families;
    for (const auto& Part : Entry.Parts)
    {
        const auto& Set = Scene_->FacetSets[Occupants[Part.front()].FacetSet];
        Resolution.Shapes.push_back(Set.Name);
        Resolution.Facets += static_cast<uint32_t>(Set.Facets.size());
        for (const uint32_t Occupant : Part)
        {
            const auto& Entrant = Occupants[Occupant];
            if (Entrant.MaterialOverride >= 0) Families.insert(static_cast<uint32_t>(Entrant.MaterialOverride));
            else Families.insert(SetFamilies_[Entrant.FacetSet].begin(), SetFamilies_[Entrant.FacetSet].end());
            Resolution.Breakable = Resolution.Breakable || Entrant.Breakable;
        }
    }
    for (const uint32_t Family : Families)
    {
        Resolution.Families.push_back(Family);
        Resolution.FamilyNames.push_back(ResolveFamilyName(Family));
        std::array<float, 12> Channels{};
        if (static_cast<size_t>(Family + 1) * MaterialStride <= Materials_.size())
            std::memcpy(Channels.data(), Materials_.data() + static_cast<size_t>(Family) * MaterialStride, MaterialStride);
        Resolution.FamilyChannels.push_back(Channels);
    }
    // 📝 A breakable prop's fragment pool: the occupants named "<prop> fragment N" (the first copy's).
    if (Resolution.Breakable)
    {
        const std::string Prefix = Occupants[Entry.Parts.front().front()].Name + " fragment ";
        for (const auto& Occupant : Occupants)
            if (Occupant.Name.rfind(Prefix, 0) == 0) ++Resolution.FragmentCapacity;
    }
    for (const std::string& Stem : Configuration.OccupantStems)
        Resolution.Luminous = Resolution.Luminous || Stem == "Light pole head" || Stem == "Point lamp lantern";
}

void SceneGeometryOccupancy::Resolve(Occupancy& Entry, const Frontier::GeometryConfiguration& Configuration,
                                     std::vector<Frontier::GlobalIllumination::OccupantPlacement>& Placements) const
{
    using namespace Frontier;
    auto& Resolution = Entry.Resolution;
    if (!Resolution.Bound || Entry.Anchors.empty()) return;
    // ① the object's origin in the archive (authored, or the first placement's position and turn) and where it is now
    std::array<double, 3> Origin{}, Rotation{}, Scale{};
    DecomposePlacement(Entry.Anchors.front(), Origin, Rotation, Scale);
    double Yaw = Rotation[2];
    if (Configuration.ArchiveOriginAuthored)
    {
        Origin = {Configuration.ArchiveOriginMetres[0], Configuration.ArchiveOriginMetres[1], Configuration.ArchiveOriginMetres[2]};
        Yaw    = Configuration.ArchiveYawDegrees;
    }
    const PlacementMatrix Reference = ConstructPlacement(Origin, {0.0, 0.0, Yaw}, {1.0, 1.0, 1.0});
    const PlacementMatrix Current   = ResolveSpatialPlacement(Configuration.Spatial);
    const PlacementMatrix Object    = ConfirmProximity(Current, Reference, GeometryLinearTolerance, GeometryMetreTolerance) ? Reference : Current;
    const PlacementMatrix Inverse   = InvertPlacement(Reference);
    // ② the base copies in the object's frame, then the modifier stack
    const size_t Authored  = Entry.Anchors.size();
    const size_t BaseCount = Configuration.BaseCopies == 0 ? Authored : std::min<size_t>(Configuration.BaseCopies, Authored);
    std::vector<PlacementMatrix> Bases;
    for (size_t Copy = 0; Copy < BaseCount; ++Copy) Bases.push_back(MultiplyPlacement(Inverse, Entry.Anchors[Copy]));
    const std::vector<PlacementMatrix> Copies = EvaluateModifierStack(Bases, Configuration.Modifiers, Entry.Extent);
    Resolution.Copies = static_cast<uint32_t>(Copies.size());
    Resolution.Shown  = Configuration.Visible ? static_cast<uint32_t>(std::min(Copies.size(), Authored)) : 0u;
    // ③ copy n takes the archive's placement n: its parts move rigidly with it, and a copy at the archive's own placement keeps
    //    the archive's transforms exactly
    GlobalIllumination::WorldBounds Shown{{1.0e30, 1.0e30, 1.0e30}, {-1.0e30, -1.0e30, -1.0e30}};
    for (size_t Copy = 0; Copy < Authored; ++Copy)
    {
        const bool      Active = Copy < Resolution.Shown;
        bool            Exact  = true;
        PlacementMatrix Delta  = ConstructIdentityPlacement();
        if (Copy < Copies.size())
        {
            const PlacementMatrix Placed = MultiplyPlacement(Object, Copies[Copy]);
            Exact = ConfirmProximity(Placed, Entry.Anchors[Copy], GeometryLinearTolerance, GeometryMetreTolerance);
            if (!Exact) Delta = MultiplyPlacement(Placed, InvertPlacement(Entry.Anchors[Copy]));
        }
        for (const auto& Part : Entry.Parts)
        {
            const uint32_t Occupant = Part[Copy];
            Placements.push_back({Occupant, Exact ? Archive_[Occupant] : MultiplyPlacement(Delta, Archive_[Occupant]), Active});
            if (!Active) continue;
            const auto& Set    = Scene_->FacetSets[Scene_->Occupants[Occupant].FacetSet];
            const auto  Bounds = GlobalIllumination::TransformBounds(Placements.back().Current, Set.LocalMinimum, Set.LocalMaximum);
            for (size_t Axis = 0; Axis < 3; ++Axis)
            {
                Shown.Minimum[Axis] = std::min(Shown.Minimum[Axis], Bounds.Minimum[Axis]);
                Shown.Maximum[Axis] = std::max(Shown.Maximum[Axis], Bounds.Maximum[Axis]);
            }
        }
    }
    for (size_t Axis = 0; Axis < 3; ++Axis)
    {
        Resolution.BoundsMinimum[Axis] = Resolution.Shown > 0 ? static_cast<float>(Shown.Minimum[Axis]) : 0.0f;
        Resolution.BoundsMaximum[Axis] = Resolution.Shown > 0 ? static_cast<float>(Shown.Maximum[Axis]) : 0.0f;
    }
}

std::vector<Frontier::GlobalIllumination::OccupantPlacement> SceneGeometryOccupancy::ResolvePlacements(const Frontier::SceneWorld& World)
{
    std::vector<Frontier::GlobalIllumination::OccupantPlacement> Placements;
    if (Scene_ == nullptr) return Placements;
    bool Changed = false;
    for (auto& [Token, Entry] : Occupancies_) Entry.Present = false;
    for (const Frontier::SceneRecordBase* Record : World.FindAllByType("Geometry"))
    {
        const auto* Geometry = dynamic_cast<const Frontier::GeometryRecord*>(Record);
        if (Geometry == nullptr) continue;
        const Frontier::GeometryConfiguration& Configuration = Geometry->QueryConfiguration();
        Occupancy&                             Entry         = Occupancies_[Record->QueryToken().Value];
        Entry.Present = true;
        if (const std::string Signature = ComposeSignature(Configuration); Signature != Entry.Signature)
        {
            Bind(Entry, Configuration);
            Entry.Signature = Signature;
            Entry.Revision  = ~0ull;
        }
        if (Entry.Revision == Configuration.Revision) continue;
        Entry.Revision = Configuration.Revision;
        Resolve(Entry, Configuration, Placements);
        Changed = true;
    }
    // 📝 A record that left the level hands its occupants back to the archive's placements.
    for (auto Cursor = Occupancies_.begin(); Cursor != Occupancies_.end();)
    {
        if (Cursor->second.Present)
        {
            ++Cursor;
            continue;
        }
        for (const auto& Part : Cursor->second.Parts)
            for (const uint32_t Occupant : Part) Placements.push_back({Occupant, Archive_[Occupant], true});
        Cursor  = Occupancies_.erase(Cursor);
        Changed = true;
    }
    if (Changed)
    {
        std::unordered_map<uint32_t, uint32_t> Users;
        for (const auto& [Token, Entry] : Occupancies_)
            for (const uint32_t Family : Entry.Resolution.Families) ++Users[Family];
        auto Snapshot = std::make_shared<GeometryResolutions>();
        for (const auto& [Token, Entry] : Occupancies_)
        {
            Frontier::GeometryConfiguration::Resolution Resolution = Entry.Resolution;
            for (const uint32_t Family : Resolution.Families) Resolution.FamilyUsers.push_back(Users[Family]);
            Snapshot->emplace(Token, std::move(Resolution));
        }
        Snapshot_ = std::move(Snapshot);
        ++Generation_;
    }
    return Placements;
}

} // namespace Everest
