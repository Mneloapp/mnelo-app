import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import ts from 'typescript';
import { messengerEnvironment } from '../../src/messenger/environment';
const root = resolve('.');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [resolve(dir, entry.name)]
        : [],
  );
}
test('active mobile routes cannot reach legacy persistence or Connect modules', () => {
  const visited = new Set<string>();
  function visit(path: string) {
    if (visited.has(path)) return;
    visited.add(path);
    const name = relative(root, path);
    assert.doesNotMatch(
      name,
      /^(legacy\/|identity\/|relay\/|src\/services\/supabase|src\/services\/index|src\/features\/(connect|connections|reputation|auth)\/)/,
    );
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function node(n: ts.Node) {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier &&
        ts.isStringLiteral(n.moduleSpecifier)
      ) {
        const spec = n.moduleSpecifier.text;
        assert.ok(
          spec !== '@supabase/supabase-js',
          'Supabase import is forbidden in active messenger',
        );
        const base = spec.startsWith('@/')
          ? resolve(root, 'src', spec.slice(2))
          : spec.startsWith('.')
            ? resolve(dirname(path), spec)
            : null;
        if (base)
          for (const suffix of [
            '.ts',
            '.tsx',
            '.native.ts',
            '.native.tsx',
            '/index.ts',
            '/index.tsx',
          ])
            if (existsSync(base + suffix)) visit(base + suffix);
      }
      ts.forEachChild(n, node);
    }
    node(source);
  }
  for (const path of files(resolve(root, 'app'))) visit(path);
  const tabs = readFileSync('app/(tabs)/_layout.tsx', 'utf8');
  assert.doesNotMatch(tabs, /name="connect"/);
  assert.deepEqual(
    [...tabs.matchAll(/name="(chats|calls|me)"/g)].map((match) => match[1]),
    ['chats', 'calls', 'me'],
  );
  assert.ok(visited.size > 20);
});
test('cloud release cannot bypass unfinished security review; old backend settings cannot activate persistence', () => {
  assert.throws(
    () => messengerEnvironment({ appEnv: 'production', relayUrl: 'wss://relay.mnelo.com' }),
    /SECURITY_REVIEW_REQUIRED/,
  );
  assert.throws(
    () => messengerEnvironment({ appEnv: 'development', relayUrl: 'ws://example.com' }),
    /RELAY_CONFIGURATION_INVALID/,
  );
  assert.deepEqual(messengerEnvironment({ appEnv: 'local' }), { appEnv: 'local', relayUrl: null });
  assert.match(readFileSync('src/services/index.ts', 'utf8'), /unavailableRepository/);
});
test('functional beta is confined to the admitted development services; production and arbitrary preview remain blocked', () => {
  const beta = {
    appEnv: 'preview',
    relayUrl: 'wss://relay-dev.mnelo.com/',
    phoneIdentityUrl: 'https://identity-dev.mnelo.com',
  };
  assert.equal(messengerEnvironment(beta).appEnv, 'preview');
  for (const input of [
    { ...beta, appEnv: 'production' },
    { ...beta, relayUrl: 'wss://unreviewed.example/' },
    { ...beta, phoneIdentityUrl: 'https://unreviewed.example' },
    { ...beta, phoneIdentityUrl: undefined },
  ])
    assert.throws(() => messengerEnvironment(input), /SECURITY_REVIEW_REQUIRED/);
});
test('relay implementation has no persistent storage or message body endpoints', () => {
  const source = readFileSync('relay/server.ts', 'utf8');
  assert.doesNotMatch(source, /from ['"](?:node:fs|node:sqlite|@supabase|redis|pg)/);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
  assert.doesNotMatch(source, /z\.literal\(['"]message['"]\)/);
});
