const { beforeEach, afterEach, test, expect } = require('@jest/globals');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, cpSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const plist = require('@expo/plist').default;
const xcode = require('xcode');
const {
  writeIntentVocabulary,
  configureIntentVocabulary,
} = require('../plugins/intent-vocabulary.cjs');

let directory;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'mnelo-siri-vocabulary-'));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function projectFixture() {
  const project = xcode.project(join(directory, 'project.pbxproj'));
  project.hash = {
    project: {
      archiveVersion: 1,
      classes: {},
      objectVersion: 56,
      objects: {
        PBXProject: {
          PROJECT: {
            isa: 'PBXProject',
            mainGroup: 'MAIN',
            knownRegions: ['en'],
            targets: [
              { value: 'APP', comment: 'Mnelo' },
              { value: 'INTENTS', comment: 'MneloIntents' },
            ],
          },
        },
        PBXGroup: { MAIN: { isa: 'PBXGroup', children: [], sourceTree: '"<group>"' } },
        PBXNativeTarget: {
          APP: {
            isa: 'PBXNativeTarget',
            name: 'Mnelo',
            productType: '"com.apple.product-type.application"',
            buildPhases: [{ value: 'APP_RESOURCES', comment: 'Resources' }],
          },
          INTENTS: {
            isa: 'PBXNativeTarget',
            name: 'MneloIntents',
            productType: '"com.apple.product-type.app-extension"',
            buildPhases: [{ value: 'INTENT_RESOURCES', comment: 'Resources' }],
          },
        },
        PBXResourcesBuildPhase: {
          APP_RESOURCES: { isa: 'PBXResourcesBuildPhase', files: [] },
          INTENT_RESOURCES: {
            isa: 'PBXResourcesBuildPhase',
            files: [{ value: 'EXISTING_BUILD', comment: 'PrivacyInfo.xcprivacy' }],
          },
        },
        PBXFileReference: {
          EXISTING_FILE: {
            isa: 'PBXFileReference',
            path: '"MneloIntents/PrivacyInfo.xcprivacy"',
            sourceTree: 'SOURCE_ROOT',
          },
        },
        PBXBuildFile: {
          EXISTING_BUILD: {
            isa: 'PBXBuildFile',
            fileRef: 'EXISTING_FILE',
            fileRef_comment: 'PrivacyInfo.xcprivacy',
          },
        },
      },
      rootObject: 'PROJECT',
    },
  };
  return project;
}

test('generates Apple global vocabulary schema for both shipped languages without user data', () => {
  writeIntentVocabulary(directory);
  for (const locale of ['en', 'ka']) {
    const path = join(directory, 'MneloSiri', `${locale}.lproj`, 'AppIntentVocabulary.plist');
    const contents = readFileSync(path, 'utf8');
    const vocabulary = plist.parse(contents);
    expect(Object.keys(vocabulary)).toEqual(['IntentPhrases']);
    expect(vocabulary.IntentPhrases).toHaveLength(1);
    expect(vocabulary.IntentPhrases[0].IntentName).toBe('INSendMessageIntent');
    const examples = vocabulary.IntentPhrases[0].IntentExamples;
    expect(examples.length).toBeGreaterThan(0);
    for (const phrase of examples) expect(phrase).toContain('Mnelo');
    if (locale === 'ka') expect(examples.every((phrase) => /[ა-ჰ]/u.test(phrase))).toBe(true);
    expect(contents).not.toMatch(/(?:\+[1-9]\d{7,}|[a-f0-9]{64}|mnelo1:)/iu);
    writeIntentVocabulary(directory);
    expect(readFileSync(path, 'utf8')).toBe(contents);
  }
});

