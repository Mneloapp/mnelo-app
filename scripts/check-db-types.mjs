import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

const root = resolve(import.meta.dirname, '..');
const path = resolve(root, 'src/services/supabase/database.types.ts');
const generated = spawnSync(process.execPath, ['scripts/local-backend.mjs', 'types'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 2 * 1024 * 1024,
  timeout: 60000,
});
if (generated.status !== 0) throw new Error('LOCAL_TYPE_GENERATION_FAILED');
const formatted = await format(generated.stdout, {
  ...(await resolveConfig(path)),
  filepath: path,
});
if (formatted !== readFileSync(path, 'utf8')) throw new Error('DATABASE_TYPES_DRIFT');
console.log('Generated local database types match the committed schema.');
