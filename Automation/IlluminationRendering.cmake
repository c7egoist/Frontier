#============================================================================================================================================
#                                                     ILLUMINATIONRENDERING.CMAKE
#============================================================================================================================================
# 🧩 1:1 C++/Vulkan/Slang port of the VehicleHMI demo's ReSTIR GI renderer (scene distance field + surface cards + BVH path
#    tracer + ReSTIR GI + SVGF + display), its Slang units, and the parity validation against captures of the original demo.

add_library(FrontierIllumination STATIC
    Frontier/Engine/DeviceExchange/DeviceExchange.cpp
    Frontier/Engine/Illumination/TransformProjection.cpp
    Frontier/Engine/Illumination/SceneStructure.cpp
    Frontier/Engine/Illumination/BoundingStructure.cpp
    Frontier/Engine/Illumination/ShaderInterchange.cpp
    Frontier/Engine/Illumination/OccupantDistanceSpace.cpp
    Frontier/Engine/Illumination/IlluminationConstants.cpp
    Frontier/Engine/Illumination/SceneDistanceSpace.cpp
    Frontier/Engine/Illumination/SurfaceCardDepot.cpp
    Frontier/Engine/Illumination/RayTracingSpace.cpp
    Frontier/Engine/Illumination/AtmosphereIntegrator.cpp
    Frontier/Engine/Illumination/ShadowProjection.cpp
    Frontier/Engine/Illumination/SurfaceProjection.cpp
    Frontier/Engine/Illumination/ResamplingSequence.cpp
    Frontier/Engine/Illumination/DisplayProjection.cpp
    Frontier/Engine/Illumination/RefreshEncoding.cpp
    Frontier/Engine/Illumination/IlluminationHost.cpp)

target_include_directories(FrontierIllumination PUBLIC
    "${CMAKE_SOURCE_DIR}"
    "${CMAKE_SOURCE_DIR}/Frontier/Engine"
    "${CMAKE_SOURCE_DIR}/ExternalPackages/vulkan-headers/include")
target_compile_definitions(FrontierIllumination PUBLIC VK_NO_PROTOTYPES)
target_compile_features(FrontierIllumination PUBLIC cxx_std_20)
target_link_libraries(FrontierIllumination PUBLIC ${CMAKE_DL_LIBS} Threads::Threads)

find_program(FRONTIER_ILLUMINATION_SLANGC
    NAMES slangc
    PATHS "${CMAKE_SOURCE_DIR}/ExternalPackages/VulkanCompute/Slang/slangtorch/bin")

set(FRONTIER_ILLUMINATION_SHADER_SRC "${CMAKE_SOURCE_DIR}/Frontier/Engine/Shaders/Illumination")
set(FRONTIER_ILLUMINATION_SHADER_OUT "${CMAKE_BINARY_DIR}/ShaderArchives/Illumination")
file(GLOB FRONTIER_ILLUMINATION_SLANG_SOURCES CONFIGURE_DEPENDS "${FRONTIER_ILLUMINATION_SHADER_SRC}/*.slang")

# Unit:Entry:Stage — one SPIR-V file per entry point, <Unit>.<Entry>.spv.
set(FRONTIER_ILLUMINATION_ENTRIES
    "DistanceTransfer:TransferDistance:compute"
    "FragmentDistance:ComputeFragmentDistance:compute"
    "DistanceUnion:UniteDistance:compute"
    "CardCapture:CaptureVertex:vertex"
    "CardCapture:CaptureFragment:fragment"
    "CardDirect:IntegrateCardDirect:compute"
    "CardRadiosity:IntegrateCardRadiosity:compute"
    "CardFinal:IntegrateCardFinal:compute"
    "AtmosphereTransmittance:IntegrateTransmittance:compute"
    "AtmosphereMultiple:IntegrateMultiple:compute"
    "AtmosphereScattering:IntegrateSkyView:compute"
    "ShadowRaster:ShadowVertex:vertex"
    "ShadowRaster:MaskedShadowVertex:vertex"
    "ShadowRaster:MaskedShadowFragment:fragment"
    "GeometryClusterCull:CullGeometryClusters:compute"
    "SurfaceRaster:SurfaceVertex:vertex"
    "SurfaceRaster:SurfaceFragment:fragment"
    "DirectRadiance:IntegrateDirectRadiance:compute"
    "ReservoirTemporal:ResampleTemporal:compute"
    "ReservoirSpatial:ResampleSpatial:compute"
    "ReflectionTrace:TraverseReflection:compute"
    "VarianceTemporal:IntegrateTemporal:compute"
    "VarianceWavelet:ConvolveWavelet:compute"
    "VarianceUpsample:ProjectScreenSignal:compute"
    "DisplayRecombination:ResolveRecombination:compute"
    "DisplayAntialias:IntegrateAntialias:compute"
    "DisplayExposure:IntegrateExposure:compute"
    "DisplayPresent:PresentVertex:vertex"
    "DisplayPresent:PresentFragment:fragment")

set(FRONTIER_ILLUMINATION_SPV_OUTPUTS)
if(FRONTIER_ILLUMINATION_SLANGC)
    foreach(ENTRY_SPEC IN LISTS FRONTIER_ILLUMINATION_ENTRIES)
        string(REPLACE ":" ";" ENTRY_PARTS "${ENTRY_SPEC}")
        list(GET ENTRY_PARTS 0 ENTRY_UNIT)
        list(GET ENTRY_PARTS 1 ENTRY_NAME)
        list(GET ENTRY_PARTS 2 ENTRY_STAGE)
        set(ENTRY_SPV "${FRONTIER_ILLUMINATION_SHADER_OUT}/${ENTRY_UNIT}.${ENTRY_NAME}.spv")
        list(APPEND FRONTIER_ILLUMINATION_SPV_OUTPUTS "${ENTRY_SPV}")
        add_custom_command(
            OUTPUT "${ENTRY_SPV}"
            COMMAND "${CMAKE_COMMAND}" -E make_directory "${FRONTIER_ILLUMINATION_SHADER_OUT}"
            COMMAND "${FRONTIER_ILLUMINATION_SLANGC}" "${FRONTIER_ILLUMINATION_SHADER_SRC}/${ENTRY_UNIT}.slang"
                -I "${FRONTIER_ILLUMINATION_SHADER_SRC}"
                -entry "${ENTRY_NAME}"
                -stage "${ENTRY_STAGE}"
                -target spirv
                -profile spirv_1_3
                -emit-spirv-directly
                -matrix-layout-row-major
                -fvk-use-entrypoint-name
                -O0
                -o "${ENTRY_SPV}"
            DEPENDS ${FRONTIER_ILLUMINATION_SLANG_SOURCES}
            VERBATIM)
    endforeach()
    add_custom_target(FrontierIlluminationShaders ALL DEPENDS ${FRONTIER_ILLUMINATION_SPV_OUTPUTS})
endif()

if(BUILD_TESTING)
    # 📝 Parity validation against a reference capture of the original demo (Exhibits/RestirGiParity/README.md).
    add_executable(RestirGiParityValidation
        Exhibits/RestirGiParity/Code/RestirGiParityValidation.cpp
        Exhibits/RestirGiParity/Code/ReferenceCapture.cpp
        Engine/Render/StbImageWriteImplementation.cpp)
    target_include_directories(RestirGiParityValidation PRIVATE "${CMAKE_SOURCE_DIR}/ExternalPackages/stb")
    target_link_libraries(RestirGiParityValidation PRIVATE FrontierIllumination)
    if(TARGET FrontierIlluminationShaders)
        add_dependencies(RestirGiParityValidation FrontierIlluminationShaders)
    endif()
endif()
