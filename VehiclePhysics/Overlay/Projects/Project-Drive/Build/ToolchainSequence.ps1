# Frontier/Projects/Project-Drive/Build/ToolchainSequence.ps1
#   Builds (and optionally runs) the Project-Drive headless CPU references with cl.exe directly.
#   Compatible with Windows PowerShell 5.1 and PowerShell 7+.
#
#   Two standalone tools are produced:
#       DriveTelemetry.exe   real C++ vehicle physics run over DriveCourse -> Diagnostics\telemetry.csv, timing.log, run.log
#       SurfelReference.exe  CPU surfel GI over the drive scene           -> Diagnostics\drive_gi.ppm, surfel_timing.log
#
#   These tools link ONLY the vehicle physics sources plus Project-Drive\Source. They do NOT need Vulkan, Jolt,
#   ImGui or GLFW - that is the windowed product app, which is built by Project-Zero's ToolchainSequence.ps1
#   (or the top-level CMake `linux-app` preset). Keeping these headless makes them buildable and runnable in CI.
#
#     powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1
#     powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Configuration Debug
#     powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Rebuild
#     powershell -File Projects\Project-Drive\Build\ToolchainSequence.ps1 -Run:$false   # build only, do not execute

[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')] [string] $Configuration = 'Release',
    [switch] $Rebuild,
    [switch] $Run = $true
)

$ErrorActionPreference = 'Stop'

#---
#                                          REPOSITORY LAYOUT
#---

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$EngineRoot     = Join-Path $RepositoryRoot 'Engine'
$ProjectRoot    = Join-Path $RepositoryRoot 'Projects\Project-Drive'
$SourceRoot     = Join-Path $ProjectRoot    'Source'
$VehicleRoot    = Join-Path $EngineRoot     'PhysicalDynamics\Vehicle'
$OutputRoot     = Join-Path $ProjectRoot    "Build\Output\Windows\$Configuration"
$ObjectRoot     = Join-Path $OutputRoot     'obj'
$DiagnosticsRoot = Join-Path $ProjectRoot   'Diagnostics'

#---
#                                          CONSOLE REPORTING
#---

function Write-Report
{
    param([string] $Tag, [System.ConsoleColor] $Colour, [string] $Message)
    Write-Host ("[$Tag]".PadRight(10)) -ForegroundColor $Colour -NoNewline
    Write-Host " $Message"
}

function Write-Building([string] $Message) { Write-Report -Tag 'Build'    -Colour DarkGray -Message $Message }
function Write-Skipped([string]  $Message) { Write-Report -Tag 'SKIP'     -Colour Cyan     -Message $Message }
function Write-Rejected([string] $Message) { Write-Report -Tag 'FAILED'   -Colour Red      -Message $Message }
function Write-Produced([string] $Message) { Write-Report -Tag 'Compiled' -Colour Green    -Message $Message }
function Write-Ran([string]      $Message) { Write-Report -Tag 'Run'      -Colour Yellow   -Message $Message }

#---
#                                        TOOLCHAIN ENVIRONMENT
#   Import the MSVC x64 environment from vcvarsall.bat exactly once, so cl.exe / link.exe are on PATH.
#---

