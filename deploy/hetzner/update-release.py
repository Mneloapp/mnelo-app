"""Update the existing combined service; never bootstrap accounts or credentials.

Default --check is read-only. --deploy swaps only a verified immutable code release.
Delivery flags, Caddy, billing, review accounts and provider credentials stay intact.
"""
import argparse
import hashlib
import io
import json
import pathlib
import re
import subprocess
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
FILES = {'relay.mjs', 'check-relay.mjs', 'test-cohort.mjs', 'identity.mjs',
         'check-infobip.mjs', 'check-identity.mjs', 'configure-testers.mjs'}
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'IdentitiesOnly=yes',
       '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(ROOT / '.local/hosting/known_hosts'),
       '-i', str(pathlib.Path.home() / '.ssh/mnelo_dev_ed25519'), 'mnelo-admin@46.225.169.127']


def remote(command, data=None):
    result = subprocess.run(SSH + [command], input=data, capture_output=True, timeout=120)
    if result.returncode:
        # Remote errors are stable codes; do not echo arbitrary stderr/config.
        raise RuntimeError('UPDATE_REMOTE_STEP_FAILED')
    return result.stdout


def main():
    parser = argparse.ArgumentParser()
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--check', action='store_true')
    choice.add_argument('--deploy', action='store_true')
    args = parser.parse_args()
    operator = (ROOT / 'deploy/hetzner/update-runtime.py').read_bytes()
    if args.check:
        print(remote('sudo python3 - check', operator).decode())
        return
    manifest = json.loads((ROOT / 'artifacts/hosting/manifest.json').read_text())
    commit = manifest['sourceCommit']
    if not re.fullmatch('[a-f0-9]{40}', commit) or manifest['sourceDirty'] is not False:
        raise RuntimeError('UPDATE_CLEAN_MANIFEST_REQUIRED')
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip():
        raise RuntimeError('UPDATE_CLEAN_TREE_REQUIRED')
    if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip() != commit:
        raise RuntimeError('UPDATE_MANIFEST_COMMIT_MISMATCH')
    if set(manifest['files']) != FILES:
        raise RuntimeError('UPDATE_FILE_ALLOWLIST_FAILED')
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode='w:gz') as tar:
        for name in sorted(FILES | {'manifest.json'}):
            path = ROOT / 'artifacts/hosting' / name
            if path.is_symlink() or not path.is_file() or path.stat().st_size > 20_000_000:
                raise RuntimeError('UPDATE_FILE_INVALID')
            if name in FILES:
                meta = manifest['files'][name]
                if hashlib.sha256(path.read_bytes()).hexdigest() != meta['sha256'] or path.stat().st_size != meta['bytes']:
                    raise RuntimeError('UPDATE_FILE_DIGEST_MISMATCH')
            tar.add(path, arcname=name, recursive=False)
    remote('sudo python3 - check', operator)
    release = '/opt/mnelo/releases/' + commit
    remote('sudo test ! -e ' + release + ' && sudo install -d -o root -g root -m 0755 ' + release)
    remote('sudo tar --no-same-owner --no-same-permissions -xzf - -C ' + release, archive.getvalue())
    result = remote('sudo python3 - activate ' + commit, operator)
    (ROOT / 'artifacts/hosting-update.json').write_bytes(result)
    print(result.decode())


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Deliberately omit exception values/remote output; operator can inspect
        # only service health and the redacted status, not dump provider secrets.
        print('MNELO_UPDATE_FAILED: ' + type(error).__name__)
        raise SystemExit(1) from None
