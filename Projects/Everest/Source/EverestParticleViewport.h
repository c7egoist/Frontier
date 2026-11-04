/*==========================================================================================================================================
                                                      EVERESTPARTICLEVIEWPORT.H
==========================================================================================================================================*/
// 🧩 The Particle editor's viewport on the editor's device: the GPU particle engine run for the plan the editor hands over, and
//    the readings the editor shows (census per effect, probe, wind lattice).

#pragma once

#include "Frontier/Engine/Interface/ParticleEditor/ParticleViewportPresentation.h"
#include "Frontier/Engine/Rendering/ParticleSimulation/ParticleSimulationSequence.h"

#include <filesystem>
#include <memory>
#include <string>

namespace Everest
{

// 📝 The image as the host sees it: the view to register with the interface renderer (GENERAL layout) and what the editor reads.
struct ParticleViewportOutcome
{
    VkImageView                     View = VK_NULL_HANDLE;
    Frontier::ParticleViewportImage Image{};
};

class EverestParticleViewport
{
  public:
    // 📝 HostDevice: the editor's Vulkan device, borrowed; null runs the engine on an own device (the loader or
    //    FRONTIER_VULKAN_DRIVER), as the captures do.
    EverestParticleViewport(std::filesystem::path ShaderRoot, const Frontier::VulkanDeviceAccess* HostDevice);
    ~EverestParticleViewport();

    EverestParticleViewport(const EverestParticleViewport&)            = delete;
    EverestParticleViewport& operator=(const EverestParticleViewport&) = delete;

    ParticleViewportOutcome Render(const Frontier::ParticleViewportRequest& Request);

    [[nodiscard]] Frontier::ParticleSimulation::ParticleSimulationSequence* AccessSequence() noexcept { return Sequence_.get(); }

  private:
    std::filesystem::path                                                     ShaderRoot_;
    bool                                                                      HostDeviceAttached_ = false;
    Frontier::VulkanDeviceAccess                                              Device_{};
    std::unique_ptr<Frontier::ParticleSimulation::ParticleSimulationSequence> Sequence_{};
    bool                                                                      Constructed_ = false;
    std::string                                                               Failure_{};
};

} // namespace Everest
