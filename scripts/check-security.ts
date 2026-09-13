import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mobileSourceViolations } from './security-rules';

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
  });
}
const files = [...walk('app'), ...walk('src'), 'app.config.ts'];
const violations = files.flatMap((file) =>
  mobileSourceViolations(readFileSync(file, 'utf8')).map((rule) => `${file}: ${rule}`),
);
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
for (const file of tracked) {
  if (
    (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')) ||
    /\.(p12|p8|jks|keystore|mobileprovision)$/.test(file)
  )
    violations.push(`${file}: credential-file-tracked`);
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Source security guard passed (${files.length} mobile/config files). This is not a full secret scanner or security audit.`,
  );
}
