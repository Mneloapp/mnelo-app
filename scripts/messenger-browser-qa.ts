import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
async function main() {
  const hosted = process.argv.includes('--hosted-turn');
  const prepared = process.argv.includes('--prepared-calls');
  const queued = prepared || process.argv.includes('--queued-calls');
  if (queued && !hosted) throw new Error('QUEUED_CALL_QA_REQUIRES_TURN');
  const ice = hosted
    ? await readFile(prepared ? '.local/turn-qa-pool.json' : '.local/turn-qa.json', 'utf8')
    : null;
  const icePool = prepared && ice ? (JSON.parse(ice) as unknown[]) : null;
  let iceIndex = 0;
  await build({
    entryPoints: [
      prepared
        ? 'tests/messenger/browser/prepared-calls.ts'
        : queued
          ? 'tests/messenger/browser/queued-calls.ts'
          : 'tests/messenger/browser/harness.ts',
    ],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'artifacts/messenger-harness.js',
  });
  const server = createServer((request, response) => {
    if (request.headers.origin || request.headers['sec-fetch-site'] === 'cross-site') {
      response.writeHead(403).end();
      return;
    }
    if (request.url === '/ice' && ice) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(icePool ? JSON.stringify(icePool[iceIndex++ % icePool.length]) : ice);
      return;
    }
    if (request.url === '/harness.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      void readFile('artifacts/messenger-harness.js').then((bytes) => response.end(bytes));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>Mnelo development transport QA</title><h1>Mnelo transport QA — development only</h1><p>Real WebRTC with generated identities and synthetic media. No production users.</p><button id="run">Run transport checks</button><pre id="results">Ready</pre><script src="/harness.js"></script></html>',
    );
  });
  server.listen(8085, '127.0.0.1', () =>
    console.log('Development transport harness: http://127.0.0.1:8085'),
  );
}
void main();
