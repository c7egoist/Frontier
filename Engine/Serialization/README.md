# Engine Serialization

Status: proposed companion to
[`Documentation/Plans/EngineComponentSerializationDagPlan.md`](../Documentation/Plans/EngineComponentSerializationDagPlan.md).

This folder is the planned home for the serialization and persistent artifact DAG units:

| Unit | Responsibility |
| --- | --- |
| `ExtensionRegister.{h,cpp}` | Approved suffix/type ID/schema version/owner register; case-insensitive resolve, canonical PascalCase write |
| `ArtifactIdentity.{h,cpp}` | Canonical byte encoding, xxHash64 node digest, versioned hashing policy |
| `DependencyOrder.{h,cpp}` | Directed acyclic build order, cycle reporting, transitive dirty propagation |
| `DerivedArtifactLedger.{h,cpp}` | Atomic TOML provenance manifest read/write |
| `ArtifactPersistence.{h,cpp}` | Content-addressed `Build/Cache/<Domain>/<digest>.bin` store, memory-map hit, atomic publish |
| `CookedAssetLocator.{h,cpp}` | Extension + digest dispatch to cooked artifact loaders |
| `SerializationLifecycle.{h,cpp}` | Initialize/Tick/Finalize participant |

`ExtensionRegistry.toml` is the authored source of truth for approved names. It is a proposed
schema and is not yet consumed by a codec. Internal C++ identifiers must additionally satisfy
`Documentation/AgenticInstructions/SKILL-Naming.md`; the extension strings are approved public
identifiers and are exempt from that prose blacklist.

The default cache root is `Build/Cache/` and must stay Git-ignored. Derived artifacts are keyed by
content digest plus tool/schema/platform/device keys, never by filename or modification time.
