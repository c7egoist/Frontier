/*==========================================================================================================================================
                                                      RECORD INSPECTOR REGISTRY
                                     ------------------------------------------------------------------
                 Thread-safe token-keyed Inspector descriptor store synchronised with RecordEntry lifetime.
==========================================================================================================================================*/
// 🧩 Automatic Inspector binding registry populated by RecordEntry subclass constructors and cleared on destruction.

#include "Engine/Scene/RecordInspectorRegistry.h"

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                   PUBLIC FUNCTIONS
//------------------------------------------------------------------------------------------------------------------------

RecordInspectorRegistry& RecordInspectorRegistry::Instance()
{
    static RecordInspectorRegistry RegistryInstance;
    return RegistryInstance;
}

void RecordInspectorRegistry::Register(RecordInspectorDescriptor Descriptor)
{
    if (!Descriptor.Token.IsValid()) return;
    std::lock_guard<std::mutex> Lock(RegistryMutex);
    Descriptors[Descriptor.Token.Value] = std::move(Descriptor);
}

void RecordInspectorRegistry::Unregister(RecordToken Token)
{
    if (!Token.IsValid()) return;
    std::lock_guard<std::mutex> Lock(RegistryMutex);
    Descriptors.erase(Token.Value);
}

std::optional<RecordInspectorDescriptor> RecordInspectorRegistry::Query(RecordToken Token) const
{
    if (!Token.IsValid()) return std::nullopt;
    std::lock_guard<std::mutex> Lock(RegistryMutex);
    const auto Found = Descriptors.find(Token.Value);
    if (Found == Descriptors.end()) return std::nullopt;
    return Found->second;
}

bool RecordInspectorRegistry::QueryRegistered(RecordToken Token) const
{
    if (!Token.IsValid()) return false;
    std::lock_guard<std::mutex> Lock(RegistryMutex);
    return Descriptors.find(Token.Value) != Descriptors.end();
}

size_t RecordInspectorRegistry::QueryCount() const
{
    std::lock_guard<std::mutex> Lock(RegistryMutex);
    return Descriptors.size();
}

} // namespace Frontier
