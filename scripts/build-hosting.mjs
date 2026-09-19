import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Explicit source entry points only: never copy .local, dotenv, a device vault or native builds.
const output = 'artifacts/hosting';
await mkdir(output, { recursive: true });
const entries = {
  relay: 'scripts/messenger-relay.ts',
  'check-relay': 'scripts/check-hosted-relay.ts',
  'test-cohort': 'tests/messenger/cohort.integration.ts',
  identity: 'scripts/phone-identity.ts',
  'check-infobip': 'scripts/check-infobip.ts',
  'check-identity': 'scripts/check-hosted-identity.ts',
  'configure-testers': 'scripts/configure-hosted-testers.ts',
};
const files = {};
for (const [name, entry] of Object.entries(entries)) {
  const path = `${output}/${name}.mjs`;
  const result = await build({
    entryPoints: [entry],
    outfile: path,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    // Worktrees may share the checked dependency directory through a symlink.
    // Keep those inputs under node_modules so the source allowlist below can
    // remain strict without admitting arbitrary parent-workspace files.
    preserveSymlinks: true,
    metafile: true,
    sourcemap: false,
    legalComments: 'inline',
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
  const inputs = Object.keys(result.metafile.inputs);
  if (
    inputs.some(
      (input) =>
        !/^(scripts|relay|identity|notifications|src\/messenger|tests\/messenger|node_modules)\//.test(
          input,
        ),
    )
  )
    throw new Error('HOSTING_UNEXPECTED_SOURCE');
  const bytes = await readFile(path);
  files[`${name}.mjs`] = {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(
  `${output}/manifest.json`,
  JSON.stringify(
    {
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      sourceDirty: Boolean(
        execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
      ),
      node: process.version,
      dependencies: Object.fromEntries(
        ['ws', 'zod', '@noble/curves', '@noble/hashes', '@noble/ciphers'].map((name) => [
          name,
          pkg.dependencies[name],
        ]),
      ),
      files,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(
  'HOSTING_BUNDLES_CREATED: relay, identity and checks; no identity state or provider configuration\n',
);
