"""Scoped existing-server migration, run over SSH with `check` or `enable`.

Only the delivery route and a one-line service opt-in are changed. Never restore
an old database, reset an account or print credentials. Private content remains
in the opt-in ciphertext stores; current build-nine clients stay on their path.
"""
import hashlib
import json
import os
import pathlib
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

CADDY = pathlib.Path('/etc/caddy/Caddyfile')
FLAG = pathlib.Path('/etc/systemd/system/mnelo-identity.service.d/delivery-v2.conf')
STATE = pathlib.Path('/var/lib/mnelo-identity/.local/phone-sms')
FLAG_TEXT = '[Service]\nEnvironment=MNELO_DELIVERY_V2=1\n'
ANCHOR = 'identity-dev.mnelo.com {\n'
ROUTE = '''\t@delivery {
\t\tpath /delivery
\t\tmethod POST
\t}
\thandle @delivery {
\t\trequest_body {
\t\t\tmax_size 250000
\t\t}
\t\treverse_proxy 127.0.0.1:8086 {
\t\t\theader_up X-Mnelo-Client-IP {http.request.remote.host}
\t\t}
\t}
'''


def configure(text):
    if text.count(ANCHOR) != 1:
        raise RuntimeError('DELIVERY_CADDY_SHAPE_UNKNOWN')
    if ANCHOR + ROUTE in text:
        return text
    if '/delivery' in text or '@delivery' in text:
        raise RuntimeError('DELIVERY_ROUTE_CONFLICT')
    return text.replace(ANCHOR, ANCHOR + ROUTE, 1)


def command(*args):
    subprocess.run(args, check=True, capture_output=True, timeout=30)


def active(unit):
    return subprocess.run(['systemctl', 'is-active', '--quiet', unit], capture_output=True).returncode == 0


def atomic(path, data):
    temporary = path.with_name(path.name + '.mnelo-next')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def identities():
    with sqlite3.connect('file:' + str(STATE / 'identity.db') + '?mode=ro', uri=True) as db:
        return set(db.execute('SELECT phone_index,public_key FROM phone_identities'))


def protected():
    paths = [STATE / 'index.key'] + list(pathlib.Path('/etc/mnelo').glob('*'))
    paths += [p for p in FLAG.parent.glob('*') if p != FLAG]
    return {str(p): hashlib.sha256(p.read_bytes()).digest() for p in paths if p.is_file()}


def endpoint(url):
    request = urllib.request.Request(url, data=b'{}', headers={
        'Content-Type': 'application/json', 'X-Mnelo-Client-IP': '127.0.0.1'})
    try:
        urllib.request.urlopen(request, timeout=5)
        raise RuntimeError('DELIVERY_UNAUTHORIZED_REQUEST_ACCEPTED')
    except urllib.error.HTTPError as error:
        if error.code != 400 or json.loads(error.read()) != {'code': 'PHONE_REQUEST_FAILED'}:
            raise RuntimeError('DELIVERY_ENDPOINT_FAILED') from None


def ready():
    for attempt in range(30):
        if active('mnelo-identity') and all((STATE / name).is_file() for name in
                ['delivery-spool.db', 'signal-directory.db', 'delivery-media.db']):
            try:
                endpoint('http://127.0.0.1:8086/delivery')
                return
            except (OSError, urllib.error.URLError):
                pass
        time.sleep(0.25)
    raise RuntimeError('DELIVERY_SERVICE_NOT_READY')


def main(mode):
    if mode not in ['check', 'enable']:
        raise RuntimeError('DELIVERY_MODE_REQUIRED')
    if not all(active(x) for x in ['caddy', 'mnelo-identity', 'mnelo-turn']) or active('mnelo-relay'):
        raise RuntimeError('DELIVERY_SERVICE_STATE_INVALID')
    runtime = pathlib.Path('/opt/mnelo/runtime').resolve(strict=True)
    manifest = json.loads((runtime / 'manifest.json').read_text())
    meta = manifest['files']['identity.mjs']
    source = (runtime / 'identity.mjs').read_bytes()
    if (manifest['sourceDirty'] or runtime.name != manifest['sourceCommit'] or
            hashlib.sha256(source).hexdigest() != meta['sha256'] or
            b'MNELO_DELIVERY_V2' not in source):
        raise RuntimeError('DELIVERY_RELEASE_NOT_VERIFIED')
    previous = CADDY.read_bytes()
    next_config = configure(previous.decode()).encode()
    flag_before = FLAG.read_bytes() if FLAG.exists() else None
    if flag_before not in [None, FLAG_TEXT.encode()]:
        raise RuntimeError('DELIVERY_OPT_IN_CONFLICT')
    if mode == 'check':
        print(json.dumps({'status': 'PASS', 'sourceCommit': runtime.name,
            'existingIdentities': len(identities()), 'routePresent': next_config == previous,
            'optInPresent': flag_before is not None, 'mutation': False}))
        return
    before, saved = identities(), protected()
    candidate = CADDY.with_name('MneloDeliveryValidation.caddy')
    created = False
    try:
        # Validation never reads or writes account data. Do not replace a user's
        # unrelated validation file if one already exists.
        with candidate.open('xb') as stream:
            created = True
            stream.write(next_config)
        command('caddy', 'validate', '--config', str(candidate), '--adapter', 'caddyfile')
    finally:
        if created:
            candidate.unlink()
    try:
        atomic(FLAG, FLAG_TEXT.encode())
        command('systemctl', 'daemon-reload')
        command('systemctl', 'restart', 'mnelo-identity')
        ready()
        atomic(CADDY, next_config)
        # The deployed Caddy intentionally has its administrative API disabled.
        command('systemctl', 'restart', 'caddy')
        for attempt in range(20):
            try:
                endpoint('https://identity-dev.mnelo.com/challenge')
                break
            except (OSError, urllib.error.URLError):
                if attempt == 19:
                    raise
                time.sleep(0.25)
        endpoint('https://identity-dev.mnelo.com/delivery')
        endpoint('https://identity-dev.mnelo.com/challenge')
        if not before <= identities() or protected() != saved:
            raise RuntimeError('DELIVERY_PROTECTED_STATE_CHANGED')
        for name in ['delivery-spool.db', 'signal-directory.db', 'delivery-media.db']:
            if (STATE / name).stat().st_mode & 0o077:
                raise RuntimeError('DELIVERY_STORE_PERMISSIONS_INVALID')
        print(json.dumps({'status': 'PASS', 'sourceCommit': runtime.name,
            'existingIdentitiesPreserved': len(before), 'providerConfigurationPreserved': True,
            'deliveryEnabled': True, 'privateStorePermissions': True,
            'unauthorizedDeliveryRejected': True, 'smsSent': False,
            'physicalClientsMigrated': False}))
    except Exception:
        # Preserve any newly accepted ciphertext/user activity for a subsequent
        # corrected rollout. Roll back only route and opt-in configuration.
        atomic(CADDY, previous)
        if flag_before is None:
            FLAG.unlink(missing_ok=True)
        else:
            atomic(FLAG, flag_before)
        command('systemctl', 'daemon-reload')
        command('systemctl', 'restart', 'mnelo-identity')
        command('systemctl', 'restart', 'caddy')
        raise RuntimeError('DELIVERY_ENABLE_ROLLED_BACK') from None


if __name__ == '__main__':
    try:
        main(sys.argv[1] if len(sys.argv) == 2 else '')
    except Exception:
        print('MNELO_DELIVERY_ENABLE_FAILED', file=sys.stderr)
        raise SystemExit(1) from None
