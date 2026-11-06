# Frontier engine — session, game mechanics, Vulkan 1.1 GPU 3D Pyro volumetrics, SDF world, and Frontier/Fluid editors.
#
#   cmake -S Frontier -B /tmp/frontier-build && cmake --build /tmp/frontier-build
#   ctest --test-dir /tmp/frontier-build --output-on-failure

cmake_minimum_required(VERSION 3.16)
project(FrontierSession CXX)
include(CTest)
include(FetchContent)

if(MSVC)
    add_compile_options(/utf-8)
    add_compile_definitions(NOMINMAX _CRT_SECURE_NO_WARNINGS)
endif()

option(FRONTIER_ENABLE_GLFW "Build the interactive GLFW + Vulkan 1.1 Everest window" OFF)

# --- Third-party header/source dependencies (Khronos Vulkan-Headers, Dear ImGui & toml++) ---
FetchContent_Declare(
    vulkan_headers
    URL https://github.com/KhronosGroup/Vulkan-Headers/archive/refs/tags/v1.3.296.tar.gz
    SOURCE_SUBDIR _header_only_
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_Declare(
    tomlplusplus
    URL https://github.com/marzer/tomlplusplus/archive/1e8829b793b66ad17011732a146b8077d379b011.tar.gz
    SOURCE_SUBDIR _header_only_
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_Declare(
    imgui
    URL https://github.com/ocornut/imgui/archive/3bae66c735670619baf51391eba7f3d90a25d125.tar.gz
    SOURCE_SUBDIR _manual_sources_
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(vulkan_headers tomlplusplus imgui)

add_library(FrontierImGui STATIC
    ${imgui_SOURCE_DIR}/imgui.cpp
    ${imgui_SOURCE_DIR}/imgui_draw.cpp
    ${imgui_SOURCE_DIR}/imgui_tables.cpp
    ${imgui_SOURCE_DIR}/imgui_widgets.cpp)
target_include_directories(FrontierImGui PUBLIC ${imgui_SOURCE_DIR})
target_compile_features(FrontierImGui PUBLIC cxx_std_17)

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

add_library(FrontierCamera STATIC Game/CameraController.cpp)
target_link_libraries(FrontierCamera PUBLIC FrontierSession)

add_library(FrontierGame STATIC Game/SoftwarePresentation.cpp)
target_link_libraries(FrontierGame PUBLIC FrontierSession FrontierCamera)

add_library(FrontierVolumetrics STATIC
    Engine/Rendering/VulkanContext.cpp
    Engine/Rendering/WorldSdfScene.cpp
    Engine/VolumetricDynamics/PyroVolumeSolver.cpp
    Engine/VolumetricDynamics/TyreSmokeIntake.cpp
    Engine/Editor/FluidEditorWorkspace.cpp
    Engine/Editor/FrontierEditorWorkspace.cpp)
target_include_directories(FrontierVolumetrics PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/..
    ${vulkan_headers_SOURCE_DIR}/include
    ${tomlplusplus_SOURCE_DIR}/include)
target_link_libraries(FrontierVolumetrics PUBLIC
    FrontierGame
    FrontierSession
    FrontierCamera
    EverestNavigation
    FrontierImGui
    ${CMAKE_DL_LIBS})
target_compile_features(FrontierVolumetrics PUBLIC cxx_std_17)

add_executable(SessionValidation ../Validation/SessionValidation.cpp)
target_link_libraries(SessionValidation PRIVATE FrontierSession EverestNavigation FrontierCamera)

add_executable(VolumetricAndEditorValidation ../Validation/VolumetricAndEditorValidation.cpp)
target_link_libraries(VolumetricAndEditorValidation PRIVATE FrontierVolumetrics)

add_executable(LobbySession Game/LobbySessionMain.cpp)
target_link_libraries(LobbySession PRIVATE FrontierGame FrontierSession)

add_executable(Everest ../Projects/Everest/Source/Game/EverestMain.cpp)
target_link_libraries(Everest PRIVATE FrontierGame FrontierSession EverestNavigation)

if(FRONTIER_ENABLE_GLFW)
    set(GLFW_BUILD_DOCS OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_WAYLAND OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(
        glfw
        URL https://github.com/glfw/glfw/archive/refs/tags/3.4.tar.gz
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE
    )
    FetchContent_MakeAvailable(glfw)

    target_compile_definitions(FrontierSession PUBLIC FRONTIER_WITH_GLFW GLFW_INCLUDE_NONE)
    target_link_libraries(FrontierSession PUBLIC glfw)
    add_executable(EverestWindow
        ../Projects/Everest/Source/Game/EverestGlfwMain.cpp
        ${imgui_SOURCE_DIR}/backends/imgui_impl_glfw.cpp)
    target_compile_definitions(EverestWindow PRIVATE GLFW_INCLUDE_NONE)
    target_link_libraries(EverestWindow PRIVATE
        FrontierVolumetrics
        FrontierGame
        FrontierSession
        EverestNavigation
        glfw)
endif()

if(BUILD_TESTING)
    add_test(NAME SessionValidation
             COMMAND SessionValidation
             WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/..)
    add_test(NAME VolumetricAndEditorValidation
             COMMAND VolumetricAndEditorValidation
             WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/..)
endif()
