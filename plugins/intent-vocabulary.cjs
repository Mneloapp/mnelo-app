const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;

const filename = 'AppIntentVocabulary.plist';
const sourceDirectory = 'MneloSiri';
// Static examples only. Never publish a user's contacts as global vocabulary.
// Apple specifies this localized resource in the main iOS app bundle:
// https://developer.apple.com/documentation/sirikit/global-vocabulary-reference
const examples = {
  en: [
    "Reply to Alex with Mnelo: I'll call you back.",
    "Send Alex a message with Mnelo saying I can't talk right now.",
  ],
  ka: [
    'Mnelo-თ უპასუხე ნინოს: მოგვიანებით გადმოგირეკავ.',
    'Mnelo-თ მისწერე ნინოს, რომ ახლა ვერ ვსაუბრობ.',
  ],
};

function writeIntentVocabulary(platformProjectRoot) {
  for (const [locale, phrases] of Object.entries(examples)) {
    const directory = path.join(platformProjectRoot, sourceDirectory, `${locale}.lproj`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, filename),
      plist.build({
        IntentPhrases: [{ IntentName: 'INSendMessageIntent', IntentExamples: phrases }],
      }),
    );
  }
}

function configureIntentVocabulary(project) {
  const objects = project.hash.project.objects;
  const main = project.getFirstTarget().firstTarget;
  if (String(main.productType).replaceAll('"', '') !== 'com.apple.product-type.application')
    throw new Error('SIRI_VOCABULARY_MAIN_TARGET_MISSING');
  const resources = main.buildPhases
    .map((ref) => objects.PBXResourcesBuildPhase?.[ref.value])
    .find(Boolean);
  if (!resources) throw new Error('SIRI_VOCABULARY_RESOURCES_MISSING');
  objects.PBXVariantGroup ??= {};
  let variant = Object.entries(objects.PBXVariantGroup).find(
    ([key, value]) =>
      !key.endsWith('_comment') && String(value.name).replaceAll('"', '') === filename,
  );
  if (!variant) {
    const id = project.generateUuid();
    const value = { isa: 'PBXVariantGroup', children: [], name: filename, sourceTree: '"<group>"' };
    objects.PBXVariantGroup[id] = value;
    objects.PBXVariantGroup[`${id}_comment`] = filename;
    variant = [id, value];
  }
  const projectObject = project.getFirstProject().firstProject;
  const group = objects.PBXGroup[projectObject.mainGroup];
  if (!group.children.some((ref) => ref.value === variant[0]))
    group.children.push({ value: variant[0], comment: filename });
  for (const locale of Object.keys(examples)) {
    const qualified = `${sourceDirectory}/${locale}.lproj/${filename}`;
    let reference = Object.entries(objects.PBXFileReference).find(
      ([key, value]) =>
        !key.endsWith('_comment') && String(value.path).replaceAll('"', '') === qualified,
    );
    if (!reference) {
      const id = project.generateUuid();
      const value = {
        isa: 'PBXFileReference',
        name: locale,
        path: `"${qualified}"`,
        sourceTree: 'SOURCE_ROOT',
        lastKnownFileType: 'text.plist.xml',
      };
      objects.PBXFileReference[id] = value;
      objects.PBXFileReference[`${id}_comment`] = locale;
      reference = [id, value];
    }
    if (!variant[1].children.some((ref) => ref.value === reference[0]))
      variant[1].children.push({ value: reference[0], comment: locale });
    projectObject.knownRegions ??= [];
    if (!projectObject.knownRegions.includes(locale)) projectObject.knownRegions.push(locale);
  }
  let build = Object.entries(objects.PBXBuildFile).find(
    ([key, value]) => !key.endsWith('_comment') && value.fileRef === variant[0],
  );
  if (!build) {
    const id = project.generateUuid();
    const value = { isa: 'PBXBuildFile', fileRef: variant[0], fileRef_comment: filename };
    objects.PBXBuildFile[id] = value;
    objects.PBXBuildFile[`${id}_comment`] = `${filename} in Resources`;
    build = [id, value];
  }
  if (!resources.files.some((ref) => ref.value === build[0]))
    resources.files.push({ value: build[0], comment: `${filename} in Resources` });
}

module.exports = { writeIntentVocabulary, configureIntentVocabulary };
