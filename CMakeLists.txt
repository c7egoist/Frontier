#============================================================================================================================================
# Frontier/CMakeLists.txt — Linux/Cross-Platform CMake (for IDE integration and Linux builds only)
#   Windows builds use Projects/Project-Zero/Build/ToolchainSequence.ps1 (MSVC direct toolchain).
#   ExternalPackages/ are git submodules — run `git submodule update --init --recursive` first.
#============================================================================================================================================

cmake_minimum_required(VERSION 3.20)
project(FrontierEngine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ─── Reject Windows CMake builds — use ToolchainSequence.ps1 instead ────────────────────────────────────────────────────────────────────────
if(WIN32 AND MSVC)
    message(FATAL_ERROR
        "[Frontier] Windows builds must use the direct MSVC toolchain:\n"
        "  pwsh -File Projects\\Project-Zero\\Build\\ToolchainSequence.ps1\n"
        "CMake is supported on Linux / macOS only.")
endif()

# ─── ExternalPackages roots ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
set(EXT "${CMAKE_SOURCE_DIR}/ExternalPackages")

# Verify submodules are initialised
foreach(PKG glfw jolt cgltf tinybvh clipper2 earcut fast_obj miniaudio stb ufbx)
    if(NOT EXISTS "${EXT}/${PKG}/CMakeLists.txt" AND NOT EXISTS "${EXT}/${PKG}/include" AND NOT EXISTS "${EXT}/${PKG}/inc")
        message(WARNING "[Frontier] ExternalPackages/${PKG} appears uninitialised. Run: git submodule update --init --recursive")
    endif()
endforeach()

# ─── GLFW — built from source submodule (Linux static) ──────────────────────────────────────────────────────────────────────────────────────
set(GLFW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(GLFW_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(GLFW_BUILD_DOCS     OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS   OFF CACHE BOOL "" FORCE)
add_subdirectory("${EXT}/glfw" "${CMAKE_BINARY_DIR}/glfw" EXCLUDE_FROM_ALL)

# ─── Vulkan ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
find_package(Vulkan REQUIRED)

# ─── Shader lowering — GLSL-in-.slang → SPIR-V (one entry per stage; mirrors $ShaderTable in ToolchainSequence.ps1) ─────────────────
find_program(GLSLC_EXECUTABLE glslc HINTS "$ENV{VULKAN_SDK}/bin" "/usr/bin" "/usr/local/bin")
find_program(SLANGC_EXECUTABLE slangc HINTS "$ENV{VULKAN_SDK}/bin" "/usr/bin" "/usr/local/bin")

set(SHADER_ROOT "${CMAKE_SOURCE_DIR}/Engine/Shaders")
set(SHADER_INCLUDES "${SHADER_ROOT}/SceneRecords.slang" "${SHADER_ROOT}/RayGeneration.slang" "${SHADER_ROOT}/TraversalCWBVH.slang")
set(SHADER_TABLE
    "ReSTIRViewport.slang|compute|ReSTIRViewport.spv"
    "ClusterCull.slang|compute|ClusterCull.spv"
    "HiZReduce.slang|compute|HiZReduce.spv"
    "AtrousDenoise.slang|compute|AtrousDenoise.spv"
    "LuminanceReduce.slang|compute|LuminanceReduce.spv"
    "SurfaceResolve.slang|compute|SurfaceResolve.spv"
    "VisibilityRaster.vert.slang|vertex|VisibilityRaster.vert.spv"
    "VisibilityRaster.frag.slang|fragment|VisibilityRaster.frag.spv")

set(SPV_OUTPUTS)
if(GLSLC_EXECUTABLE OR SLANGC_EXECUTABLE)
    foreach(ENTRY IN LISTS SHADER_TABLE)
        string(REPLACE "|" ";" FIELDS "${ENTRY}")
        list(GET FIELDS 0 SRC_NAME)
        list(GET FIELDS 1 STAGE)
        list(GET FIELDS 2 OUT_NAME)
        set(SRC "${SHADER_ROOT}/${SRC_NAME}")
        set(OUT "${SHADER_ROOT}/${OUT_NAME}")
        if(GLSLC_EXECUTABLE)
            # glslc needs a recognised extension: stage the source under a .glsl name in the build tree
            set(STAGED "${CMAKE_BINARY_DIR}/Shaders/${OUT_NAME}.glsl")
            add_custom_command(
                OUTPUT  "${OUT}"
                COMMAND "${CMAKE_COMMAND}" -E make_directory "${CMAKE_BINARY_DIR}/Shaders"
                COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${SRC}" "${STAGED}"
                COMMAND "${GLSLC_EXECUTABLE}" "-DFRONTIER_SHADER_TOOLCHAIN=1" "-I${CMAKE_SOURCE_DIR}/Engine" "-I${SHADER_ROOT}"
                        --target-env=vulkan1.2 "-fshader-stage=${STAGE}" -o "${OUT}" "${STAGED}"
                DEPENDS "${SRC}" ${SHADER_INCLUDES}
                COMMENT "[Project-Zero] Lowering ${SRC_NAME} -> ${OUT_NAME} (${STAGE})"
                VERBATIM)
        else()
            add_custom_command(
                OUTPUT  "${OUT}"
                COMMAND "${SLANGC_EXECUTABLE}" "${SRC}" "-DFRONTIER_SHADER_TOOLCHAIN=1" "-I${CMAKE_SOURCE_DIR}/Engine" "-I${SHADER_ROOT}"
                        -target spirv -profile glsl_450 -stage ${STAGE} -entry main -o "${OUT}"
                DEPENDS "${SRC}" ${SHADER_INCLUDES}
                COMMENT "[Project-Zero] Lowering ${SRC_NAME} -> ${OUT_NAME} (${STAGE})"
                VERBATIM)
        endif()
        list(APPEND SPV_OUTPUTS "${OUT}")
    endforeach()
    add_custom_target(ReSTIRViewportSpirv DEPENDS ${SPV_OUTPUTS})
else()
    message(WARNING "[Project-Zero] neither glslc nor slangc found - Engine/Shaders/*.spv must be pre-compiled.")
    add_custom_target(ReSTIRViewportSpirv)
endif()
set(FRONTIER_ENGINE_SOURCES
    Engine/DeviceExchange/OrientationClassifier.cpp
    Engine/DeviceExchange/InputExchange.cpp
    Engine/DeviceExchange/DiagnosticMetrics.cpp
    Engine/GeometricRaster/GeometryStructure.cpp
    Engine/GeometricRaster/CameraProjection.cpp
    Engine/GeometricRaster/SceneStructure.cpp
    Engine/GeometricRaster/TraversalIndex.cpp
    Engine/ContentInterchange/MaterialIndex.cpp
    Engine/ContentInterchange/MaterialCodec.cpp
    Engine/ContentInterchange/TextureIndex.cpp
    Engine/ContentInterchange/SceneCodec.cpp
    Engine/ContentInterchange/ShaderBallStructure.cpp
    Engine/ContentInterchange/FbxCodec.cpp
    Engine/ContentInterchange/ObjCodec.cpp
    Engine/ContentInterchange/ContentCodec.cpp
    Engine/ContentInterchange/UfbxTranslation.cpp
    Engine/DisplayPresentation/ExposureIntegrator.cpp
)

# ─── Engine common include dirs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
set(FRONTIER_ENGINE_INCLUDES
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/Engine
    ${EXT}/jolt
)

#============================================================================================================================================
# Project-Zero — Windowed ReSTIR GI Renderer (Vulkan + GLFW)
#============================================================================================================================================

set(PROJECT_ZERO_SOURCES
    ${FRONTIER_ENGINE_SOURCES}
    Engine/DeviceExchange/SwapchainExchange.cpp
    Engine/DeviceExchange/RayTracingCapabilitySet.cpp
    Engine/DeviceExchange/VisibilityExchange.cpp
    Projects/Project-Zero/Source/InstanceMotionSequence.cpp
    Projects/Project-Zero/Source/PhysicsInstanceSequence.cpp
    Engine/PhysicalDynamics/RigidBodySolver.cpp
    Projects/Project-Zero/Source/ShowroomStructure.cpp
    Engine/DisplayPresentation/ReSTIRIntegrator.cpp
    Engine/DisplayPresentation/ShadingTableCodec.cpp
    Projects/Project-Zero/Source/RayTracingSolver.cpp
    Projects/Project-Zero/Source/FlyThroughSolver.cpp
    Projects/Project-Zero/Source/GameExecution.cpp
)

# Fail fast with NAMES if the source list ever rots again, mirroring the guard in
#    Projects/Project-Zero/Build/ToolchainSequence.ps1. Without it a stale entry surfaces as a wall of cascading
#    compiler errors (was: 73 C1083s on Windows, 2026-09-04) instead of one legible message. Only repo-relative
#    paths are checked; ${...} entries are generator expressions or submodule paths resolved elsewhere.
set(FRONTIER_MISSING_SOURCES "")
foreach(FrontierSource IN LISTS PROJECT_ZERO_SOURCES)
    if(NOT FrontierSource MATCHES "^\\$" AND NOT IS_ABSOLUTE "${FrontierSource}")
        if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/${FrontierSource}")
            list(APPEND FRONTIER_MISSING_SOURCES "${FrontierSource}")
        endif()
    endif()
endforeach()
if(FRONTIER_MISSING_SOURCES)
    string(REPLACE ";" "\n    " FRONTIER_MISSING_REPORT "${FRONTIER_MISSING_SOURCES}")
    message(FATAL_ERROR "missing source files in the translation batch:\n    ${FRONTIER_MISSING_REPORT}")
endif()

add_executable(Project-Zero ${PROJECT_ZERO_SOURCES})
add_dependencies(Project-Zero ReSTIRViewportSpirv)
set_source_files_properties(Engine/GeometricRaster/TraversalIndex.cpp PROPERTIES COMPILE_OPTIONS "-mavx2;-mfma;-msse4.2")   # tinybvh SIMD build

target_include_directories(Project-Zero PRIVATE
    ${FRONTIER_ENGINE_INCLUDES}
    ${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Zero/Source
    ${Vulkan_INCLUDE_DIRS}
    ${EXT}/glfw/include
    ${EXT}/cgltf
    ${EXT}/tinybvh
    ${EXT}/stb
    ${EXT}/ufbx
    ${EXT}/fast_obj
)

target_link_libraries(Project-Zero PRIVATE Jolt)   # D4: rigid bodies drive instance transforms
target_compile_definitions(Project-Zero PRIVATE
    FRONTIER_DEVELOPMENT
    FRONTIER_ENABLE_GLFW
)

target_link_libraries(Project-Zero PRIVATE
    ${Vulkan_LIBRARIES}
    glfw
    pthread dl
)

#============================================================================================================================================
# Project-Dyno — Windowless dyno cell (miniaudio transport + powertrain acoustics; no Vulkan / GLFW / ImGui)
#   Self-contained on purpose: it lists exactly the TUs it needs so it builds even when the engine-wide lists above rot.
#============================================================================================================================================

set(PROJECT_DYNO_SOURCES
    Engine/DeviceExchange/DiagnosticMetrics.cpp
    Engine/PlatformInterchange/MiniaudioTranslation.cpp
    Engine/PlatformInterchange/WaveCodec.cpp
    Engine/PlatformInterchange/AudioExchange.cpp
    Projects/Project-Dyno/Source/DynoSequence.cpp
    Projects/Project-Dyno/Source/CrankClickIntegrator.cpp
    Projects/Project-Dyno/Source/GameExecution.cpp
)
add_executable(Project-Dyno ${PROJECT_DYNO_SOURCES})
set_source_files_properties(Engine/PlatformInterchange/MiniaudioTranslation.cpp PROPERTIES COMPILE_OPTIONS "-w")   # third-party TU
target_include_directories(Project-Dyno PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/Engine
    ${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Dyno/Source
    ${EXT}/miniaudio
    ${EXT}/tomlpp/include
    ${EXT}/stb
)
target_compile_definitions(Project-Dyno PRIVATE FRONTIER_DEVELOPMENT)
target_compile_options(Project-Dyno PRIVATE -Wall -Wextra)
target_link_libraries(Project-Dyno PRIVATE pthread dl m)

#============================================================================================================================================
# FrontierEngine demo target (Linux only)
#============================================================================================================================================

add_executable(FrontierEngine
    ${FRONTIER_ENGINE_SOURCES}
)
target_include_directories(FrontierEngine PRIVATE ${FRONTIER_ENGINE_INCLUDES})
target_link_libraries(FrontierEngine PRIVATE pthread)

#============================================================================================================================================
# Project-F20 — Racing Game   (🚧 removed 2026-09-05: Projects/Project-F20/ does not exist in this tree)
#============================================================================================================================================
# All five of its sources were absent, so `cmake` failed at configure time before reaching any real target. The
#    target is dropped rather than commented out; restore it from history if the project comes back.

#============================================================================================================================================
# Jolt Physics — compiled from the submodule as a static library, rigid-body subset (no GPU compute back ends / hair shaders)
#   Flags mirror Scripts/BuildJolt.sh. Jolt derives JPH_USE_* / JPH_DEBUG from the compiler flags and RegisterTypes() aborts on a
#   library/client mismatch, so FRONTIER_PHYSICS_FLAGS is applied to every target that includes <Jolt/Jolt.h> as well.
#============================================================================================================================================

set(FRONTIER_PHYSICS_FLAGS -mavx -mpopcnt -mfpmath=sse)

file(GLOB_RECURSE JOLT_SOURCES CONFIGURE_DEPENDS "${EXT}/jolt/Jolt/*.cpp")
list(FILTER JOLT_SOURCES EXCLUDE REGEX "/Compute/(CPU|DX12|VK|MTL)/")
list(FILTER JOLT_SOURCES EXCLUDE REGEX "/Shaders/(HairWrapper|TestComputeWrapper)\\.cpp$")

add_library(Jolt STATIC ${JOLT_SOURCES})
target_include_directories(Jolt PUBLIC "${EXT}/jolt")
target_compile_options(Jolt PUBLIC ${FRONTIER_PHYSICS_FLAGS} -pthread)
target_compile_options(Jolt PRIVATE -Wall -Wno-psabi -Wno-stringop-overflow)
target_compile_definitions(Jolt PUBLIC "$<$<NOT:$<CONFIG:Debug>>:NDEBUG>")   # Release → JPH_DEBUG off; Debug → asserts on (both sides)
target_link_libraries(Jolt PUBLIC pthread)

#============================================================================================================================================
# Project-Physics — Jolt rigid-body testbed (console; plane + falling boxes / spheres / capsules ticked from the main loop)
#============================================================================================================================================
# Deliberately does NOT link FrontierEngine: the testbed is a console proof of the RigidBodySolver seam and needs neither Vulkan nor
#    GLFW, so it stays buildable when the graphics submodules are uninitialised.

add_executable(Project-Physics
    Engine/DeviceExchange/OrientationClassifier.cpp
    Engine/DeviceExchange/DiagnosticMetrics.cpp
    Engine/PhysicalDynamics/RigidBodySolver.cpp
    Projects/Project-Physics/Source/DropSceneStructure.cpp
    Projects/Project-Physics/Source/GameExecution.cpp
)
target_include_directories(Project-Physics PRIVATE
    ${FRONTIER_ENGINE_INCLUDES}
    ${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Physics/Source
)
target_compile_definitions(Project-Physics PRIVATE FRONTIER_DEVELOPMENT "$<$<CONFIG:Debug>:FRONTIER_DEBUG=1>")
target_compile_options(Project-Physics PRIVATE -Wall -Wextra -Wno-psabi)
target_link_libraries(Project-Physics PRIVATE Jolt pthread)
