/*============================================================================================================================================
                                                       WORKSPACECAPABILITYREGISTER.CPP
============================================================================================================================================*/
// 🧩 Implementation of WorkspaceCapabilityRegister advertising strictly active Frontier & UVWorkspace host capabilities

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Workspaces/WorkspaceCapabilityRegister.h"

#include <algorithm>
#include <cctype>

namespace Frontier::Workspaces
{

namespace
{

[[nodiscard]] std::string LowercaseAscii(std::string_view Text)
{
    std::string Out(Text);
    for (char& Ch : Out)
    {
        Ch = static_cast<char>(std::tolower(static_cast<unsigned char>(Ch)));
    }
    return Out;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                          WORKSPACECAPABILITYREGISTER IMPLEMENTATION
//------------------------------------------------------------------------------------------------------------------------

WorkspaceCapabilityRegister::WorkspaceCapabilityRegister()
{
    RegisteredEntries.push_back({
        HostWorkspaceTarget::FrontierWorld,
        "Frontier",
        "Open with Frontier",
        "World Editor · Cornell-Studio Gallery, Tier 1 GTX / Tier 2 RTX GI, ForceFields & ContentBrowser",
        true,
    });
    RegisteredEntries.push_back({
        HostWorkspaceTarget::UVWorkspace,
        "UVWorkspace",
        "Open with UVWorkspace",
        "UV Authoring · Dual 2D UDIM & 3D Surface GPU viewports, conformal unwrap & concave packing",
        true,
    });
}

std::span<const WorkspaceCapabilityEntry> WorkspaceCapabilityRegister::QueryAllCapabilities() const noexcept
{
    return RegisteredEntries;
}

std::vector<WorkspaceCapabilityEntry> WorkspaceCapabilityRegister::QueryPermittedForPath(const std::filesystem::path& FilePath) const
{
    const std::string Ext = LowercaseAscii(FilePath.extension().string());
    std::vector<WorkspaceCapabilityEntry> Permitted {};

    if (Ext == ".uvspace" || Ext == ".obj" || Ext == ".geometryspace" || Ext == ".geometry")
    {
        // Geometry & UV containers default to UVWorkspace first while still allowing Frontier World inspection
        if (const auto* Uv = FindByTarget(HostWorkspaceTarget::UVWorkspace))
        {
            Permitted.push_back(*Uv);
        }
        if (const auto* World = FindByTarget(HostWorkspaceTarget::FrontierWorld))
        {
            Permitted.push_back(*World);
        }
        return Permitted;
    }

    // .projectspace / .project / .worldspace and general folders prioritize Frontier World first, then UVWorkspace
    for (const auto& Cap : RegisteredEntries)
    {
        if (Cap.EnabledInBuild)
        {
            Permitted.push_back(Cap);
        }
    }
    return Permitted;
}

const WorkspaceCapabilityEntry* WorkspaceCapabilityRegister::FindByTarget(HostWorkspaceTarget Target) const noexcept
{
    for (const auto& Entry : RegisteredEntries)
    {
        if (Entry.Target == Target && Entry.EnabledInBuild)
        {
            return &Entry;
        }
    }
    return nullptr;
}

const WorkspaceCapabilityEntry* WorkspaceCapabilityRegister::FindByIdentifier(std::string_view Identifier) const noexcept
{
    for (const auto& Entry : RegisteredEntries)
    {
        if (Entry.Identifier == Identifier && Entry.EnabledInBuild)
        {
            return &Entry;
        }
    }
    return nullptr;
}

} // namespace Frontier::Workspaces
