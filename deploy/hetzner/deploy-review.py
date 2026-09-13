# Operator-only, owner-authorized development deployment. No secret values in output.
import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import tarfile

root = pathlib.Path.cwd()
manifest = json.loads((root / 'artifacts/hosting/manifest.json').read_text())
commit = manifest['sourceCommit']
assert re.fullmatch('[a-f0-9]{40}', commit) and manifest['sourceDirty'] is False
assert subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip() == ''
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == commit
credential = pathlib.Path.home() / '.config/mnelo/apple-review/access.json'
assert credential.is_file() and not credential.is_symlink() and credential.stat().st_mode & 0o077 == 0
ssh = ['ssh', '-i', str(pathlib.Path.home() / '.ssh/mnelo_dev_ed25519'), '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(root / '.local/hosting/known_hosts'), 'mnelo-admin@46.225.169.127']

def run(command, data=None):
    result = subprocess.run(ssh + [command], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    if result.returncode:
        # Remote code emits stable stage codes, never credentials or database values.
        print('REVIEW_DEPLOY_STEP_FAILED')
        print(result.stderr.decode()[-1200:])
        raise SystemExit(result.returncode)
    return result.stdout

release = '/opt/mnelo/releases/' + commit
run('sudo test ! -e ' + release + ' && sudo install -d -o root -g root -m 0755 ' + release)
archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode='w:gz') as tar:
    for name in [*manifest['files'], 'manifest.json']:
        assert '/' not in name and name.endswith(('.mjs', '.json'))
        tar.add(root / 'artifacts/hosting' / name, arcname=name, recursive=False)
    for name in ['identity-routing.conf', 'identity-review.conf']:
        tar.add(root / 'deploy/hetzner' / name, arcname=name, recursive=False)
run('sudo tar --no-same-owner -xzf - -C ' + release, archive.getvalue())
# Transfer hashes only. The review access keys themselves stay on the owner's Mac.
run("sudo test ! -e /etc/mnelo/review-access.json && sudo sh -c 'umask 077; cat > /etc/mnelo/review-access.json'", credential.read_bytes())
remote = r'''
import datetime, hashlib, json, os, pathlib, socket, sqlite3, subprocess, sys, time, urllib.request, urllib.error
commit = sys.argv[1]
release = pathlib.Path('/opt/mnelo/releases') / commit
manifest = json.loads((release/'manifest.json').read_text())
assert manifest['sourceCommit'] == commit and manifest['sourceDirty'] is False
for name, meta in manifest['files'].items():
    p = release/name
    assert p.is_file() and not p.is_symlink() and hashlib.sha256(p.read_bytes()).hexdigest() == meta['sha256']
    p.chmod(0o644)
runtime = pathlib.Path('/opt/mnelo/runtime')
assert runtime.is_symlink()
previous = os.readlink(runtime)
assert pathlib.Path(previous).is_dir()
directory = pathlib.Path('/etc/systemd/system/mnelo-identity.service.d')
drops = [directory/'routing.conf', directory/'review.conf']
assert all(not p.exists() for p in drops)
state = pathlib.Path('/var/lib/mnelo-identity/.local/phone-sms')
preserve = [state/'index.key'] + [pathlib.Path('/etc/mnelo')/n for n in ['identity.env','push.env','turn-identity.env','apns-sandbox.p8','apns-production.p8']]
hashes = {str(p): hashlib.sha256(p.read_bytes()).digest() for p in preserve}
def active(unit):
    return subprocess.run(['systemctl','is-active','--quiet',unit]).returncode == 0
assert all(active(u) for u in ['mnelo-identity','mnelo-relay','mnelo-turn','caddy'])
def rows(name):
    with sqlite3.connect('file:'+str(state/name)+'?mode=ro',uri=True) as db:
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
        result = {}
        for table in tables:
            columns = [r[1] for r in db.execute('PRAGMA table_info("'+table+'")') if not (table == 'push_routes' and r[1] == 'updated')]
            query = 'SELECT '+','.join('"'+c+'"' for c in columns)+' FROM "'+table+'"'
            result[table] = sorted(repr(r) for r in db.execute(query))
        return result

def swap(target):
    temporary = pathlib.Path('/opt/mnelo/runtime-review-next')
    assert not temporary.exists() and not temporary.is_symlink()
    os.symlink(target, temporary)
    os.replace(temporary, runtime)

stage = 'stop'
try:
    subprocess.run(['systemctl','stop','mnelo-relay','mnelo-identity'],check=True)
    before = {name: rows(name) for name in ['identity.db','sms-budget.db','push-routes.db']}
    assert len(before['identity.db']['phone_identities']) == 1
    stage = 'configure'
    for target, source in zip(drops, ['identity-routing.conf','identity-review.conf']):
        fd = os.open(target, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o644)
        with os.fdopen(fd,'wb') as stream: stream.write((release/source).read_bytes())
    swap(str(release))
    subprocess.run(['systemctl','daemon-reload'],check=True)
    stage = 'start'
    subprocess.run(['systemctl','start','mnelo-identity'],check=True)
    stage = 'health'
    for attempt in range(30):
        try:
            assert active('mnelo-identity')
            with socket.create_connection(('127.0.0.1',8084),timeout=2): pass
            req = urllib.request.Request('http://127.0.0.1:8086/challenge',data=b'{}',headers={'Content-Type':'application/json','X-Mnelo-Client-IP':'127.0.0.1'})
            try:
                urllib.request.urlopen(req,timeout=3)
                raise RuntimeError('INVALID_CHALLENGE_ACCEPTED')
            except urllib.error.HTTPError as e:
                assert e.code == 400 and json.loads(e.read()) == {'code':'PHONE_REQUEST_FAILED'}
            break
        except (AssertionError, OSError, urllib.error.URLError):
            if attempt == 29: raise RuntimeError('COMBINED_SERVICE_NOT_READY') from None
            time.sleep(0.25)
    stage = 'preservation'
    assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).digest() == value for p,value in hashes.items())
    assert all(rows(name) == saved for name,saved in before.items())
    assert active('mnelo-turn') and active('caddy') and not active('mnelo-relay')
    subprocess.run(['systemctl','disable','mnelo-relay'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    print(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':commit,'previousRuntime':previous,'combinedIdentityAndRelay':'active','standaloneRelay':'disabled/inactive','turn':'active','caddy':'active','existingIdentitiesPreserved':1,'existingIdentitySmsBudgetPushRecordsAndKeysPreserved':True,'reviewConfiguration':'systemd credential with hashes only','noSmsSent':True,'reviewAccountsEnrolled':0},indent=2))
except Exception as failure:
    print('REVIEW_DEPLOY_FAILED_STAGE '+stage+' '+type(failure).__name__,file=sys.stderr)
    subprocess.run(['systemctl','stop','mnelo-identity'],check=False)
    for p in drops:
        if p.exists(): p.unlink()
    if os.readlink(runtime) != previous: swap(previous)
    subprocess.run(['systemctl','daemon-reload'],check=True)
    subprocess.run(['systemctl','enable','mnelo-relay'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    subprocess.run(['systemctl','start','mnelo-identity','mnelo-relay'],check=True)
    print('REVIEW_DEPLOY_ROLLED_BACK',file=sys.stderr)
    raise SystemExit(1)
'''
result = run('sudo python3 - ' + commit, remote.encode())
(root/'artifacts/review-deployment.json').write_bytes(result)
print(result.decode())
