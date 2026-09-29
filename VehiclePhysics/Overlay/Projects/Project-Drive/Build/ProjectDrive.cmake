# ============================================================================================================================================
#  Projects/Project-Drive/Build/ProjectDrive.cmake — appends the Project-Drive vehicle layer to the app target.
# ============================================================================================================================================
#  Frontier links every sub-project into the single windowed executable (see the root CMakeLists.txt, where
#  Project-Dyno and Project-Fluid sources are added straight into PROJECT_ZERO_SOURCES). Project-Drive follows the
#  same pattern. From the root CMakeLists.txt, BEFORE `add_executable(...)`, do:
#
#      include(Projects/Project-Drive/Build/ProjectDrive.cmake)
#      list(APPEND PROJECT_ZERO_SOURCES ${PROJECT_DRIVE_SOURCES})
#
#  then AFTER the target exists:
#
#      target_include_directories(Project-Zero PRIVATE ${PROJECT_DRIVE_INCLUDE_DIRS})
#
#  (No new link libraries: the vehicle layer is engine-agnostic C++/STL — no Jolt, no Vulkan.)

set(PROJECT_DRIVE_ROOT   "${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Drive")
set(PROJECT_DRIVE_VEHICLE "${CMAKE_CURRENT_SOURCE_DIR}/Engine/PhysicalDynamics/Vehicle")

set(PROJECT_DRIVE_SOURCES
    # ---- project integration layer (this folder) ----
    ${PROJECT_DRIVE_ROOT}/Source/VehicleInstanceSequence.cpp   # physics -> InstanceRecord World rows
    ${PROJECT_DRIVE_ROOT}/Source/ChaseCameraSolver.cpp         # player/vehicle camera (CameraProjection)
    # VehicleInputBridge.h and VehicleInspectorSequence.h are header-only.

    # ---- real vehicle physics (shared engine sources; the headless DriveTelemetry links the same set) ----
    ${PROJECT_DRIVE_VEHICLE}/VehicleController.cpp
    ${PROJECT_DRIVE_VEHICLE}/VehicleGeometry.cpp
    ${PROJECT_DRIVE_VEHICLE}/Aerodynamics.cpp
    ${PROJECT_DRIVE_VEHICLE}/XPBDSoftTyre.cpp
    ${PROJECT_DRIVE_VEHICLE}/PacejkaTyreModel.cpp
    ${PROJECT_DRIVE_VEHICLE}/TyreSlipDynamics.cpp
    ${PROJECT_DRIVE_VEHICLE}/Drivetrain.cpp
)

set(PROJECT_DRIVE_INCLUDE_DIRS
    ${PROJECT_DRIVE_ROOT}/Source
    ${PROJECT_DRIVE_VEHICLE}
)
