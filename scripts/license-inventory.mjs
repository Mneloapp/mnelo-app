import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { format, resolveConfig } from 'prettier';

const root = resolve(import.meta.dirname, '..');
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const direct = new Set([
  ...Object.keys(lock.packages[''].dependencies),
  ...Object.keys(lock.packages[''].devDependencies),
]);
const inventory = [];
const notices = new Map();
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  if (!path.startsWith('node_modules/') || path.includes('..'))
    throw new Error('LICENSE_INVENTORY_PATH_INVALID');
  const name = path.split('node_modules/').at(-1);
  const id = `${name}@${entry.version}`;
  const files = [];
  let installed = true;
  try {
    const names = await readdir(join(root, path));
    for (const file of names.sort()) {
      if (!/^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(file)) continue;
      try {
        const text = await readFile(join(root, path, file), 'utf8');
        files.push(file);
        // Keep legal wording/indentation; normalize only line endings and trailing whitespace.
        notices.set(
          `${id} / ${file}`,
          text
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map((line) => line.trimEnd())
            .join('\n'),
        );
      } catch (error) {
        if (error.code !== 'EISDIR') throw error;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    installed = false; // Optional packages for other operating systems remain in the lock.
  }
  inventory.push({
    package: name,
    version: entry.version,
    license: entry.license ?? 'UNDECLARED',
    direct: direct.has(name),
    developmentOnly: entry.dev === true,
    installed,
    noticeFiles: files,
  });
}
inventory.sort((a, b) => a.package.localeCompare(b.package) || a.version.localeCompare(b.version));
await writeFile(
  join(root, 'docs/licenses/npm-inventory.json'),
  await format(JSON.stringify({ lockfileVersion: lock.lockfileVersion, packages: inventory }), {
    ...(await resolveConfig(root)),
    parser: 'json',
  }),
);
await writeFile(
  join(root, 'docs/licenses/Npm-notices.txt'),
  [...notices.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, text]) => '# ' + name + '\n\n' + text)
    .join('\n\n'),
);
console.log(
  `License inventory: ${inventory.length} lock entries; ${notices.size} installed notice files.`,
);
console.log(
  'Metadata inventory only; not legal approval of every binary or optional platform dependency.',
);
