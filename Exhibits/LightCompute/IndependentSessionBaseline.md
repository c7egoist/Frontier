# Independent session baseline

The source snapshot from `eosclient0001-rgb/Frontier`, branch `arena/672a179a-frontier`, commit
`3de9061ab614856de03ef61b534c641061d14a53`, was copied into this session's branch. The existing
root patch file was retained. Before adding this report and tracker entry, the index matched that
commit's tree apart from the root patch. This is a snapshot import, not a merge of its Git history.

| Check | Result |
|---|---|
| LightCompute Release build | Passed, GCC 12.2.0, Linux x86-64 |
| CTest | 5/5 passed: replay domain, recorder mock, facet distribution, medium payload, archive |
| Shader compilation and Vulkan execution | Not run: Slang compiler and Vulkan driver were not available |
| Physical GPU, Windows and performance | Not tested |

[Local result](Results/IndependentSessionBaseline.txt). These are host tests; they do not test ReSTIR
image quality, Vulkan execution or game performance. The imported [subpixel report](ReplaySampleHistory.md)
contains earlier SwiftShader readbacks and comparisons; they were not regenerated in this session.
ReSTIR GI remains incomplete. The renderer does not yet call the Engine recorder, and the subpixel
seed mode does not combine with reservoir reuse.

## Reproduce host checks

Install CMake 3.20 or newer, a C++20 compiler, and Vulkan-Headers v1.4.321 at
`ExternalPackages/VulkanCompute/Vulkan-Headers-1.4.321`. Then run:

```sh
cmake -S Exhibits/LightCompute -B _ClaudeScratch/build/replay-baseline -DCMAKE_BUILD_TYPE=Release
cmake --build _ClaudeScratch/build/replay-baseline --parallel 2
ctest --test-dir _ClaudeScratch/build/replay-baseline --output-on-failure
```
