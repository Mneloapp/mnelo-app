import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
// Expo Router adds unlisted files automatically. New feature routes must not silently bypass the profile guard.
it('places every feature route behind the verified-phone navigator guard', () => {
  const root = join(process.cwd(), 'app');
  const source = ts.createSourceFile(
    'layout.tsx',
    readFileSync(join(root, '_layout.tsx'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const protectedNames: string[] = [];
  function visit(node: ts.Node, protectedScope = false) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(source) === 'Stack.Protected'
    ) {
      const guard = node.openingElement.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && p.name.getText(source) === 'guard',
      );
      if (
        guard &&
        ts.isJsxAttribute(guard) &&
        guard.initializer &&
        ts.isJsxExpression(guard.initializer)
      )
        protectedScope = guard.initializer.expression?.getText(source) === 'authenticated';
    }
    if (
      protectedScope &&
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(source) === 'Stack.Screen'
    ) {
      const name = node.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && p.name.getText(source) === 'name',
      );
      if (
        name &&
        ts.isJsxAttribute(name) &&
        name.initializer &&
        ts.isStringLiteral(name.initializer)
      )
        protectedNames.push(name.initializer.text);
    }
    ts.forEachChild(node, (child) => visit(child, protectedScope));
  }
  visit(source);
  const routes: string[] = [];
  function files(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) files(path);
      else if (
        entry.name.endsWith('.tsx') &&
        !['_layout.tsx', '+not-found.tsx'].includes(entry.name) &&
        // Installed Expo getRoutesCore explicitly excludes the root native-intent module.
        !(dir === root && entry.name === '+native-intent.tsx')
      )
        routes.push(relative(root, path).replace(/\.tsx$/, ''));
    }
  }
  files(root);
  // The public invitation preview contains only externally supplied name/key.
  // contact-invitation.test.tsx verifies registration gates the actual add action.
  const authRoutes = new Set(['index', 'identity', 'restore', 'contact-invite']);
  for (const route of routes.filter((p) => !authRoutes.has(p)))
    expect({
      route,
      guarded: protectedNames.some((p) => route === p || route.startsWith(p + '/')),
    }).toEqual({ route, guarded: true });
});
