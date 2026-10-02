# ===========================================================================================================================================
#                                             BUILDDISTANCEFIELDGIPROOF.PS1
# ===========================================================================================================================================
# 📦 Builds and runs the Distance Field Global Illumination visual proof.
#
# Primary MSVC build script, with g++ equivalent documented in Docs/DistanceFieldGlobalIllumination.md.
#
#   .\VisualProof\DistanceFieldGI\BuildDistanceFieldGIProof.ps1              build and run
#   .\VisualProof\DistanceFieldGI\BuildDistanceFieldGIProof.ps1 -NoRun       build only

[CmdletBinding()]
param(
    [switch] $NoRun,
    [string] $Engine = "$PSScriptRoot\..\..\Frontier"
)

$ErrorActionPreference = 'Stop'

$Root   = Resolve-Path "$PSScriptRoot\..\.."
$Output = Join-Path $Root '_AgentScratch\build\distancefield'
New-Item -ItemType Directory -Force -Path $Output | Out-Null

$Engine = (Resolve-Path $Engine).Path

$Sources = @(
    (Join-Path $PSScriptRoot 'DistanceFieldGIProof.cpp'),
    (Join-Path $Engine 'Engine\GeometricRaster\DistanceFieldSpace.cpp'),
    (Join-Path $Engine 'Engine\GeometricRaster\GlobalDistanceFieldSpace.cpp'),
    (Join-Path $Engine 'Engine\GeometricRaster\SurfaceCacheStructure.cpp'),
    (Join-Path $Engine 'Engine\GeometricRaster\DistanceFieldBakeSolver.cpp'),
    (Join-Path $Engine 'Engine\DisplayPresentation\DistanceFieldIntegrator.cpp'),
    (Join-Path $Engine 'Engine\GeometricRaster\GeometryStructure.cpp'),
    (Join-Path $Engine 'Engine\ContentInterchange\ShaderBallGeometry.cpp'),
    (Join-Path $Engine 'Engine\DeviceExchange\OrientationClassifier.cpp')
)
foreach ($Source in $Sources)
{
    if (-not (Test-Path $Source)) { Write-Error "Missing translation unit: $Source" }
}

$Includes = @(
    "/I`"$Engine\Engine`"",
    "/I`"$Engine`"",
    "/I`"$Engine\Exhibits\Workbench\Editor\Counterparts`""
)

$Arguments = @('/nologo', '/std:c++20', '/EHsc', '/O2', '/MD', '/openmp', '/W3', '/wd4244', '/wd4305', '/wd4324',
               '/DSLATE_DEBUG', '/DFRONTIER_CPU_PORT') `
           + $Includes + $Sources `
           + @("/Fo:$Output\", "/Fe:$Output\DistanceFieldGIProof.exe")

Write-Host 'Building DistanceFieldGIProof (MSVC) ...'
& cl.exe @Arguments
if ($LASTEXITCODE -ne 0) { Write-Error "cl.exe failed with exit code $LASTEXITCODE" }

if ($NoRun) { Write-Host "Built: $Output\DistanceFieldGIProof.exe"; exit 0 }

Push-Location $Root
try
{
    & "$Output\DistanceFieldGIProof.exe"
    $Result = $LASTEXITCODE
}
finally
{
    Pop-Location
}

if ($Result -ne 0) { Write-Error 'DistanceFieldGIProof FAILED a check.' }
Write-Host 'DistanceFieldGIProof passed.'
exit 0
