# ===========================================================================================================================================
#                                               BUILDMATERIALPARITYPROOF.PS1
# ===========================================================================================================================================
# 📦 Builds and runs the material-parity visual proof with MSVC, the primary toolchain.
#
# The g++ equivalent is in Docs/MaterialParity.md; both must list the same seven translation units, so a source
#    added to one has to be added to the other.
#
#   .\VisualProof\MaterialParity\BuildMaterialParityProof.ps1              build and run
#   .\VisualProof\MaterialParity\BuildMaterialParityProof.ps1 -NoRun       build only
#
# Exits non-zero when the proof fails a check, so it can gate a commit.

[CmdletBinding()]
param(
    [switch] $NoRun,
    [string] $Engine = "$PSScriptRoot\..\..\Frontier"
)

$ErrorActionPreference = 'Stop'

$Root   = Resolve-Path "$PSScriptRoot\..\.."
$Output = Join-Path $Root '_AgentScratch\build\parity'
New-Item -ItemType Directory -Force -Path $Output | Out-Null

if (-not (Test-Path $Engine))
{
    Write-Error "Engine checkout not found at '$Engine'. Pass -Engine <path> or run Exhibits\Workbench\FrontierMirror\EngineCheckout.py first."
}
$Engine = (Resolve-Path $Engine).Path

# The seven translation units: the proof, the level it shades, the mesh asset that level places, the material
#    table, the geometry container, the vector helpers, and the LUT baker the lobe stack indexes on every
#    evaluation. SceneCodec.cpp is deliberately absent — the proof writes no glTF and stubs Encode itself.
$Sources = @(
    (Join-Path $PSScriptRoot 'MaterialParityProof.cpp'),
    (Join-Path $Engine 'Engine\ContentInterchange\ShowcaseStructure.cpp'),
    (Join-Path $Engine 'Engine\ContentInterchange\ShaderBallGeometry.cpp'),
    (Join-Path $Engine 'Engine\ContentInterchange\MaterialIndex.cpp'),
    (Join-Path $Engine 'Engine\GeometricRaster\GeometryStructure.cpp'),
    (Join-Path $Engine 'Engine\DeviceExchange\OrientationClassifier.cpp'),
    (Join-Path $Engine 'Engine\DisplayPresentation\ShadingTableCodec.cpp')
)
foreach ($Source in $Sources)
{
    if (-not (Test-Path $Source)) { Write-Error "Missing translation unit: $Source" }
}

$Includes = @(
    "/I`"$Engine\Engine`"",
    "/I`"$Engine`"",
    "/I`"$Engine\ExternalPackages\vulkan-headers\include`""
)

# FRONTIER_CPU_PORT is what lets MaterialEvaluation.slang compile as C++ through SlangCpuShim.h — without it the
#    proof would be evaluating a copy of the material model rather than the shipped text, which is the one thing
#    it must not do. /MD and SLATE_DEBUG are the project's standing choices. Release-optimised: the shot is
#    1.29 M triangles rendered six times, and a debug build makes that slow enough to discourage running it.
$Arguments = @('/nologo', '/std:c++20', '/EHsc', '/O2', '/MD', '/W3', '/wd4244', '/wd4305', '/wd4324',
               '/DSLATE_DEBUG', '/DFRONTIER_CPU_PORT') `
           + $Includes + $Sources `
           + @("/Fo:$Output\", "/Fe:$Output\MaterialParityProof.exe")

Write-Host 'Building MaterialParityProof (MSVC) ...'
& cl.exe @Arguments
if ($LASTEXITCODE -ne 0) { Write-Error "cl.exe failed with exit code $LASTEXITCODE" }

if ($NoRun) { Write-Host "Built: $Output\MaterialParityProof.exe"; exit 0 }

# Run from the repository root: the proof reads Exhibits\Assets\ShaderBall\ShaderBall.mesh and the three .slang
#    files by repository-relative path, and writes its sheet and transcript to VisualProof\MaterialParity\.
Push-Location $Root
try
{
    & "$Output\MaterialParityProof.exe"
    $Result = $LASTEXITCODE
}
finally
{
    Pop-Location
}

if ($Result -ne 0) { Write-Error 'MaterialParityProof FAILED a check.' }
Write-Host 'MaterialParityProof passed.'
exit 0
