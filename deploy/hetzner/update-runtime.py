"""Executed over SSH on the existing server. No secrets in stdout/stderr."""
import hashlib
import json
import os
import pathlib
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

RUNTIME = pathlib.Path('/opt/mnelo/runtime')
STATE = pathlib.Path('/var/lib/mnelo-identity/.local/phone-sms')
FILES = {'relay.mjs', 'check-relay.mjs', 'test-cohort.mjs', 'identity.mjs',
         'check-infobip.mjs', 'check-identity.mjs', 'configure-testers.mjs'}


def active(unit):
    return subprocess.run(['systemctl', 'is-active', '--quiet', unit], capture_output=True).returncode == 0


def command(*args):
    subprocess.run(args, check=True, capture_output=True, timeout=30)


def check():
    assert RUNTIME.is_symlink()
    previous = RUNTIME.resolve(strict=True)
    assert previous.parent == pathlib.Path('/opt/mnelo/releases')
    assert all(active(unit) for unit in ['mnelo-identity', 'mnelo-turn', 'caddy'])
    assert not active('mnelo-relay'), 'STANDALONE_RELAY_MUST_REMAIN_INACTIVE'
    assert shutil.disk_usage('/opt/mnelo').free > 1_000_000_000
    assert all((STATE / name).is_file() for name in ['identity.db', 'push-routes.db', 'sms-budget.db', 'index.key'])
    return previous


def identities():
    with sqlite3.connect('file:' + str(STATE / 'identity.db') + '?mode=ro', uri=True) as db:
        return set(db.execute('SELECT phone_index,public_key FROM phone_identities'))


def protected():
    paths = [STATE / 'index.key', pathlib.Path('/etc/caddy/Caddyfile')]
    for directory in ['/etc/mnelo', '/etc/systemd/system/mnelo-identity.service.d']:
        paths.extend(path for path in pathlib.Path(directory).iterdir() if path.is_file())
    # Fingerprints remain in memory. No key, token, address or fingerprint is logged.
    return {str(path): hashlib.sha256(path.read_bytes()).digest() for path in paths}


def swap(path):
    temporary = pathlib.Path('/opt/mnelo/runtime-update-next')
    assert not temporary.exists() and not temporary.is_symlink()
    os.symlink(str(path), temporary)
    os.replace(temporary, RUNTIME)


def healthy():
    for attempt in range(40):
        try:
            assert active('mnelo-identity')
            with socket.create_connection(('127.0.0.1', 8084), timeout=1):
                pass
            request = urllib.request.Request('http://127.0.0.1:8086/challenge', data=b'{}',
                headers={'Content-Type': 'application/json', 'X-Mnelo-Client-IP': '127.0.0.1'})
            try:
                urllib.request.urlopen(request, timeout=2)
                raise RuntimeError('INVALID_CHALLENGE_ACCEPTED')
            except urllib.error.HTTPError as error:
                assert error.code == 400
                assert json.loads(error.read()) == {'code': 'PHONE_REQUEST_FAILED'}
            return
        except (AssertionError, OSError):
            if attempt == 39:
                raise RuntimeError('UPDATE_HEALTH_FAILED') from None
            time.sleep(0.25)


def main():
    previous = check()
    if sys.argv[1] == 'check':
        print(json.dumps({'status': 'PASS', 'runtime': previous.name, 'combinedService': 'active',
            'standaloneRelay': 'inactive', 'identities': len(identities()), 'mutation': False}))
        return
    assert sys.argv[1] == 'activate' and re.fullmatch('[a-f0-9]{40}', sys.argv[2])
    commit = sys.argv[2]
    release = pathlib.Path('/opt/mnelo/releases') / commit
    assert release.is_dir() and not release.is_symlink() and release != previous
    manifest = json.loads((release / 'manifest.json').read_text())
    assert manifest['sourceCommit'] == commit and manifest['sourceDirty'] is False
    assert set(manifest['files']) == FILES
    assert {path.name for path in release.iterdir()} == FILES | {'manifest.json'}
    for name in FILES:
        path, meta = release / name, manifest['files'][name]
        assert path.is_file() and not path.is_symlink()
        assert path.stat().st_size == meta['bytes']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == meta['sha256']
        path.chmod(0o644)
    saved = protected()
    before = identities()
    try:
        command('systemctl', 'stop', 'mnelo-identity')
        swap(release)
        command('systemctl', 'start', 'mnelo-identity')
        healthy()
        assert before <= identities(), 'EXISTING_IDENTITIES_CHANGED'
        assert protected() == saved, 'PROTECTED_CONFIGURATION_CHANGED'
        assert active('mnelo-turn') and active('caddy') and not active('mnelo-relay')
        print(json.dumps({'status': 'PASS', 'sourceCommit': commit, 'previousRuntime': previous.name,
            'existingIdentitiesPreserved': len(before), 'keysAndConfigurationPreserved': True,
            'deliveryFlagAndCaddyUnchanged': True, 'smsSentByUpdate': False}))
    except Exception:
        command('systemctl', 'stop', 'mnelo-identity')
        if RUNTIME.resolve() != previous:
            swap(previous)
        command('systemctl', 'start', 'mnelo-identity')
        healthy()
        # Never restore an older database over newer user activity.
        print('MNELO_UPDATE_ROLLED_BACK', file=sys.stderr)
        raise RuntimeError('UPDATE_ROLLED_BACK') from None


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('MNELO_UPDATE_REMOTE_FAILED', file=sys.stderr)
        raise SystemExit(1) from None
