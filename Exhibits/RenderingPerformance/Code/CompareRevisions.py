#============================================================================================================================================
#                                                    COMPAREREVISIONS.PY
#============================================================================================================================================
# 🧩 Builds both revisions against the same fixtures, compares TLAS bytes and measures the focused workloads.

from pathlib import Path
import argparse
import hashlib
import os
import platform
import re
import statistics
import subprocess
import sys

Root = Path(__file__).resolve().parents[3]
Scratch = Root / '_ClaudeScratch/RenderingPerformance/Revisions'
Scene = Root / 'EngineContent/EnvironmentArchives/ProvingGround/ProvingGround.facetspace'
BaselinePaths = [
    'Frontier/Engine/DeviceExchange/DeviceExchange.cpp',
    'Frontier/Engine/DeviceExchange/DeviceExchange.h',
    'Frontier/Engine/Rendering/GlobalIllumination/RayTracingSpace.cpp',
    'Frontier/Engine/Rendering/GlobalIllumination/RayTracingSpace.h',
]


def Execute(Command, Environment=None):
    Result = subprocess.run([str(Part) for Part in Command], cwd=Root, env=Environment, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if Result.returncode:
        print('FAILED:', ' '.join(str(Part) for Part in Command), '\n', Result.stdout, file=sys.stderr)
        raise RuntimeError('command returned ' + str(Result.returncode))
    return Result.stdout


def Compile(Baseline):
    Directory = Scratch / 'BaselineSources' if Baseline else Root
    Includes = []
    if Baseline:
        Includes += ['-I' + str(Directory), '-I' + str(Directory / 'Frontier/Engine')]
    Includes += ['-I.', '-IFrontier/Engine', '-IFrontier/Engine/DeviceExchange',
                 '-IFrontier/Engine/Rendering/GlobalIllumination', '-IExternalPackages/vulkan-headers/include']
    Prefix = ['g++', '-std=c++20', '-O3', '-DNDEBUG'] + Includes
    Device = Directory / BaselinePaths[0]
    Ray = Directory / BaselinePaths[2]
    Label = 'Baseline' if Baseline else 'Current'
    DeviceExecutable = Scratch / ('Device' + Label)
    RayExecutable = Scratch / ('Ray' + Label)
    Execute(Prefix + ['Exhibits/RenderingPerformance/Code/DeviceSubmissionValidation.cpp', Device,
                      '-ldl', '-pthread', '-o', DeviceExecutable])
    Execute(Prefix + ['Exhibits/RenderingPerformance/Code/RayTracingRefreshValidation.cpp', Ray,
                      'Frontier/Engine/Rendering/GlobalIllumination/SceneStructure.cpp',
                      'Frontier/Engine/Rendering/GlobalIllumination/TransformProjection.cpp', Device,
                      '-ldl', '-pthread', '-o', RayExecutable])
    return DeviceExecutable, RayExecutable


def MedianFrom(Output, Pattern):
    Match = re.search(Pattern, Output)
    if Match is None:
        raise RuntimeError('measurement missing from output: ' + Output)
    return float(Match.group(1))


def Main():
    Parser = argparse.ArgumentParser()
    Parser.add_argument('--baseline', default='7dee22cc8a09243e50daedde114a82f203d50d88')
    Parser.add_argument('--pairs', type=int, default=3)
    Arguments = Parser.parse_args()
    if Arguments.pairs < 1:
        raise ValueError('--pairs must be positive')
    Scratch.mkdir(parents=True, exist_ok=True)
    for Relative in BaselinePaths:
        Result = subprocess.run(['git', 'show', Arguments.baseline + ':' + Relative], cwd=Root, check=True, stdout=subprocess.PIPE)
        Destination = Scratch / 'BaselineSources' / Relative
        Destination.parent.mkdir(parents=True, exist_ok=True)
        Destination.write_bytes(Result.stdout)
    OldDevice, OldRay = Compile(True)
    NewDevice, NewRay = Compile(False)
    Environment = os.environ.copy()
    SwiftShader = Root / 'ExternalPackages/VulkanCompute/SwiftShader'
    Environment.setdefault('FRONTIER_VULKAN_DRIVER', str(SwiftShader / 'libvulkan.so.1'))
    Environment.setdefault('VK_ICD_FILENAMES', str(SwiftShader / 'vk_swiftshader_icd.json'))
    Environment.setdefault('LD_LIBRARY_PATH', str(SwiftShader))
    print('Baseline:', Arguments.baseline)
    print('Platform:', platform.platform())
    print('Compiler:', Execute(['g++', '--version']).splitlines()[0], '-std=c++20 -O3 -DNDEBUG')
    print('Vulkan driver:', Environment['FRONTIER_VULKAN_DRIVER'])
    print(Execute([OldDevice], Environment), end='')
    print(Execute([NewDevice, '--expect-batched'], Environment), end='')
    print(Execute([NewDevice, '--large'], Environment), end='')
    print(Execute([NewRay, Scene, '--vulkan'], Environment), end='')
    OldSnapshot, NewSnapshot = Scratch / 'Baseline.bin', Scratch / 'Current.bin'
    OldChecks = Execute([OldRay, Scene, OldSnapshot])
    NewChecks = Execute([NewRay, Scene, NewSnapshot])
    OldBytes, NewBytes = OldSnapshot.read_bytes(), NewSnapshot.read_bytes()
    if OldBytes != NewBytes:
        raise RuntimeError('TLAS snapshots differ from the baseline')
    print('TLAS snapshots:', OldChecks.count('[PASS]'), 'baseline and', NewChecks.count('[PASS]'),
          'current cases; identical', len(OldBytes), 'bytes; SHA-256', hashlib.sha256(OldBytes).hexdigest())
    Samples = {'submission': [[], []], 'unchanged': [[], []], 'moving': [[], []]}
    for Pair in range(Arguments.pairs):
        for Variant in ([0, 1] if Pair % 2 == 0 else [1, 0]):
            Submission = Execute([[OldDevice, NewDevice][Variant], '--benchmark'], Environment)
            Refresh = Execute([[OldRay, NewRay][Variant], Scene, '--benchmark'])
            Samples['submission'][Variant].append(MedianFrom(Submission, r'median ([0-9.]+) ms/iteration'))
            Samples['unchanged'][Variant].append(MedianFrom(Refresh, r'unchanged scene: median ([0-9.]+)'))
            Samples['moving'][Variant].append(MedianFrom(Refresh, r'moving occupant: median ([0-9.]+)'))
    print('Measurements: medians of', Arguments.pairs, 'alternating process pairs, 7 timed rounds each')
    for Label, Pair in Samples.items():
        Old, New = statistics.median(Pair[0]), statistics.median(Pair[1])
        print(f'{Label}: baseline={Old:.6f} ms, current={New:.6f} ms, ratio={Old / New:.2f}x')
        print('  baseline samples:', ', '.join(f'{Sample:.6f}' for Sample in Pair[0]))
        print('  current samples: ', ', '.join(f'{Sample:.6f}' for Sample in Pair[1]))
    print('Each submission round: 500 x 16 KiB upload + copy, including the fence wait.')
    print('Each TLAS round: 200 host refreshes, ProvingGround, 2,094 occupants.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(Main())
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as Error:
        print('Comparison failed:', Error, file=sys.stderr)
        sys.exit(1)
