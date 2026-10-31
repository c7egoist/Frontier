/*==========================================================================================================================================
                                                      RECORD INSPECTOR REGISTRY
                                     ------------------------------------------------------------------
                 Editor-machinery binding table between active RecordTokens and their live Inspector descriptors.
==========================================================================================================================================*/
// 🧩 Automatic Inspector binding registry populated by RecordEntry subclass constructors and cleared on destruction.

#pragma once

#include "RecordClassification.h"
#include "RecordToken.h"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                         TYPES
//------------------------------------------------------------------------------------------------------------------------

enum class GlobalInspectorDomain : uint8_t
{
    GenericRecord,
    Folder,
    Sun,
    LensFlare,
    Clouds,
    Wind,
    Atmosphere,
    CustomCallback
};

// 📝 Bound by a record's constructor and removed on destruction. PayloadAddress borrows the live record instance for
//    the exact lifetime of that RecordEntry; ~RecordEntry() removes the binding before the object finishes tearing down.
struct RecordInspectorDescriptor
{
    RecordToken            Token;                                                     // [-] - Owning record identity
    GlobalInspectorDomain  Domain                  = GlobalInspectorDomain::GenericRecord;
    std::string            Eyebrow;                                                   // [text] - Upper tracked label
    std::string            Subtitle;                                                  // [text] - Header summary line
    uint32_t               AccentHex               = 0x2fe6a7u;                       // [rgb] - 24-bit accent colour
    bool                  *ActivationTarget        = nullptr;                         // [-] - Optional live enable toggle
    void                  *PayloadAddress          = nullptr;                         // [-] - Live record address (non-owning)
    std::function<void()>  CustomInterfaceCallback;                                   // [-] - Optional custom project UI
};

//------------------------------------------------------------------------------------------------------------------------
//                                               RECORD INSPECTOR REGISTRY
//------------------------------------------------------------------------------------------------------------------------

class RecordInspectorRegistry
{
  public:
    [[nodiscard]] static RecordInspectorRegistry& Instance();

    RecordInspectorRegistry()                                          = default;
    RecordInspectorRegistry(const RecordInspectorRegistry&)            = delete;
    RecordInspectorRegistry& operator=(const RecordInspectorRegistry&) = delete;

    void Register(RecordInspectorDescriptor Descriptor);
    void Unregister(RecordToken Token);

    [[nodiscard]] std::optional<RecordInspectorDescriptor> Query(RecordToken Token) const;
    [[nodiscard]] bool                                     QueryRegistered(RecordToken Token) const;
    [[nodiscard]] size_t                                   QueryCount() const;

  private:
    mutable std::mutex                                         RegistryMutex;
    std::unordered_map<uint64_t, RecordInspectorDescriptor>    Descriptors;   // [-] - Token bits -> live descriptor
};

} // namespace Frontier
