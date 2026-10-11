#=============================================================================================================================================
# Editor/AuthoringTools/Modelling/SolidArc/CMakeLists.txt — SolidArc standalone NURBS / B-rep modelling tool.
#   Builds with no engine dependency and no external packages. The direct-modelling gates cover face loft,
#   fixed-topology tweaks, planar chamfers, bounded curved-support chamfers, face transforms, and the Phase 36a face-edit batch.
#=============================================================================================================================================

cmake_minimum_required(VERSION 3.20)
project(SolidArc LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

if(MSVC)
    add_compile_options(/W4 /WX /permissive- /utf-8)
else()
    # -Wmaybe-uninitialized is off: GCC 13 at -O3 reports it for kernel locals that are given a
    #    value on their declaring line, because it cannot follow the solver loops that decide
    #    which branch writes them. MSVC /W4 /WX sees none of them, and the warning is not
    #    worth silencing one false report at a time inside the geometry.
    add_compile_options(-Wall -Wextra -Wpedantic -Werror -Wno-unused-function -Wno-maybe-uninitialized)
endif()

# ─── Kernel: pure geometry, zero dependencies ───────────────────────────────────────────────────────────────────────────────────────────────
add_library(SolidArcKernel STATIC
    Kernel/CurveSpecification.cpp
    Kernel/SurfaceSpecification.cpp
    Kernel/TopologySpecification.cpp
    Kernel/SkinSolver.cpp
    Kernel/IntersectionSolver.cpp
    Kernel/FairPatchSolver.cpp
    Kernel/SurfaceOffsetSolver.cpp
    Kernel/ProfileSolver.cpp
    Kernel/ConstraintSolver.cpp
    Kernel/ConstraintGraph.cpp
    Kernel/MirrorSolver.cpp
    Kernel/BlendSolver.cpp
    Kernel/TweakSolver.cpp
    Kernel/FaceEditSolver.cpp
)
target_include_directories(SolidArcKernel PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# ─── Presentation + Interaction: RasterExchange rule, CPU SoftwareRaster (Slang shaders mirrored in C++), camera ─────────────────────────
add_library(SolidArcPresentation STATIC
    Presentation/SoftwareRaster.cpp
    Presentation/ScenePresentation.cpp
    Interaction/CameraProjection.cpp
    Interaction/SnapResolution.cpp
    Interaction/InputEvent.cpp
    Interaction/HotkeyChart.cpp
    Interaction/ToolSession.cpp
    Interaction/TransformGizmo.cpp
)
target_link_libraries(SolidArcPresentation PUBLIC SolidArcKernel)
target_include_directories(SolidArcPresentation PUBLIC ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/Presentation)

# ─── Optional GPU raster: DeviceRasterExchange (Vulkan). Off by default so the standalone kit keeps its zero-dependency build. ────────────────
#   The Windows GUI (Tools/Build/BuildSolidArcApplication.py) compiles it unconditionally and lowers Device*.slang with the SDK's slangc.
option(SOLIDARC_VULKAN_RASTER "Build DeviceRasterExchange and lower the Device*.slang shaders (needs the Vulkan SDK)" OFF)
if(SOLIDARC_VULKAN_RASTER)
    find_package(Vulkan REQUIRED)
    target_sources(SolidArcPresentation PRIVATE Presentation/DeviceRasterExchange.cpp)
    target_link_libraries(SolidArcPresentation PUBLIC Vulkan::Vulkan)
    target_compile_definitions(SolidArcPresentation PUBLIC SOLIDARC_VULKAN_RASTER)
    if(NOT MSVC)
        target_compile_options(SolidArcPresentation PRIVATE -Wno-missing-field-initializers)   # Vulkan *CreateInfo aggregates name only sType
    endif()
    find_program(SOLIDARC_SLANGC slangc HINTS "$ENV{VULKAN_SDK}/bin" "/usr/bin" "/usr/local/bin")
    if(SOLIDARC_SLANGC)
        set(SOLIDARC_SPIRV_DIR "${CMAKE_BINARY_DIR}/SolidArcShaders")
        set(SOLIDARC_SPIRV_OUTPUTS)
        foreach(ENTRY IN ITEMS DeviceSurface.vert|vertex DeviceSurface.frag|fragment DeviceLine.vert|vertex DeviceLine.frag|fragment
                               DevicePoint.vert|vertex DevicePoint.frag|fragment DeviceLattice.vert|vertex DeviceLattice.frag|fragment)
            string(REPLACE "|" ";" FIELDS "${ENTRY}")
            list(GET FIELDS 0 STEM)
            list(GET FIELDS 1 STAGE)
            add_custom_command(
                OUTPUT  "${SOLIDARC_SPIRV_DIR}/${STEM}.spv"
                COMMAND "${CMAKE_COMMAND}" -E make_directory "${SOLIDARC_SPIRV_DIR}"
                COMMAND "${SOLIDARC_SLANGC}" "${CMAKE_CURRENT_SOURCE_DIR}/Presentation/Shaders/${STEM}.slang" -target spirv -profile glsl_450
                        -stage ${STAGE} -entry main -matrix-layout-column-major -I "${CMAKE_CURRENT_SOURCE_DIR}/Presentation/Shaders"
                        -o "${SOLIDARC_SPIRV_DIR}/${STEM}.spv"
                DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/Presentation/Shaders/${STEM}.slang"
                COMMENT "[SolidArc] Lowering ${STEM}.slang (${STAGE})"
                VERBATIM)
            list(APPEND SOLIDARC_SPIRV_OUTPUTS "${SOLIDARC_SPIRV_DIR}/${STEM}.spv")
        endforeach()
        add_custom_target(SolidArcDeviceShaders DEPENDS ${SOLIDARC_SPIRV_OUTPUTS})
    else()
        message(WARNING "[SolidArc] slangc not found — Device*.spv must be produced by hand")
    endif()
endif()

# ─── Document + Console: figure store, command codec, console host, SolidArc executable ───────────────────────────────────────────────────────
add_library(SolidArcConsoleKit STATIC
    Document/SceneDocument.cpp
    Document/FigureRecipe.cpp
    Document/UndoSequence.cpp
    Console/CommandCodec.cpp
    Console/ConsoleHost.cpp
    Console/ConsoleInteraction.cpp
    Console/ConsoleSelection.cpp
)
target_link_libraries(SolidArcConsoleKit PUBLIC SolidArcPresentation)

# Optional native regression for the windowed rail's shared selection/gizmo seam.
# The default standalone route remains reusable libraries; Windows still builds the real UI.
option(SOLIDARC_BUILD_MODE_TESTS "Build SolidArc selection-mode transform regression" OFF)
if(SOLIDARC_BUILD_MODE_TESTS)
    enable_testing()
    add_executable(SolidArcModeTransformVerification Verification/ModeTransformVerification.cpp)
    target_link_libraries(SolidArcModeTransformVerification PRIVATE SolidArcConsoleKit)
    add_test(NAME SolidArcModeTransform COMMAND SolidArcModeTransformVerification)
    add_executable(SolidArcConstructionWorkflowVerification Verification/ConstructionWorkflowVerification.cpp)
    target_link_libraries(SolidArcConstructionWorkflowVerification PRIVATE SolidArcConsoleKit)
    add_test(NAME SolidArcConstructionWorkflow COMMAND SolidArcConstructionWorkflowVerification)
endif()
