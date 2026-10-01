# 04 — PlatformInterchange

`Layer0_Platform` presents one translated surface over three operating systems. Its job is not to hide the OS —
it is to make exactly one place in the source tree where OS divergence is expressed, so that everything above it
is written once. Every component here is named by *what crosses it*, which is why the retired `Boundary` suffix
does not appear.

Platform translation lives inside `SlateMath.lib` and not in a unit of its own. It has no dependency but the
operating system, and giving a dependency-free layer its own link target buys a build step and nothing else.

## Position In The Sequence

| Field       | Value                                                                       |
|-------------|------------------------------------------------------------------------------|
| Unit        | `SlateMath.lib`                                                              |
| Layer       | `Layer0_Platform`                                                            |
| Upstream    | `00`                                                                          |
| Downstream  | `06` needs a window; `10` needs a stream; `14` needs input and clipboard      |
| Unblocks    | A window on screen, a file read, a keystroke delivered                        |

## 1. The Components

✔️ Done — `WindowInterchange`, `InputExchange` and `TickSequence` first, and the six below since.

| Component              | What crosses                                                | Owns memory |
|------------------------|-------------------------------------------------------------|-------------|
| `PlatformInterchange`  | Process, thread, timing and locale services                 | Yes         |
| `FileInterchange`      | One stream surface over three file systems                  | Yes         |
| `StorageExchange`      | Byte ranges arriving from the storage device                | Yes         |
| `ClipboardExchange`    | Text and imagery crossing to and from the OS                | Yes         |
| `CodeInterchange`      | Compiled code plus a verified interface hash crossing in    | Yes         |
| `InstructionExchange`  | Runtime selection of an instruction-set specialisation      | Yes         |

⚠️ `WindowInterchange` (here, in `SlateMath`) and `WindowExchange` (in `06`, `SlateVulkan`) are distinct and both
required. `WindowInterchange` produces a native window over three window systems. `WindowExchange` converts that
native handle into a `VkSurfaceKHR`. The split is what keeps `SlateMath` device-free.

## 2. Windowing

✔️ Windowing done — GLFW through `glfw3dll.lib`, the native handle surrendered and nothing else, no Vulkan
header reached from here.

🔴 Linking `glfw3.lib` while `glfw3.dll` is present produces a build that links and then misbehaves at runtime.
The failure is silent, so the gate in §7 stays.

## 3. Input

✔️ Done — arrival timestamping from `TickSequence`, the cyclic sample order, and the axes. Pressure, tilt and
rotation are carried when the device reports them and marked **absent** when it does not, because a tablet
reporting no tilt and a stylus held upright are different facts and `22` treats them differently. Absent is
distinct from zero and the sample carries a way to say so.

A stroke sampled at device rate and consumed at display rate must reconstruct the path the artist drew, which is
why arrival times and not consumption times survive.

## 4. Streams

`FileInterchange` presents a path and stream surface; `StorageExchange` presents byte ranges with latency. `10`'s
codecs read through `StorageExchange` so that a decode can be driven by range arrival rather than by whole-file
completion. Neither component interprets content — format knowledge lives in `Layer2_Format`.

## 5. CodeInterchange — the one place a C ABI is legal

`CodeInterchange` loads genuinely foreign compiled code and therefore carries the full apparatus described in
`00-DirectoryStructure.md`: opaque tokens, versioned structures, an interface hash verified before any entry point
is taken, and no standard-library type in any signature.

🔴 This apparatus applies **here and nowhere else**. The five Slate units are static libraries built by one
invocation with identical switches; a marshalling layer between them solves a problem that does not exist. See
`00` §2.1.

## 6. InstructionExchange

Selects an instruction-set specialisation at runtime after querying the host. The selection is made once and
recorded, so that `ParityRunner` and `HardwareMetrics` can both report which specialisation produced a result — a
parity failure that only appears on one specialisation is otherwise unattributable.

## 7. Gates

- **Gate:** No Vulkan header is included anywhere in `Layer0_Platform`.
- **Gate:** `glfw3dll.lib` is linked; `glfw3.lib` appears in no configuration.
- **Gate:** Every OS conditional in the repository lives in `Layer0_Platform`.
- **Gate:** Input samples carry an arrival timestamp from `TickSequence`.
- **Gate:** Absent input axes are distinguishable from zero-valued ones.
- **Gate:** The C ABI apparatus appears only in `CodeInterchange`.

## 8. Open

| Open question                                                     | Blocks                      |
|--------------------------------------------------------------------|------------------------------|
| Which operating systems ship first — all three, or Windows only     | Nothing in design; effort    |
| Whether `CodeInterchange` has a consumer in this scope at all       | Its own implementation only  |
