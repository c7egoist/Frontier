# Frontier engine — session & game mechanics (standalone slice).
#
# The standalone session/validation build has no renderer or GLFW dependency and works with a C++17
# compiler. FRONTIER_ENABLE_GLFW optionally fetches GLFW/OpenGL and adds the interactive EverestWindow;
# SampleGlfwWindow / DriveFromWindow are enabled only for that build.
#
#   cmake -S Frontier -B /tmp/frontier-build && cmake --build /tmp/frontier-build
#   /tmp/frontier-build/SessionValidation

cmake_minimum_required(VERSION 3.16)
project(FrontierSession CXX)
include(CTest)
option(FRONTIER_ENABLE_GLFW "Build the interactive GLFW/OpenGL Everest window" OFF)

add_library(FrontierSession STATIC
    Engine/Input/InputEncoder.cpp
    Engine/Input/InputDriver.cpp
    Engine/Input/SyntheticDriver.cpp
    Engine/Scene/DeployableUnit.cpp
    Engine/Scene/FacetArchive.cpp
    Engine/Session/SpawnPolicy.cpp
    Engine/Session/SessionConfiguration.cpp
    Engine/Session/SessionPolicy.cpp
    Engine/Session/SessionSpace.cpp
    Engine/Session/TransferConfiguration.cpp
    Engine/Session/LevelTransition.cpp
    Engine/Session/LobbySession.cpp
    ../Projects/Everest/Source/Session/SessionPolicy.cpp)
target_include_directories(FrontierSession PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/..)
target_compile_features(FrontierSession PUBLIC cxx_std_17)

add_library(EverestNavigation STATIC ../Projects/Everest/Source/Navigation/NavigationApp.cpp)
target_link_libraries(EverestNavigation PUBLIC FrontierSession)

add_executable(SessionValidation ../Validation/SessionValidation.cpp)
target_link_libraries(SessionValidation PRIVATE FrontierSession EverestNavigation)

add_library(FrontierCamera STATIC Game/CameraController.cpp)
target_link_libraries(FrontierCamera PUBLIC FrontierSession)
target_link_libraries(SessionValidation PRIVATE FrontierCamera)

add_library(FrontierGame STATIC Game/SoftwarePresentation.cpp)
target_link_libraries(FrontierGame PUBLIC FrontierSession FrontierCamera)

add_executable(LobbySession Game/LobbySessionMain.cpp)
target_link_libraries(LobbySession PRIVATE FrontierGame FrontierSession)

add_executable(Everest ../Projects/Everest/Source/Game/EverestMain.cpp)
target_link_libraries(Everest PRIVATE FrontierGame FrontierSession EverestNavigation)

# The 1:1 C++ port of the exhibit's fluid/smoke editor (Experimental/FluidSmokeEditor): plume lattice, sources,
# SDF world interaction, march and the editor UI model. Device-free C++17, like the session slice.
add_library(FluidSmokeEditor STATIC
    ../Experimental/FluidSmokeEditor/Source/FluidSmokeEditor.cpp
    ../Experimental/FluidSmokeEditor/Source/GasParameters.cpp
    ../Experimental/FluidSmokeEditor/Source/PlumeMarch.cpp
    ../Experimental/FluidSmokeEditor/Source/PlumeSourceProjection.cpp
    ../Experimental/FluidSmokeEditor/Source/PlumeSpace.cpp
    ../Experimental/FluidSmokeEditor/Source/PlumeTransport.cpp
    ../Experimental/FluidSmokeEditor/Source/SceneDistanceField.cpp
    ../Experimental/FluidSmokeEditor/Source/SmokeSequence.cpp)
target_include_directories(FluidSmokeEditor PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/..)
target_compile_features(FluidSmokeEditor PUBLIC cxx_std_17)

add_executable(FluidSmokeValidation ../Validation/FluidSmokeValidation.cpp)
target_link_libraries(FluidSmokeValidation PRIVATE FluidSmokeEditor)

# Headless visual proof: scripted burnout through the ported lattice, marched and composited to a PPM/PNG.
add_executable(FluidSmokeProof ../Validation/FluidSmokeProof.cpp)
target_link_libraries(FluidSmokeProof PRIVATE FluidSmokeEditor)

if(FRONTIER_ENABLE_GLFW)
    include(FetchContent)
    set(GLFW_BUILD_DOCS OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_WAYLAND OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(glfw URL https://github.com/glfw/glfw/archive/refs/tags/3.4.tar.gz)
    FetchContent_MakeAvailable(glfw)
    find_package(OpenGL REQUIRED)

    target_compile_definitions(FrontierSession PUBLIC FRONTIER_WITH_GLFW)
    target_link_libraries(FrontierSession PUBLIC glfw)
    add_executable(EverestWindow ../Projects/Everest/Source/Game/EverestGlfwMain.cpp)
    target_link_libraries(EverestWindow PRIVATE FrontierGame FrontierSession EverestNavigation FluidSmokeEditor OpenGL::GL glfw)
endif()

if(BUILD_TESTING)
    add_test(NAME SessionValidation COMMAND SessionValidation)
    add_test(NAME FluidSmokeValidation COMMAND FluidSmokeValidation)
    add_test(NAME FluidSmokeProof COMMAND FluidSmokeProof ${CMAKE_CURRENT_BINARY_DIR}/FluidSmokeEditorProof.ppm)
endif()
