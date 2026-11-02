#============================================================================================================================================
#                                                   VIRTUALIZEDGEOMETRYRENDERING.CMAKE
#============================================================================================================================================
# 🧩 1:1 C++ port of the VehicleHMI demo's virtualized geometry (cluster nesting build, runtime cut, culling and residency) and its
#    bit-exact parity validation against the demo's own builder (Exhibits/VirtualizedGeometry).

add_library(FrontierVirtualizedGeometry STATIC
    Frontier/Engine/Rendering/VirtualizedGeometry/NestingConstruction.cpp
    Frontier/Engine/Rendering/VirtualizedGeometry/NestingSelection.cpp)
target_include_directories(FrontierVirtualizedGeometry PUBLIC "${CMAKE_SOURCE_DIR}/Frontier/Engine")
target_compile_features(FrontierVirtualizedGeometry PUBLIC cxx_std_20)
# 📝 Parity with the demo's JavaScript doubles needs plain IEEE evaluation: no fused multiply-adds.
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(FrontierVirtualizedGeometry PRIVATE -ffp-contract=off)
elseif(MSVC)
    target_compile_options(FrontierVirtualizedGeometry PRIVATE /fp:precise)
endif()

if(BUILD_TESTING)
    # 📝 Every corpus surface rebuilt from the demo's own soup must hash to the demo builder's digests
    #    (Exhibits/VirtualizedGeometry/README.md).
    add_executable(NestingParityValidation
        Exhibits/VirtualizedGeometry/Code/NestingParityValidation.cpp
        Exhibits/VirtualizedGeometry/Code/SurfaceSoupArchive.cpp
        Engine/Render/StbImageImplementation.cpp)
    target_include_directories(NestingParityValidation PRIVATE "${CMAKE_SOURCE_DIR}/ExternalPackages/stb")
    target_compile_definitions(NestingParityValidation PRIVATE
        FRONTIER_VIRTUALIZED_GEOMETRY_EXHIBIT="${CMAKE_SOURCE_DIR}/Exhibits/VirtualizedGeometry")
    target_link_libraries(NestingParityValidation PRIVATE FrontierVirtualizedGeometry)
    add_test(NAME NestingParityValidation COMMAND NestingParityValidation)
endif()
