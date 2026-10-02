//============================================================================================================================================
//                                            BAKESHADERBALLDISTANCEFIELD.CPP
//============================================================================================================================================
// 📦 Bakes the high-poly ShaderBall mesh asset into a 3D Signed Distance Field container.

#include "GeometricRaster/DistanceFieldBakeSolver.h"
#include <iostream>
#include <chrono>

int main(int argc, char* argv[])
{
    std::string MeshPath   = "Exhibits/Assets/ShaderBall/ShaderBall.mesh";
    std::string OutputPath = "Exhibits/Assets/ShaderBall/ShaderBall.sdf";

    if (argc >= 2) MeshPath = argv[1];
    if (argc >= 3) OutputPath = argv[2];

    std::cout << "================================================================================\n";
    std::cout << " SHADERBALL SIGNED DISTANCE FIELD BAKE\n";
    std::cout << "================================================================================\n";
    std::cout << "Input mesh:  " << MeshPath << "\n";
    std::cout << "Output SDF:  " << OutputPath << "\n";

    Frontier::DistanceFieldBakeSpecification Spec{};
    Spec.ResolutionX     = 64u;
    Spec.ResolutionY     = 64u;
    Spec.ResolutionZ     = 64u;
    Spec.BoundaryPadding = 0.08f;
    Spec.SpatialBinCount = 32u;

    auto StartTime = std::chrono::high_resolution_clock::now();

    std::string Error;
    if (!Frontier::DistanceFieldBakeSolver::BakeShaderBall(MeshPath, OutputPath, Spec, &Error))
    {
        std::cerr << "FAILED: " << Error << "\n";
        return 1;
    }

    auto EndTime = std::chrono::high_resolution_clock::now();
    double ElapsedSeconds = std::chrono::duration<double>(EndTime - StartTime).count();

    std::cout << "Bake completed in " << ElapsedSeconds << " seconds.\n";
    std::cout << "Wrote " << OutputPath << "\n";
    std::cout << "================================================================================\n";
    return 0;
}
