import path from 'node:path';
const mockExisting = /existing-exclusion/;
jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({ resolver: { blockList: mockExisting } }),
}));
const original = process.env.EXPO_NO_DOTENV;
afterEach(() => {
  if (original === undefined) delete process.env.EXPO_NO_DOTENV;
  else process.env.EXPO_NO_DOTENV = original;
});
test('explicit no-dotenv excludes all root env files from dev virtual imports and preserves prior exclusions', () => {
  process.env.EXPO_NO_DOTENV = '1';
  jest.isolateModules(() => {
    const config = jest.requireActual('../metro.config.cjs');
    const list = config.resolver.blockList as RegExp[];
    for (const file of ['.env', '.env.local', '.env.development.local'])
      expect(list.some((rule) => rule.test(path.resolve(file)))).toBe(true);
    expect(list.some((rule) => rule.test(path.resolve('src/messenger/environment.ts')))).toBe(
      false,
    );
    expect(list.some((rule) => rule.test('existing-exclusion'))).toBe(true);
  });
});
test('normal developer launches retain Expo env-file behavior', () => {
  delete process.env.EXPO_NO_DOTENV;
  jest.isolateModules(() => {
    expect(jest.requireActual('../metro.config.cjs').resolver.blockList).toBe(mockExisting);
  });
});
