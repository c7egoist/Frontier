#============================================================================================================================================
#                                                   PARTICLESIMULATIONRENDERING.CMAKE
#============================================================================================================================================
# 🧩 The Particle editor's GPU engine: the Slang units ported from the eos shaders (archive set ParticleSimulation), compiled one
#    SPIR-V file per entry point.

# 📝 The units include the illumination port's intrinsics (IntrinsicParity.slang), so they compile with the same pinned compiler;
#    without it the editor uses EngineContent/ShaderArchives/ParticleSimulation.
find_program(FRONTIER_GLOBAL_ILLUMINATION_SLANGC
    NAMES slangc
    PATHS "${CMAKE_SOURCE_DIR}/ExternalPackages/VulkanCompute/Slang/slangtorch/bin"
    NO_DEFAULT_PATH)
set(FRONTIER_PARTICLE_SIMULATION_SHADER_SRC "${CMAKE_SOURCE_DIR}/Frontier/Engine/Shaders/ParticleSimulation")
set(FRONTIER_PARTICLE_SIMULATION_SHADER_OUT "${CMAKE_BINARY_DIR}/ShaderArchives/ParticleSimulation")
file(GLOB FRONTIER_PARTICLE_SIMULATION_SLANG_SOURCES CONFIGURE_DEPENDS "${FRONTIER_PARTICLE_SIMULATION_SHADER_SRC}/*.slang"
     "${CMAKE_SOURCE_DIR}/Frontier/Engine/Shaders/GlobalIllumination/IntrinsicParity.slang")

# Unit:Entry:Stage — one SPIR-V file per entry point, <Unit>.<Entry>.spv.
set(FRONTIER_PARTICLE_SIMULATION_ENTRIES
    "ParticleSimulation:ReleaseParticles:compute"
    "ParticleSimulation:AdvanceParticles:compute"
    "ParticleSimulation:ClearCensus:compute"
    "ParticleSimulation:GatherCensus:compute"
    "ParticleSimulation:ClearMolecularCells:compute"
    "ParticleSimulation:InsertMolecularCells:compute"
    "ParticleSimulation:AdvanceSwarm:compute"
    "ParticleSimulation:AdvanceMolecules:compute"
    "WindLattice:ConstructWindLattice:compute"
    "ParticleRasterization:ParticleVertex:vertex"
    "ParticleRasterization:ParticleFragment:fragment"
    "ParticleRasterization:CubeVertex:vertex"
    "ParticleRasterization:ShardVertex:vertex"
    "ParticleRasterization:CubeFragment:fragment"
    "ParticleRasterization:ButterflyVertex:vertex"
    "ParticleRasterization:ButterflyFragment:fragment"
    "ParticleRasterization:LightningVertex:vertex"
    "ParticleRasterization:LightningFragment:fragment"
    "ParticleRasterization:WindArrowVertex:vertex"
    "ParticleRasterization:WindArrowFragment:fragment"
    "ParticleRasterization:FloorVertex:vertex"
    "ParticleRasterization:FloorFragment:fragment"
    "ParticleRasterization:GuideVertex:vertex"
    "ParticleRasterization:GuideFragment:fragment"
    "LightFibreRasterization:FibreVertex:vertex"
    "LightFibreRasterization:FibreFragment:fragment"
    "LightFibreRasterization:FibreSparkVertex:vertex"
    "LightFibreRasterization:FibreSparkFragment:fragment"
    "LensingRasterization:LensingVertex:vertex"
    "LensingRasterization:LensingFragment:fragment")

set(FRONTIER_PARTICLE_SIMULATION_SPV_OUTPUTS)
if(FRONTIER_GLOBAL_ILLUMINATION_SLANGC)
    foreach(ENTRY_SPEC IN LISTS FRONTIER_PARTICLE_SIMULATION_ENTRIES)
        string(REPLACE ":" ";" ENTRY_PARTS "${ENTRY_SPEC}")
        list(GET ENTRY_PARTS 0 ENTRY_UNIT)
        list(GET ENTRY_PARTS 1 ENTRY_NAME)
        list(GET ENTRY_PARTS 2 ENTRY_STAGE)
        set(ENTRY_SPV "${FRONTIER_PARTICLE_SIMULATION_SHADER_OUT}/${ENTRY_UNIT}.${ENTRY_NAME}.spv")
        list(APPEND FRONTIER_PARTICLE_SIMULATION_SPV_OUTPUTS "${ENTRY_SPV}")
        add_custom_command(
            OUTPUT "${ENTRY_SPV}"
            COMMAND "${CMAKE_COMMAND}" -E make_directory "${FRONTIER_PARTICLE_SIMULATION_SHADER_OUT}"
            COMMAND "${FRONTIER_GLOBAL_ILLUMINATION_SLANGC}" "${FRONTIER_PARTICLE_SIMULATION_SHADER_SRC}/${ENTRY_UNIT}.slang"
                -I "${FRONTIER_PARTICLE_SIMULATION_SHADER_SRC}"
                -I "${CMAKE_SOURCE_DIR}/Frontier/Engine/Shaders/GlobalIllumination"
                -entry "${ENTRY_NAME}"
                -stage "${ENTRY_STAGE}"
                -target spirv
                -profile spirv_1_3
                -emit-spirv-directly
                -matrix-layout-row-major
                -fvk-use-entrypoint-name
                -O0
                -o "${ENTRY_SPV}"
            DEPENDS ${FRONTIER_PARTICLE_SIMULATION_SLANG_SOURCES}
            VERBATIM)
    endforeach()
    add_custom_target(FrontierParticleSimulationShaders ALL DEPENDS ${FRONTIER_PARTICLE_SIMULATION_SPV_OUTPUTS})
endif()
