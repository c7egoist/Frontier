# ============================================================================================================================================
#  ProjectTractrix.cmake — target registration for the Project-Tractrix vehicle showcase (duplicate of Project-Zero)
# ============================================================================================================================================
#
#  Include this from the top-level CMakeLists.txt *after* the Project-Zero block (it reuses the same variables that
#  block defines: FRONTIER_ENGINE_SOURCES, FRONTIER_ENGINE_INCLUDES, IMGUI_SOURCES, IMGUI_SRC, EXT, THORVG_SRC, ...):
#
#       include("${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Tractrix/Build/ProjectTractrix.cmake")
#
#  Project-Tractrix is Project-Zero plus the Phase-0 vehicle seam. The source list is intentionally the SAME explicit
#  batch as PROJECT_ZERO_SOURCES (no globbing — same rot-guard philosophy) with the new vehicle TUs appended:
#       Engine/PhysicalDynamics/VehiclePhysicsThread.cpp   — dedicated fixed-rate physics thread + GT↔PT conduits
#       Engine/PhysicalDynamics/XPBDTyreSolver.cpp         — soft-body (rigid-XPBD) tyre ring
#  (RigidBodySolver.cpp is already in the shared list; the overlay extended it in place with the Jolt seam.)
#
#  NOTE: keep this list in sync with PROJECT_ZERO_SOURCES until the shared batch is factored into a variable. If you
#        prefer not to duplicate the list, define PROJECT_ZERO_SOURCES as a CACHE/normal variable in the Project-Zero
#        block and reference it here instead of re-listing.

set(PROJECT_TRACTRIX_SOURCES
    Projects/Project-Fluid/Source/SurfaceReconstruction.cpp
    Projects/Project-Fluid/Source/GpuSurfaceData.cpp
    Projects/Project-Fluid/Source/GpuSurfaceExtractor.cpp
    Projects/Project-Fluid/Source/FluidGpuTest.cpp
    Projects/Project-Fluid/Source/VulkanFluidMain.cpp
    Projects/Project-Tractrix/Source/WaterBodySequence.cpp
    Projects/Project-Fluid/Source/PbfFluid.cpp
    Projects/Project-Fluid/Source/PondWave.cpp
    ${FRONTIER_ENGINE_SOURCES}
    Engine/DeviceExchange/SwapchainExchange.cpp
    Engine/DeviceExchange/RayTracingCapabilitySet.cpp
    Engine/DeviceExchange/VisibilityExchange.cpp
    Engine/DeviceExchange/InterfaceExchange.cpp
    Engine/DeviceExchange/GizmoExchange.cpp
    Projects/Project-Tractrix/Source/InterfaceTrialSequence.cpp
    Projects/Project-Tractrix/Source/InstanceMotionSequence.cpp
    Projects/Project-Tractrix/Source/PerformanceTelemetrySequence.cpp
    Projects/Project-Tractrix/Source/PhysicsInstanceSequence.cpp
    Projects/Project-Tractrix/Source/InterfaceAudioSequence.cpp
    Projects/Project-Dyno/Source/CrankClickIntegrator.cpp
    Projects/Project-Dyno/Source/DynoSequence.cpp
    Engine/PlatformInterchange/AudioExchange.cpp
    Engine/PlatformInterchange/MiniaudioTranslation.cpp
    Engine/PlatformInterchange/WaveCodec.cpp
    Engine/PhysicalDynamics/RigidBodySolver.cpp
    Engine/PhysicalDynamics/VehiclePhysicsThread.cpp   # Phase 0: dedicated physics thread + GT↔PT conduits
    Engine/PhysicalDynamics/XPBDTyreSolver.cpp         # Phase 0: soft-body (rigid-XPBD) tyre ring
    Projects/Project-Tractrix/Source/CelestialSequence.cpp
    Projects/Project-Tractrix/Source/CommandLine.cpp
    Projects/Project-Tractrix/Source/ShowroomStructure.cpp
    Engine/DisplayPresentation/DiagnosticInspector.cpp
    Engine/DisplayPresentation/ReSTIRIntegrator.cpp
    Engine/DisplayPresentation/ShadingTableCodec.cpp
    Engine/ContentInterchange/ShaderballPreview.cpp
    Engine/DisplayPresentation/RenderScheduler.cpp
    Projects/Project-Tractrix/Source/RayTracingSolver.cpp
    Projects/Project-Tractrix/Source/FlyThroughSolver.cpp
    Projects/Project-Tractrix/Source/GameExecution.cpp
    ${IMGUI_SOURCES}
)

add_executable(Project-Tractrix ${PROJECT_TRACTRIX_SOURCES})

# Stage the ThorVG SVG icons next to the binary, exactly as Project-Zero does.
file(GLOB FRONTIER_TRACTRIX_ICON_SOURCES CONFIGURE_DEPENDS "${CMAKE_SOURCE_DIR}/EngineContent/Icons/*.svg")
add_custom_command(TARGET Project-Tractrix POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:Project-Tractrix>/EngineContent/Icons"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different ${FRONTIER_TRACTRIX_ICON_SOURCES} "$<TARGET_FILE_DIR:Project-Tractrix>/EngineContent/Icons"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/EngineContent/Icons/ThorVG" "$<TARGET_FILE_DIR:Project-Tractrix>/EngineContent/Icons/ThorVG"
    COMMENT "Staging ThorVG SVG icons (Project-Tractrix)" VERBATIM)

target_compile_definitions(Project-Tractrix PRIVATE PROJECT_FLUID_EMBEDDED)
add_dependencies(Project-Tractrix ReSTIRViewportSpirv)

set_source_files_properties(Engine/GeometricRaster/TraversalIndex.cpp PROPERTIES COMPILE_OPTIONS "-mavx2;-mfma;-msse4.2")
set_source_files_properties(Engine/GeometricRaster/InstanceAcceleration.cpp PROPERTIES COMPILE_OPTIONS "-mavx2;-mfma;-msse4.2")

target_include_directories(Project-Tractrix PRIVATE
    ${FRONTIER_ENGINE_INCLUDES}
    ${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Tractrix/Source
    ${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Dyno/Source
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

target_link_libraries(Project-Tractrix PRIVATE Jolt)   # rigid bodies + Phase-0 vehicle seam (heightfield, casts, constraints)
target_compile_definitions(Project-Tractrix PRIVATE
    FRONTIER_DEVELOPMENT
    FRONTIER_ENABLE_GLFW
)

target_link_libraries(Project-Tractrix PRIVATE
    ${Vulkan_LIBRARIES}
    glfw
    thorvg_static
    pthread dl
)
if(WIN32)
    target_link_libraries(Project-Tractrix PRIVATE psapi)
endif()

if(TARGET OpenMP::OpenMP_CXX)
    target_link_libraries(Project-Tractrix PRIVATE OpenMP::OpenMP_CXX)
endif()