test('main app owns one localized resource group; regeneration preserves extension resources and round-trips Xcode', () => {
  const project = projectFixture();
  const objects = project.hash.project.objects;
  const untouchedExtension = JSON.stringify(objects.PBXResourcesBuildPhase.INTENT_RESOURCES);
  configureIntentVocabulary(project);
  const result = project.writeSync();
  configureIntentVocabulary(project);
  expect(project.writeSync()).toBe(result);
  expect(JSON.stringify(objects.PBXResourcesBuildPhase.INTENT_RESOURCES)).toBe(untouchedExtension);
  expect(objects.PBXResourcesBuildPhase.APP_RESOURCES.files).toHaveLength(1);
  const buildId = objects.PBXResourcesBuildPhase.APP_RESOURCES.files[0].value;
  const variantId = objects.PBXBuildFile[buildId].fileRef;
  const variant = objects.PBXVariantGroup[variantId];
  expect(variant.name).toBe('AppIntentVocabulary.plist');
  expect(variant.children).toHaveLength(2);
  expect(objects.PBXGroup.MAIN.children).toEqual([
    { value: variantId, comment: 'AppIntentVocabulary.plist' },
  ]);
  expect(objects.PBXProject.PROJECT.knownRegions).toEqual(['en', 'ka']);
  for (const child of variant.children) {
    const file = objects.PBXFileReference[child.value];
    expect(file.path).toBe(`"MneloSiri/${file.name}.lproj/AppIntentVocabulary.plist"`);
    expect(file.sourceTree).toBe('SOURCE_ROOT');
  }
  writeFileSync(project.filepath, result);
  const parsed = xcode.project(project.filepath);
  parsed.parseSync();
  configureIntentVocabulary(parsed);
  expect(parsed.writeSync()).toBe(result);
});

test('cannot accidentally attach vocabulary to the extension or omit the main resource phase', () => {
  const project = projectFixture();
  const main = project.hash.project.objects.PBXNativeTarget.APP;
  main.productType = '"com.apple.product-type.app-extension"';
  expect(() => configureIntentVocabulary(project)).toThrow('SIRI_VOCABULARY_MAIN_TARGET_MISSING');
  main.productType = '"com.apple.product-type.application"';
  main.buildPhases = [];
  expect(() => configureIntentVocabulary(project)).toThrow('SIRI_VOCABULARY_RESOURCES_MISSING');
});

test('artifact verification rejects missing locale, extension-only vocabulary and empty/misnamed examples', () => {
  writeIntentVocabulary(directory);
  const app = join(directory, 'Mnelo.app');
  mkdirSync(app);
  const source = join(directory, 'MneloSiri');
  const script = `import importlib.util,pathlib,sys
spec=importlib.util.spec_from_file_location('artifact',sys.argv[1])
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.verify_siri_vocabulary(pathlib.Path(sys.argv[2]))
`;
  const args = ['-c', script, resolve('scripts/verify-ios-artifact.py'), app];
  const rejected = (message) => {
    const result = spawnSync('python3', args, { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
  };
  cpSync(source, join(app, 'PlugIns/MneloIntents.appex'), { recursive: true });
  rejected('SIRI_VOCABULARY_MISSING_en');
  cpSync(source, app, { recursive: true });
  expect(() => execFileSync('python3', args, { stdio: 'pipe' })).not.toThrow();
  const ka = join(app, 'ka.lproj', 'AppIntentVocabulary.plist');
  rmSync(ka);
  rejected('SIRI_VOCABULARY_MISSING_ka');
  for (const IntentExamples of [[], [''], ['  '], [12]]) {
    writeFileSync(
      ka,
      plist.build({ IntentPhrases: [{ IntentName: 'INSendMessageIntent', IntentExamples }] }),
    );
    rejected('SIRI_INTENT_EXAMPLES_MISSING_ka');
  }
  writeFileSync(
    ka,
    plist.build({ IntentPhrases: [{ IntentName: 'INStartCallIntent', IntentExamples: ['Call'] }] }),
  );
  rejected('SIRI_SEND_MESSAGE_PHRASES_MISSING_ka');
});
