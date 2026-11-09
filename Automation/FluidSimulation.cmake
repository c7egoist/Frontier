#============================================================================================================================================
#                                                       FLUIDSIMULATION.CMAKE
#============================================================================================================================================
# 🧩 Headless CPU Eulerian fluid simulation and its codec, coupling, and numerical validation target.

add_library(FrontierFluidDynamics STATIC
    Frontier/Engine/PhysicalDynamics/FluidDynamics/FluidSpace.cpp
    Frontier/Engine/PhysicalDynamics/FluidDynamics/FluidSimulationSequence.cpp)
target_include_directories(FrontierFluidDynamics PUBLIC
    "${CMAKE_SOURCE_DIR}"
    "${CMAKE_SOURCE_DIR}/Frontier"
    "${CMAKE_SOURCE_DIR}/ExternalPackages/tomlpp/include")

if(BUILD_TESTING)
    add_executable(FluidSpaceValidation
        Exhibits/ParticleEditor/Code/FluidSpaceValidation.cpp)
    target_link_libraries(FluidSpaceValidation PRIVATE FrontierFluidDynamics)
    add_test(NAME FluidSpaceValidation COMMAND FluidSpaceValidation)
    set_tests_properties(FluidSpaceValidation PROPERTIES TIMEOUT 60)
endif()
