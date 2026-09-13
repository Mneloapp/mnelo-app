import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(root + '/' + entry.name)
      : entry.name.endsWith('.tsx')
        ? [root + '/' + entry.name]
        : [],
  );
}
const violations: string[] = [];
const copyProps = new Set([
  'label',
  'title',
  'placeholder',
  'accessibilityLabel',
  'accessibilityHint',
]);
const paths = [...files('src'), ...files('app')];
for (const path of paths) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(node: ts.Node) {
    const inline = ts.isJsxText(node)
      ? node.text.trim()
      : ts.isJsxAttribute(node) &&
          copyProps.has(node.name.getText(source)) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer)
        ? node.initializer.text
        : '';
    if (/[\p{L}]/u.test(inline))
      violations.push(
        path + ':' + (source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1),
      );
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (violations.length) {
  console.error('Inline UI copy must use the dictionary: ' + violations.join(', '));
  process.exitCode = 1;
} else
  console.log(
    'Localization source guard: ' +
      paths.length +
      ' TSX files; no inline UI copy. Provider/user data requires separate review.',
  );
