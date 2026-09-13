"""Offline guard tests. SSH is replaced; no live service or credentials touched."""
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SOURCE = pathlib.Path(__file__).resolve().parents[2] / 'deploy/hetzner/update-release.py'
spec = importlib.util.spec_from_file_location('mnelo_release_update', SOURCE)
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class ReleaseUpdateGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='mnelo-release-test-')
        self.root = pathlib.Path(self.temp.name)
        self.output = self.root / 'artifacts/hosting'
        self.output.mkdir(parents=True)
        (self.root / 'deploy/hetzner').mkdir(parents=True)
        (self.root / 'deploy/hetzner/update-runtime.py').write_text('# fixture operator')
        self.manifest = {'sourceCommit': 'a' * 40, 'sourceDirty': False, 'files': {}}
        for name in updater.FILES:
            data = b'// synthetic compiled fixture'
            (self.output / name).write_bytes(data)
            self.manifest['files'][name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        self.write_manifest()

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self):
        (self.output / 'manifest.json').write_text(json.dumps(self.manifest))

    def invoke(self, remote, dirty=False):
        def git(args, **kwargs):
            if args[1] == 'status':
                return b' M src/fixture.ts' if dirty else b''
            return 'a' * 40 + '\n'
        with patch.object(updater, 'ROOT', self.root), patch.object(updater, 'remote', remote), patch.object(updater.subprocess, 'check_output', git), patch.object(sys, 'argv', ['update-release.py', '--deploy']), contextlib.redirect_stdout(io.StringIO()):
            updater.main()

    def no_remote(self, *args):
        self.fail('invalid local input must never reach SSH')

    def test_dirty_tree_rejected_before_ssh(self):
        with self.assertRaisesRegex(RuntimeError, 'CLEAN_TREE'):
            self.invoke(self.no_remote, dirty=True)

    def test_private_extra_file_rejected_before_ssh(self):
        self.manifest['files']['identity.env'] = {'bytes': 0, 'sha256': '0' * 64}
        self.write_manifest()
        with self.assertRaisesRegex(RuntimeError, 'ALLOWLIST'):
            self.invoke(self.no_remote)

    def test_modified_binary_rejected_before_ssh(self):
        (self.output / 'identity.mjs').write_text('changed')
        with self.assertRaisesRegex(RuntimeError, 'DIGEST'):
            self.invoke(self.no_remote)

    def test_valid_update_transfers_only_bundles_and_manifest(self):
        commands = []
        def remote(command, data=None):
            commands.append(command)
            if 'tar ' in command:
                with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as tar:
                    self.assertEqual(set(tar.getnames()), updater.FILES | {'manifest.json'})
            return b'{"status":"PASS"}'
        self.invoke(remote)
        self.assertEqual(commands[0], 'sudo python3 - check')
        self.assertEqual(commands[-1], 'sudo python3 - activate ' + 'a' * 40)
        self.assertTrue((self.root / 'artifacts/hosting-update.json').is_file())
        self.assertFalse(any('/etc/' in command or '/var/lib/' in command for command in commands))


if __name__ == '__main__':
    unittest.main()
