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

enable_testing()
add_test(NAME PacejkaSlipValidation COMMAND PacejkaSlipValidation)
add_test(NAME WheelSpinValidation COMMAND WheelSpinValidation)
