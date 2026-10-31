// 🧩 Base of every scene object: the constructor registers it, the destructor unregisters it — nothing else can.

#include "Engine/Scene/RecordEntry.h"

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Scene/RecordInspectorRegistry.h"
#include "Engine/Scene/RecordStore.h"
#include "Engine/Scene/SceneDirectory.h"

namespace Frontier
{

RecordEntry::RecordEntry(RecordClassification Classification)
    : IssuedToken(TokenIssuer::Issue())
    , EntryClassification(Classification)
{
    RecordStore::Instance().Insert(*this);
#if defined(FRONTIER_EDITOR_PROFILE) || defined(FRONTIER_DEVELOPMENT_PROFILE)
    SceneDirectory::Instance().Register(*this);   // 📝 Outliner visibility only; Shipping contains no directory
    RecordInspectorDescriptor DefaultDescriptor;
    DefaultDescriptor.Token          = IssuedToken;
    DefaultDescriptor.Domain         = GlobalInspectorDomain::GenericRecord;
    DefaultDescriptor.Eyebrow        = "SCENE RECORD";
    DefaultDescriptor.Subtitle       = RecordClassificationName(Classification);
    RecordInspectorRegistry::Instance().Register(std::move(DefaultDescriptor));
#endif
}

RecordEntry::~RecordEntry()
{
#if defined(FRONTIER_EDITOR_PROFILE) || defined(FRONTIER_DEVELOPMENT_PROFILE)
    RecordInspectorRegistry::Instance().Unregister(IssuedToken);
    SceneDirectory::Instance().Unregister(IssuedToken);
#endif
    RecordStore::Instance().Remove(IssuedToken);
}

} // namespace Frontier
