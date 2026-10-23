#============================================================================================================================================
#                                                           PREPAREJOLT.PY
#============================================================================================================================================
# 🧩 Restore the pinned native Jolt Physics source into ignored ExternalPackages/.

from pathlib import Path
import hashlib
import io
import json
import shutil
import sys
import tarfile
import urllib.request

RepositoryRoot = Path(__file__).resolve().parents[1]


def Main():
    VerifyOnly = '--verify' in sys.argv[1:]
    Manifest = json.loads((RepositoryRoot / 'Automation/JoltDependencies.json').read_text())
    Destination = RepositoryRoot / 'ExternalPackages' / Manifest['package']
    Stamp = Destination / '.frontier-revision'
    if Stamp.exists() and Stamp.read_text().strip() == Manifest['revision']:
        print('Pinned dependency present:', Manifest['package'], Manifest['version'])
        return 0
    if VerifyOnly:
        raise RuntimeError('Jolt source is not prepared; run python Automation/PrepareJolt.py')
    if Destination.exists():
        raise RuntimeError('Unmanaged dependency directory; preserve or move it first: ' + str(Destination))

    print('Downloading pinned dependency:', Manifest['package'], Manifest['version'])
    with urllib.request.urlopen(Manifest['url'], timeout=120) as Response:
        ArchiveBytes = Response.read()
    if hashlib.sha256(ArchiveBytes).hexdigest() != Manifest['sha256']:
        raise RuntimeError('Archive checksum mismatch: ' + Manifest['package'])

    Staging = RepositoryRoot / '_ClaudeScratch/tmp' / (Manifest['package'] + '-download')
    if Staging.exists():
        shutil.rmtree(Staging)
    Staging.mkdir(parents=True)
    try:
        with tarfile.open(fileobj=io.BytesIO(ArchiveBytes), mode='r:gz') as Archive:
            for Member in Archive.getmembers():
                Relative = Path(*Path(Member.name).parts[1:])
                if not Relative.parts:
                    continue
                Output = Staging / Relative
                if not Output.resolve().is_relative_to(Staging.resolve()) or not (Member.isfile() or Member.isdir()):
                    raise RuntimeError('Unsafe archive member: ' + Member.name)
                if Member.isdir():
                    Output.mkdir(parents=True, exist_ok=True)
                else:
                    Output.parent.mkdir(parents=True, exist_ok=True)
                    with Archive.extractfile(Member) as Source, Output.open('wb') as Target:
                        shutil.copyfileobj(Source, Target)
        (Staging / '.frontier-revision').write_text(Manifest['revision'] + '\n')
        Destination.parent.mkdir(parents=True, exist_ok=True)
        Staging.rename(Destination)
    finally:
        if Staging.exists():
            shutil.rmtree(Staging)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(Main())
    except (OSError, RuntimeError) as Error:
        print('Jolt setup failed:', Error, file=sys.stderr)
        sys.exit(1)
