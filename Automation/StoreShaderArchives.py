#============================================================================================================================================
#                                                       STORESHADERARCHIVES.PY
#============================================================================================================================================
# 🧩 Keeps the Scene Viewport's compiled SPIR-V in EngineContent/ShaderArchives, so an editor build without the pinned Slang compiler
#    still runs the viewport: `--build <dir>` stores the archives a build compiled, `--verify` checks the stored archives against
#    the current Slang sources (and against the build's archives when that build compiled them).

from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys

RepositoryRoot = Path(__file__).resolve().parents[1]
StoredRoot     = RepositoryRoot / 'EngineContent/ShaderArchives'

# 📝 Folder of each set's Slang units, and the units its entries compile (None: every unit of the folder).
ArchiveSets = {
    'GlobalIllumination': ('Frontier/Engine/Shaders/GlobalIllumination', None),
    'Environment': ('Frontier/Engine/Shaders', ['AtmosphereScattering', 'AtmosphereProjection', 'VisibilityProjection',
                                                 'PlanetaryProjection', 'CloudShadowProjection', 'VolumetricClouds', 'FogSpace',
                                                 'OpticalLensFlare', 'PreviewRaster']),
}
IncludePattern = re.compile(r'^\s*(?:#include\s+"([^"]+)"|import\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;)', re.MULTILINE)


def Digest(Filename):
    return hashlib.sha256(Filename.read_bytes()).hexdigest()


def ResolveSources(Set):
    Folder, Units = ArchiveSets[Set]
    Folder = RepositoryRoot / Folder
    if Units is None:
        return sorted(Folder.glob('*.slang'))
    # 📝 The include/import closure of the compiled units.
    Pending, Found = [Folder / (Unit + '.slang') for Unit in Units], set()
    while Pending:
        Unit = Pending.pop()
        if Unit in Found or not Unit.is_file():
            continue
        Found.add(Unit)
        for Included, Imported in IncludePattern.findall(Unit.read_text(encoding='utf-8')):
            Pending.append(Folder / (Included if Included else Imported.replace('.', '/') + '.slang'))
    return sorted(Found)


def DescribeCompiler(Compiler):
    if not Compiler:
        return 'unrecorded'
    Version = subprocess.run([Compiler, '-version'], capture_output=True, text=True)
    return 'slangc ' + (Version.stdout + Version.stderr).strip()


def Store(Set, Build, Compiler):
    Compiled = Build / 'ShaderArchives' / Set
    Binaries = sorted(Compiled.glob('*.spv'))
    if not Binaries:
        raise SystemExit(f'{Set}: no SPIR-V in {Compiled} (build the shader targets with the pinned slangc first)')
    Target = StoredRoot / Set
    Target.mkdir(parents=True, exist_ok=True)
    for Stale in Target.glob('*.spv'):
        Stale.unlink()
    for Binary in Binaries:
        shutil.copy2(Binary, Target / Binary.name)
    Manifest = {
        'format': 1,
        'set': Set,
        'compiler': DescribeCompiler(Compiler),
        'refresh': 'python Automation/StoreShaderArchives.py --build <build> --compiler <slangc>',
        'entries': [{'file': Binary.name, 'spirv_sha256': Digest(Binary)} for Binary in Binaries],
        'sources': [{'file': Source.relative_to(RepositoryRoot).as_posix(), 'sha256': Digest(Source)} for Source in ResolveSources(Set)],
    }
    (Target / 'ShaderCompilation.json').write_text(json.dumps(Manifest, indent=2) + '\n', encoding='utf-8')
    print(f'{Set}: stored {len(Binaries)} SPIR-V archives from {len(Manifest["sources"])} Slang sources')


def Verify(Set, Build):
    Failures = []
    Target   = StoredRoot / Set
    Manifest = json.loads((Target / 'ShaderCompilation.json').read_text(encoding='utf-8'))
    Recorded = {Entry['file']: Entry['sha256'] for Entry in Manifest['sources']}
    Current  = {Source.relative_to(RepositoryRoot).as_posix(): Digest(Source) for Source in ResolveSources(Set)}
    for File in sorted(set(Recorded) | set(Current)):
        if Recorded.get(File) != Current.get(File):
            Failures.append(f'source changed since the archives were stored: {File}')
    for Entry in Manifest['entries']:
        Stored = Target / Entry['file']
        Payload = Stored.read_bytes() if Stored.is_file() else b''
        if len(Payload) < 20 or len(Payload) % 4 or int.from_bytes(Payload[:4], 'little') != 0x07230203:
            Failures.append(f'malformed stored SPIR-V: {Entry["file"]}')
        elif Digest(Stored) != Entry['spirv_sha256']:
            Failures.append(f'stored SPIR-V differs from its manifest: {Entry["file"]}')
    if Build is not None:
        Compiled = {Binary.name: Digest(Binary) for Binary in (Build / 'ShaderArchives' / Set).glob('*.spv')}
        Kept     = {Entry['file']: Entry['spirv_sha256'] for Entry in Manifest['entries']}
        for File in sorted(set(Compiled) | set(Kept)):
            if Compiled.get(File) != Kept.get(File):
                Failures.append(f'compiled and stored SPIR-V differ: {File}')
    for Failure in Failures:
        print(f'[FAIL] {Set}: {Failure}')
    print(f'{Set}: {len(Manifest["entries"])} stored archives, {len(Current)} sources, {len(Failures)} failures')
    return not Failures


def Main():
    Parser = argparse.ArgumentParser()
    Parser.add_argument('--build', type=Path, help='build folder whose ShaderArchives/<Set> holds freshly compiled SPIR-V')
    Parser.add_argument('--compiler', default='', help='the slangc that compiled them (recorded in ShaderCompilation.json)')
    Parser.add_argument('--sets', nargs='+', default=list(ArchiveSets), choices=list(ArchiveSets))
    Parser.add_argument('--verify', action='store_true', help='check instead of store; --build adds the compiled-vs-stored check')
    Arguments = Parser.parse_args()
    if Arguments.verify:
        Results = [Verify(Set, Arguments.build.resolve() if Arguments.build else None) for Set in Arguments.sets]
        if not all(Results):
            print('Refresh: python Automation/StoreShaderArchives.py --build <build> --compiler <slangc>')
            sys.exit(1)
        return
    if Arguments.build is None:
        Parser.error('--build is required to store archives')
    for Set in Arguments.sets:
        Store(Set, Arguments.build.resolve(), Arguments.compiler)


if __name__ == '__main__':
    Main()
