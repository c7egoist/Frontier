# ===========================================================================================================================================
#                                              BUILDSHAREDTOPOLOGYPROOF.PS1
# ===========================================================================================================================================
# 📦 Builds and runs the shared-topology visual proof with MSVC, the primary toolchain.
#
# The g++ equivalent is in Docs/SharedTopology.md; both must list the same four translation units, so a source
#    added to one has to be added to the other.
#
#   .\VisualProof\SharedTopology\BuildSharedTopologyProof.ps1              build and run
#   .\VisualProof\SharedTopology\BuildSharedTopologyProof.ps1 -NoRun       build only
#
# Exits non-zero when the proof fails a check, so it can gate a commit.

[CmdletBinding()]
param(
    [switch] $NoRun,
    [string] $Engine = "$PSScriptRoot\..\..\_AgentScratch\Frontier"
)

$ErrorActionPreference = 'Stop'

$Root   = Resolve-Path "$PSScriptRoot\..\.."
$Output = Join-Path $Root '_AgentScratch\build\topology'
New-Item -ItemType Directory -Force -Path $Output | Out-Null

if (-not (Test-Path $Engine))
{
    Write-Error "Engine checkout not found at '$Engine'. Pass -Engine <path> or run Exhibits\Workbench\FrontierMirror\EngineCheckout.py first."
}
$Engine = (Resolve-Path $Engine).Path

# The four translation units the proof needs: the feature itself, the mesh container it reads, the vector helpers
#    SceneStructure calls, and the material table Finalise folds.
$Sources = @(
    (Join-Path $PSScriptRoot 'SharedTopologyProof.cpp'),
    (Join-Path $Engine 'Engine\GeometricRaster\SceneStructure.cpp'),
    (Join-Path $Engine 'Engine\GeometricRaster\GeometryStructure.cpp'),
    (Join-Path $Engine 'Engine\DeviceExchange\OrientationClassifier.cpp'),
    (Join-Path $Engine 'Engine\ContentInterchange\MaterialIndex.cpp')
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

# /MD and SLATE_DEBUG are the project's standing choices; the proof is release-optimised because the 400-placement
#    case is the point of it and a debug build makes that table slow enough to discourage running it.
$Arguments = @('/nologo', '/std:c++20', '/EHsc', '/O2', '/MD', '/W3', '/wd4324', '/DSLATE_DEBUG') `
           + $Includes + $Sources `
           + @("/Fo:$Output\", "/Fe:$Output\SharedTopologyProof.exe")

Write-Host 'Building SharedTopologyProof (MSVC) ...'
& cl.exe @Arguments
if ($LASTEXITCODE -ne 0) { Write-Error "cl.exe failed with exit code $LASTEXITCODE" }

if ($NoRun) { Write-Host "Built: $Output\SharedTopologyProof.exe"; exit 0 }

# Run from the repository root: the proof writes its transcript to VisualProof\SharedTopology\.
Push-Location $Root
try
{
    & "$Output\SharedTopologyProof.exe"
    $Result = $LASTEXITCODE
}
finally
{
    Pop-Location
}

if ($Result -ne 0) { Write-Error 'SharedTopologyProof FAILED a check.' }
Write-Host 'SharedTopologyProof passed.'
exit 0
