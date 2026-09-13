import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const [session, checkpoint] = process.argv.slice(2);
if (!session || !checkpoint || !/^[a-z0-9-]+$/.test(session + '-' + checkpoint))
  throw new Error('Usage: node scripts/check-accessibility-web.mjs browser-session checkpoint');
const source = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const script = `(async () => { ${source}; const result = await window.axe.run(document, {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }
}); return { version: result.testEngine.version, violations: result.violations.map(v => ({
  id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.map(n => n.target)
})), incomplete: result.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length, targets: v.nodes.map(n => n.target), reasons: [...new Set(v.nodes.flatMap(n => [...n.any, ...n.all, ...n.none].map(c => c.message)))] })),
passes: result.passes.length }; })()`;
const raw = execFileSync(
  'npx',
  ['--yes', 'agent-browser', '--session', session, '--json', 'eval', '--stdin'],
  {
    input: script,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  },
);
const output = JSON.parse(raw);
if (!output.success || !output.data?.result) throw new Error('ACCESSIBILITY_CHECK_FAILED');
const result = output.data.result;
mkdirSync('artifacts/accessibility', { recursive: true });
writeFileSync(
  'artifacts/accessibility/' + checkpoint + '.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
if (result.violations.length) process.exitCode = 1;
