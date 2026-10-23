cmake_minimum_required(VERSION 3.20)
project(FrontierVehiclePhysicsExhibit CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(FRONTIER_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../Frontier" ABSOLUTE)
add_executable(PacejkaSlipValidation
    PacejkaSlipValidation.cpp
    ${FRONTIER_ROOT}/Engine/Physics/PacejkaSlipSolver.cpp)
target_include_directories(PacejkaSlipValidation PRIVATE ${FRONTIER_ROOT})

add_executable(WheelSpinValidation
    WheelSpinValidation.cpp
    ${FRONTIER_ROOT}/Engine/Physics/WheelSpinSolver.cpp)
target_include_directories(WheelSpinValidation PRIVATE ${FRONTIER_ROOT})

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(INTERPROCEDURAL_OPTIMIZATION OFF CACHE BOOL "" FORCE)
set(OVERRIDE_CXX_FLAGS OFF CACHE BOOL "" FORCE)
set(DEBUG_RENDERER_IN_DEBUG_AND_RELEASE OFF CACHE BOOL "" FORCE)
set(PROFILER_IN_DEBUG_AND_RELEASE OFF CACHE BOOL "" FORCE)
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../../ExternalPackages/JoltPhysics/Build ${CMAKE_CURRENT_BINARY_DIR}/JoltPhysics EXCLUDE_FROM_ALL)
add_executable(JoltPhysicsValidation
    JoltPhysicsValidation.cpp
    ${FRONTIER_ROOT}/Engine/Physics/JoltPhysicsDivision.cpp)
target_include_directories(JoltPhysicsValidation PRIVATE ${FRONTIER_ROOT})
target_link_libraries(JoltPhysicsValidation PRIVATE Jolt)

enable_testing()
add_test(NAME PacejkaSlipValidation COMMAND PacejkaSlipValidation)
add_test(NAME WheelSpinValidation COMMAND WheelSpinValidation)
add_test(NAME JoltPhysicsValidation COMMAND JoltPhysicsValidation)