function Import-ToolchainEnvironment
{
    if (Get-Command cl.exe -ErrorAction SilentlyContinue)
    {
        Write-Skipped 'toolchain already on PATH'
        return
    }

    $Candidates = @(
        'C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvarsall.bat'
        'C:\Program Files\Microsoft Visual Studio\18\Professional\VC\Auxiliary\Build\vcvarsall.bat'
        'C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Auxiliary\Build\vcvarsall.bat'
        'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat'
        'C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat'
        'C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvarsall.bat'
        'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat'
    )

    $Selected = $null
    foreach ($Candidate in $Candidates)
    {
        if (Test-Path $Candidate)
        {
            $Selected = $Candidate
            break
        }
    }

    if ($null -eq $Selected)
    {
        throw 'no vcvarsall.bat was found; the C++ toolchain is not installed where this script looks'
    }

    Write-Building "toolchain $Selected"

    $Captured = cmd.exe /c "`"$Selected`" x64 > nul & set"
    foreach ($Line in $Captured)
    {
        if ($Line -match '^([^=]+)=(.*)$')
        {
            Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] -ErrorAction SilentlyContinue
        }
    }

    if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue))
    {
        throw 'vcvarsall.bat ran but cl.exe is still absent from PATH'
    }
}

#---
#                                          COMPILATION
#---

function Get-CompilationFlags
{
    # The headless tools use the vehicle physics headers only - a plain, portable flag set. No engine defines,
    #    no Vulkan, no editor. C++20 keeps them in lockstep with the engine standard (Frontier is /std:c++20).
    $Flags = @(
        '/nologo'
        '/EHsc'
        '/std:c++20'
        '/permissive-'
        '/Zc:__cplusplus'
        '/fp:precise'
        '/utf-8'
        '/W3'
        '/D_CRT_SECURE_NO_WARNINGS'   # the tools use std::fopen for CSV / PPM output; C4996 deprecation noise otherwise
        '/DNOMINMAX'
    )
    if ($Configuration -eq 'Debug')
    {
        return $Flags + @('/Od', '/Zi', '/MDd', '/DFRONTIER_DEBUG=1')
    }
    return $Flags + @('/O2', '/MD', '/DNDEBUG')
}

function Build-Executable
{
    param(
        [string]   $Label,
        [string[]] $Sources,
        [string[]] $IncludePaths,
        [string]   $OutputExe
    )

    if ((-not $Rebuild) -and (Test-Path $OutputExe))
    {
        $ExeTime    = (Get-Item $OutputExe).LastWriteTimeUtc
        $NewestSrc  = ($Sources | ForEach-Object { (Get-Item $_).LastWriteTimeUtc } | Sort-Object -Descending | Select-Object -First 1)
        if ($NewestSrc -lt $ExeTime)
        {
            Write-Skipped "$Label up to date"
            return
        }
    }

    New-Item -ItemType Directory -Force -Path $ObjectRoot | Out-Null

    $Flags    = Get-CompilationFlags
    $Includes = $IncludePaths | ForEach-Object { "/I$_" }

    # A plain array splats reliably with @Arguments; a generic List does not.
    $Arguments  = @()
    $Arguments += $Flags
    $Arguments += $Includes
    $Arguments += $Sources
    $Arguments += ('/Fe' + $OutputExe)
    $Arguments += ('/Fo' + $ObjectRoot + '\')

    Write-Building ("{0} - {1} translation unit(s)" -f $Label, $Sources.Count)

    $Diagnostics = & cl.exe @Arguments 2>&1
    if ($LASTEXITCODE -ne 0)
    {
        $Diagnostics | ForEach-Object { Write-Host "    $_" }
        Write-Rejected "$Label - cl.exe rejected the build"
        throw "$Label - cl.exe rejected the build"
    }

    $Notable = $Diagnostics | Where-Object { $_ -match ': (warning|error) [A-Z]' }
    if ($Notable) { $Notable | ForEach-Object { Write-Host "    $_" } }

    Write-Produced $OutputExe
}

#---
#                                             BUILD
#---

Import-ToolchainEnvironment

if ($Rebuild -and (Test-Path $OutputRoot))
{
    Write-Building "clean $OutputRoot"
    Remove-Item -Recurse -Force $OutputRoot
}

New-Item -ItemType Directory -Force -Path $OutputRoot      | Out-Null
New-Item -ItemType Directory -Force -Path $DiagnosticsRoot | Out-Null

# DriveTelemetry links the real vehicle physics: controller + geometry + aero + tyre + drivetrain.
$VehicleSources = @(
    (Join-Path $VehicleRoot 'VehicleController.cpp')
    (Join-Path $VehicleRoot 'VehicleGeometry.cpp')
    (Join-Path $VehicleRoot 'Aerodynamics.cpp')
    (Join-Path $VehicleRoot 'XPBDSoftTyre.cpp')
    (Join-Path $VehicleRoot 'PacejkaTyreModel.cpp')
    (Join-Path $VehicleRoot 'TyreSlipDynamics.cpp')
    (Join-Path $VehicleRoot 'Drivetrain.cpp')
)

$CommonIncludes = @($VehicleRoot, $SourceRoot)

$TelemetrySources = @((Join-Path $SourceRoot 'DriveTelemetry.cpp')) + $VehicleSources
Build-Executable @{
    Label        = 'DriveTelemetry'
    Sources      = $TelemetrySources
    IncludePaths = $CommonIncludes
    OutputExe    = (Join-Path $OutputRoot 'DriveTelemetry.exe')
}

# SurfelReference is a single translation unit (it #includes DriveCourse.h and ControlVehicleMesh.inl).
Build-Executable @{
    Label        = 'SurfelReference'
    Sources      = @((Join-Path $SourceRoot 'SurfelReference.cpp'))
    IncludePaths = $CommonIncludes
    OutputExe    = (Join-Path $OutputRoot 'SurfelReference.exe')
}

#---
#                                             RUN
#---

if ($Run)
{
    $TelemetryExe = Join-Path $OutputRoot 'DriveTelemetry.exe'
    $SurfelExe    = Join-Path $OutputRoot 'SurfelReference.exe'

    Write-Ran "DriveTelemetry -> $DiagnosticsRoot"
    & $TelemetryExe $DiagnosticsRoot
    if ($LASTEXITCODE -ne 0) { throw "DriveTelemetry.exe exited with code $LASTEXITCODE" }

    Write-Ran "SurfelReference -> $DiagnosticsRoot"
    & $SurfelExe --out $DiagnosticsRoot
    if ($LASTEXITCODE -ne 0) { throw "SurfelReference.exe exited with code $LASTEXITCODE" }

    Write-Produced "Diagnostics written to $DiagnosticsRoot"
}
