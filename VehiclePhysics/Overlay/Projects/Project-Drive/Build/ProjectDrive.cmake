# ============================================================================================================================================
#  Projects/Project-Drive/Build/ProjectDrive.cmake
#  ------------------------------------------------------------------------------------------------------------------------------------------
#  Builds Project-Drive as its OWN standalone windowed executable — a sibling of Project-Zero, NOT a mode of it.
#  Project-Drive.exe has its own entry point (DriveExecution.cpp → int main), opens its own visible window, loads its
#  own scene (DriveCourse), and lets the user drive. It compiles the Project-Zero renderer/editor translation units
#  straight into itself as shared code (so it is a full ReSTIR editor), but it never launches or depends on the
#  Project-Zero binary.
#
#  INTEGRATION — add ONE line at the very END of the root CMakeLists.txt (after the Project-Zero target, the Jolt
#  library, Vulkan/GLFW/ThorVG, ReSTIRViewportSpirv, and the FRONTIER_* variables all exist):
#
#      include(Projects/Project-Drive/Build/ProjectDrive.cmake)
#
#  This file needs these to already be defined by the root script (they are, by that point):
#      PROJECT_ZERO_SOURCES  FRONTIER_ENGINE_INCLUDES  EXT  IMGUI_SRC  IMGUI_SOURCES  THORVG_SRC
#      Vulkan_INCLUDE_DIRS  Vulkan_LIBRARIES  and the targets: Jolt  glfw  thorvg_static  ReSTIRViewportSpirv
#
#  The per-source properties Project-Zero sets (TraversalIndex/InstanceAcceleration SIMD flags, ShaderballPreview
#  defines, MiniaudioTranslation -w) are SOURCE-scoped in the same directory, so Project-Drive inherits them
#  automatically for the shared TUs — they are not repeated here.
# ============================================================================================================================================

set(PROJECT_DRIVE_ROOT    "${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Drive")
set(PROJECT_DRIVE_VEHICLE "${CMAKE_CURRENT_SOURCE_DIR}/Engine/PhysicalDynamics/Vehicle")

# ── Sources: the exact Project-Zero batch with the entry point swapped, plus the drive layer ────────────────────────────
#    Start from PROJECT_ZERO_SOURCES so the renderer/editor stay bit-for-bit identical, then remove GameExecution.cpp
#    (Project-Zero's main) and add DriveExecution.cpp (Project-Drive's own main).
set(PROJECT_DRIVE_SOURCES ${PROJECT_ZERO_SOURCES})
list(REMOVE_ITEM PROJECT_DRIVE_SOURCES Projects/Project-Zero/Source/GameExecution.cpp)

list(APPEND PROJECT_DRIVE_SOURCES
    # ---- this app's own entry point + scene/vehicle/camera layer ----
    ${PROJECT_DRIVE_ROOT}/Source/DriveExecution.cpp            # own main(): window, editor, drive loop, chase camera
    ${PROJECT_DRIVE_ROOT}/Source/DriveSceneStructure.cpp       # headless glTF exporter (flat plane + grid + ramp + bumps + car)
    ${PROJECT_DRIVE_ROOT}/Source/VehicleInstanceSequence.cpp   # vehicle physics → InstanceRecord World rows
    ${PROJECT_DRIVE_ROOT}/Source/ChaseCameraSolver.cpp         # player/vehicle camera (CameraProjection)
    # DriverInputExchange.h, VehicleInspectorSequence.h, DriverInputIntegrator.h are header-only.

    # ---- real vehicle physics (shared engine sources; the headless DriveTelemetry links the same set) ----
    ${PROJECT_DRIVE_VEHICLE}/VehicleSolver.cpp
    ${PROJECT_DRIVE_VEHICLE}/VehicleGeometry.cpp
    ${PROJECT_DRIVE_VEHICLE}/Aerodynamics.cpp
    ${PROJECT_DRIVE_VEHICLE}/XPBDSoftTyre.cpp
    ${PROJECT_DRIVE_VEHICLE}/PacejkaTyreModel.cpp
    ${PROJECT_DRIVE_VEHICLE}/TyreSlipDynamics.cpp
    ${PROJECT_DRIVE_VEHICLE}/Drivetrain.cpp
)

add_executable(Project-Drive ${PROJECT_DRIVE_SOURCES})

# ── Definitions — identical to Project-Zero (embeds the fluid layer, dev/editor build, GLFW windowing) ──────────────────
target_compile_definitions(Project-Drive PRIVATE
    PROJECT_FLUID_EMBEDDED
    FRONTIER_DEVELOPMENT
    FRONTIER_ENABLE_GLFW
)

# Shaders (SPIR-V) must be lowered before the app can present.
add_dependencies(Project-Drive ReSTIRViewportSpirv)

# ── Includes — Project-Zero's set, plus Project-Zero/Source (for RayTracingSolver.h, FlyThroughSolver.h, EditorFeed…)
#    which DriveExecution.cpp reuses, plus this project's own Source and the vehicle layer. ──────────────────────────────
target_include_directories(Project-Drive PRIVATE
    ${FRONTIER_ENGINE_INCLUDES}
    ${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Zero/Source
    ${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Dyno/Source
    ${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Drive/Source
    ${PROJECT_DRIVE_VEHICLE}
    ${EXT}/miniaudio
    ${Vulkan_INCLUDE_DIRS}
    ${IMGUI_SRC}
    ${IMGUI_SRC}/backends
    ${EXT}/glfw/include
    ${THORVG_SRC}/inc
    ${EXT}/cgltf
    ${EXT}/tinybvh
    ${EXT}/stb
    ${EXT}/ufbx
    ${EXT}/fast_obj
)

# ── Link libraries — identical to Project-Zero ─────────────────────────────────────────────────────────────────────────
target_link_libraries(Project-Drive PRIVATE
    Jolt                       # D4: rigid bodies (the course collider / ground); the vehicle layer is collider-free by design
    ${Vulkan_LIBRARIES}
    glfw
    thorvg_static
    pthread dl
)
if(WIN32)
    target_link_libraries(Project-Drive PRIVATE psapi)   # TelemetryMetrics "Show RAM Usage" (GetProcessMemoryInfo)
endif()
if(FRONTIER_FLUID_OPENMP)
    target_link_libraries(Project-Drive PRIVATE OpenMP::OpenMP_CXX)
endif()

# ── Stage the ThorVG SVG icon set next to the binary, exactly like Project-Zero (editor UI needs them) ─────────────────
file(GLOB FRONTIER_DRIVE_ICON_SOURCES CONFIGURE_DEPENDS "${CMAKE_SOURCE_DIR}/EngineContent/Icons/*.svg")
add_custom_command(TARGET Project-Drive POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:Project-Drive>/EngineContent/Icons"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different ${FRONTIER_DRIVE_ICON_SOURCES} "$<TARGET_FILE_DIR:Project-Drive>/EngineContent/Icons"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/EngineContent/Icons/ThorVG" "$<TARGET_FILE_DIR:Project-Drive>/EngineContent/Icons/ThorVG"
    COMMENT "Staging ThorVG SVG icons for Project-Drive" VERBATIM)
