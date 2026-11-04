cmake_minimum_required(VERSION 3.16)
project(VehicleAudioValidation CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(FRONTIER_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../Frontier" ABSOLUTE)
add_executable(VehicleAudioValidation VehicleAudioValidation.cpp
  ${FRONTIER_ROOT}/Engine/Audio/VehicleAudioSpecification.cpp
  ${FRONTIER_ROOT}/Engine/Audio/ForcedInductionModel.cpp
  ${FRONTIER_ROOT}/Engine/Audio/DrivetrainSimulation.cpp
  ${FRONTIER_ROOT}/Engine/Audio/AudioSynthesizer.cpp)
target_include_directories(VehicleAudioValidation PRIVATE ${FRONTIER_ROOT} ${FRONTIER_ROOT}/..)
enable_testing()
add_test(NAME VehicleAudioValidation COMMAND VehicleAudioValidation)
