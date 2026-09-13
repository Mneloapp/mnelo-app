// Pure deterministic provider. No model, network, secret or database dependency.
export type IntentCategory =
  'service' | 'professional' | 'social' | 'capability' | 'opportunity' | 'product';
export type IntentAnswers = { capability?: string; area?: string };
export interface IntentInput {
  rawText: string;
  mode: 'need' | 'offer';
  timeZone: string;
  answers: IntentAnswers;
}
export interface IntentResult {
  category: IntentCategory;
  capability: string;
  area: string;
  when: string;
  neededOn: string | null;
  details: string;
  rawText: string;
  clarification: 'capability' | 'area' | null;
  version: string;
}
export interface IntentInterpreter {
  readonly version: string;
  interpret(input: IntentInput, now: Date): Promise<IntentResult>;
}
const rules: { category: IntentCategory; term: string; pattern: RegExp; local: boolean }[] = [
  {
    category: 'service',
    term: 'Electrical installation',
    pattern: /electrician|electrical|ელექტრიკოს|ელექტრო/u,
    local: true,
  },
  { category: 'service', term: 'Plumbing', pattern: /plumber|plumbing|სანტექნ/u, local: true },
  { category: 'service', term: 'Cleaning', pattern: /cleaner|cleaning|დასუფთავ/u, local: true },
  {
    category: 'service',
    term: 'Vehicle repair',
    pattern: /mechanic|car repair|ავტომექან/u,
    local: true,
  },
  {
    category: 'service',
    term: 'Moving assistance',
    pattern: /moving help|movers|გადაზიდ/u,
    local: true,
  },
  {
    category: 'professional',
    term: 'Legal services',
    pattern: /lawyer|legal advice|ადვოკატ|იურისტ/u,
    local: false,
  },
  {
    category: 'professional',
    term: 'Accounting',
    pattern: /accountant|bookkeeping|ბუღალტერ/u,
    local: false,
  },
  {
    category: 'professional',
    term: 'Software development',
    pattern: /developer|programmer|software|პროგრამისტ/u,
    local: false,
  },
  {
    category: 'professional',
    term: 'Design',
    pattern: /designer|graphic design|დიზაინერ/u,
    local: false,
  },
  { category: 'professional', term: 'Tutoring', pattern: /tutor|teacher|მასწავლებ/u, local: false },
  { category: 'social', term: 'Tennis', pattern: /tennis|ჩოგბურთ/u, local: true },
  { category: 'social', term: 'Hiking', pattern: /hiking|hike|ლაშქრობ/u, local: true },
  { category: 'social', term: 'Chess', pattern: /chess|ჭადრაკ/u, local: false },
  { category: 'social', term: 'Running', pattern: /running partner|jogging|სირბილ/u, local: true },
  {
    category: 'social',
    term: 'Language exchange',
    pattern: /language exchange|ენის გაცვლა/u,
    local: false,
  },
  { category: 'capability', term: 'Photography', pattern: /photograph|ფოტოგრაფ/u, local: false },
  {
    category: 'capability',
    term: 'Translation',
    pattern: /translat|თარჯიმან|თარგმან/u,
    local: false,
  },
  { category: 'capability', term: 'Cooking', pattern: /cook|chef|მზარეულ/u, local: false },
  {
    category: 'capability',
    term: 'Music',
    pattern: /musician|guitar|piano|მუსიკოს|გიტარ/u,
    local: false,
  },
  { category: 'opportunity', term: 'Volunteering', pattern: /volunteer|მოხალის/u, local: false },
  { category: 'opportunity', term: 'Internship', pattern: /internship|სტაჟირ/u, local: false },
  {
    category: 'opportunity',
    term: 'Collaboration',
    pattern: /collaborat|თანამშრომლობ/u,
    local: false,
  },
  { category: 'product', term: 'Bicycle', pattern: /bicycle|bike|ველოსიპედ/u, local: true },
  { category: 'product', term: 'Laptop', pattern: /laptop|ლეპტოპ|ნოუთბუქ/u, local: false },
  { category: 'product', term: 'Furniture', pattern: /furniture|ავეჯ/u, local: true },
  { category: 'product', term: 'Books', pattern: /\bbooks?\b|წიგნ/u, local: false },
];
const areas: [string, RegExp][] = [
  ['Vake', /\bvake\b|ვაკე/u],
  ['Saburtalo', /\bsaburtalo\b|საბურთალო/u],
  ['Gldani', /\bgldani\b|გლდანი/u],
  ['Didube', /\bdidube\b|დიდუბე/u],
  ['Tbilisi', /\btbilisi\b|თბილის/u],
  ['Batumi', /\bbatumi\b|ბათუმ/u],
  ['Kutaisi', /\bkutaisi\b|ქუთაის/u],
  ['Rustavi', /\brustavi\b|რუსთავი/u],
];
export function validCoarseArea(area: string): boolean {
  return (
    area.length <= 120 &&
    /^[\p{L}\p{M} .'-]+$/u.test(area) &&
    !/\b(street|avenue|road|apartment|house|floor|unit|apt|ave|rd|st)\b|ქუჩა|გამზირი|ბინა|სართული/iu.test(
      area,
    )
  );
}

function present(pattern: RegExp, text: string) {
  const m = pattern.exec(text);
  if (!m) return false;
  return !/(?:\b(?:not|no|without|don't|do not)\s+(?:an?\s+)?|არ\s+(?:(?:ვარ|მინდა|მჭირდება)\s+)?)$/u.test(
    text.slice(Math.max(0, m.index - 30), m.index),
  );
}
function dateInZone(now: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map((key) => parts.find((p) => p.type === key)!.value).join('-');
}
export const rulesInterpreter: IntentInterpreter = {
  version: 'rules-v1',
  async interpret(input, now) {
    const text = input.rawText.normalize('NFKC').toLowerCase();
    const initialHits = rules.filter((rule) => present(rule.pattern, text));
    const answerText = (input.answers.capability ?? '').normalize('NFKC').toLowerCase();
    const hits = initialHits.length
      ? initialHits
      : rules.filter((rule) => present(rule.pattern, answerText));
    const opportunity =
      /\b(job|work opportunity|internship|volunteer|collaborat\w*)\b|ვაკანსია|სტაჟირ|მოხალის|თანამშრომლობ/u.test(
        text,
      );
    const category: IntentCategory = opportunity
      ? 'opportunity'
      : (hits[0]?.category ?? 'capability');
    const uniqueTerms = [...new Set(hits.map((h) => h.term))];
    const capability =
      input.answers.capability?.trim() || (uniqueTerms.length === 1 ? uniqueTerms[0]! : '');
    const remote = /\b(online|remote|anywhere)\b|ონლაინ|დისტანციურ/u.test(text);
    const foundArea = areas.find(([, pattern]) => pattern.test(text))?.[0];
    const area = remote ? 'Online' : (foundArea ?? input.answers.area?.trim() ?? '');
    if (area && !validCoarseArea(area)) throw new Error('INVALID_AREA');
    // Resolve relative days in the user's IANA timezone; never guess an unspecified time.
    const today = dateInZone(now, input.timeZone);
    let neededOn: string | null = null;
    if (/\btoday\b|დღეს/u.test(text)) neededOn = today;
    else if (/\btomorrow\b|ხვალ/u.test(text))
      neededOn = new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    else {
      const explicit = /\b(\d{4}-\d{2}-\d{2})\b/u.exec(text)?.[1];
      if (
        explicit &&
        Number.isFinite(Date.parse(explicit)) &&
        new Date(explicit).toISOString().slice(0, 10) === explicit
      )
        neededOn = explicit;
    }
    const needsArea = hits.some((h) => h.local) && !opportunity;
    const details =
      /\bto\s+((?:install|repair|fix|help|move|clean)\b[^.!?]*)/iu.exec(input.rawText)?.[1] ??
      input.rawText;
    return {
      category,
      capability,
      area,
      neededOn,
      when: neededOn ?? '',
      details,
      rawText: input.rawText,
      clarification: !capability ? 'capability' : needsArea && !area ? 'area' : null,
      version: this.version,
    };
  },
};
