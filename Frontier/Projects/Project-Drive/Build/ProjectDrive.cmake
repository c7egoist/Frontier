#============================================================================================================================================
#                                                    PROJECTDRIVE.CMAKE
#============================================================================================================================================
# 📦 Defines only ProjectDrive.dll; Frontier.exe owns the window, device, renderer, editor, input, camera, and sky.

set(PROJECT_DRIVE_CODE_IMAGE
    Projects/Project-Drive/Source/ProjectDriveInterchange.cpp
)

foreach(ProjectDriveSource IN LISTS PROJECT_DRIVE_CODE_IMAGE)
    if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/${ProjectDriveSource}")
        message(FATAL_ERROR "ProjectDrive code image source is missing: ${ProjectDriveSource}")
    endif()
endforeach()

add_library(ProjectDrive SHARED ${PROJECT_DRIVE_CODE_IMAGE})
target_include_directories(ProjectDrive PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/Engine/ProjectInterchange
)
set_target_properties(ProjectDrive PROPERTIES
    PREFIX ""
    SUFFIX ".dll"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Drive/Build"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/Projects/Project-Drive/Build"
)
