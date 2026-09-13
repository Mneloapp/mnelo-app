import { rulesInterpreter, validCoarseArea } from '../supabase/functions/_shared/intent';
const now = new Date('2026-09-07T21:30:00Z');
const interpret = (rawText: string, answers: { capability?: string; area?: string } = {}) =>
  rulesInterpreter.interpret({ rawText, mode: 'need', timeZone: 'Asia/Tbilisi', answers }, now);
describe('deterministic Connect interpretation', () => {
  test('preserves raw input and extracts only observed service facts', async () => {
    const raw = 'I need an electrician in Vake today to install two ceiling lights.';
    const result = await interpret(raw);
    expect(result).toMatchObject({
      rawText: raw,
      category: 'service',
      capability: 'Electrical installation',
      area: 'Vake',
      neededOn: '2026-09-08',
      details: 'install two ceiling lights',
      clarification: null,
    });
  });
  test.each([
    ['I need an accountant', 'professional', 'Accounting'],
    ['Find someone for tennis in Vake', 'social', 'Tennis'],
    ['I offer photography online', 'capability', 'Photography'],
    ['I want to volunteer', 'opportunity', 'Volunteering'],
    ['I can lend a bicycle in Tbilisi', 'product', 'Bicycle'],
    ['I need bookkeeping', 'professional', 'Accounting'],
  ])('supports %s', async (raw, category, capability) => {
    expect(await interpret(raw)).toMatchObject({ category, capability });
  });
  test('asks one missing fact at a time and respects explicit clarification', async () => {
    const raw = 'I need help';
    expect((await interpret(raw)).clarification).toBe('capability');
    expect((await interpret(raw, { capability: 'Plumbing' })).clarification).toBe('area');
    expect(await interpret(raw, { capability: 'Plumbing', area: 'Saburtalo' })).toMatchObject({
      clarification: null,
      capability: 'Plumbing',
      area: 'Saburtalo',
      rawText: raw,
    });
  });
  test('does not invent location, date, skills or model confidence', async () => {
    const result = await interpret('I need someone with a rare skill');
    expect(result).toMatchObject({
      capability: '',
      area: '',
      neededOn: null,
      clarification: 'capability',
    });
    expect(result).not.toHaveProperty('confidence');
  });
  test('understands supported Georgian terms and relative date', async () => {
    expect(await interpret('მჭირდება ელექტრიკოსი ვაკეში ხვალ')).toMatchObject({
      category: 'service',
      capability: 'Electrical installation',
      area: 'Vake',
      neededOn: '2026-09-09',
      clarification: null,
    });
  });
  test('does not turn a negated capability into an affirmative fact', async () => {
    expect((await interpret('I am not an electrician')).capability).toBe('');
    expect((await interpret('არ ვარ ელექტრიკოსი')).capability).toBe('');
  });
  test('asks about ambiguous multiple capabilities', async () => {
    expect((await interpret('I need a plumber or electrician in Vake')).clarification).toBe(
      'capability',
    );
  });
  test.each(['41.71,44.76', '12 Example Street', 'Rustaveli Avenue', 'ქუჩა რუსთაველი', '12345'])(
    'rejects exact-location-shaped area %s',
    (area) => {
      expect(validCoarseArea(area)).toBe(false);
    },
  );
  test('supports online and explicit valid date, rejects invalid calendar day', async () => {
    expect(await interpret('A chess partner online 2026-09-20')).toMatchObject({
      area: 'Online',
      neededOn: '2026-09-20',
      clarification: null,
    });
    expect((await interpret('Accountant 2026-02-30')).neededOn).toBeNull();
  });
});
