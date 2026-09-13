import { createPreviewRepository } from '@/services/preview-repository';
import { hasConnection } from '@/lib/connectivity';
const phone = '+995555010101';
async function signedIn() {
  const r = createPreviewRepository(true);
  await r.requestOtp(phone);
  await r.verifyOtp(phone, '123456');
  await r.saveProfile({
    displayName: 'Preview user',
    username: 'preview_user',
    bio: '',
    area: 'Vake',
    capabilities: [],
  });
  return r;
}
afterEach(() => jest.restoreAllMocks());
it('refuses a preview factory without explicit local permission', () => {
  expect(() => createPreviewRepository(false)).toThrow('FORBIDDEN');
});
it('requires a session for preview conversations', async () => {
  await expect(createPreviewRepository(true).conversations()).rejects.toThrow('UNAUTHORIZED');
});
it('rejects invalid OTP and throttles resend', async () => {
  const r = createPreviewRepository(true);
  await r.requestOtp(phone);
  await expect(r.verifyOtp(phone, '000000')).rejects.toThrow('INVALID');
  await expect(r.requestOtp(phone)).rejects.toThrow('RATE_LIMITED');
});
it('expires a preview OTP without falsely authenticating', async () => {
  const r = createPreviewRepository(true);
  await r.requestOtp(phone);
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
  await expect(r.verifyOtp(phone, '123456')).rejects.toThrow('EXPIRED');
});
it('deduplicates retries of a message client ID', async () => {
  const r = await signedIn();
  const input = {
    conversationId: 'preview-chat',
    text: 'A development test',
    clientId: 'same-client-id',
  };
  const first = await r.sendMessage(input);
  const second = await r.sendMessage(input);
  expect(second.id).toBe(first.id);
  expect(
    (await r.messages('preview-chat')).items.filter((m) => m.clientId === input.clientId),
  ).toHaveLength(1);
});
it('does not allow sending into an unrelated conversation', async () => {
  const r = await signedIn();
  await expect(
    r.sendMessage({ conversationId: 'unrelated', text: 'test', clientId: 'id' }),
  ).rejects.toThrow('FORBIDDEN');
});
it('accepting a received request establishes a conversation', async () => {
  const r = await signedIn();
  const conversationId = await r.respondRequest('preview-request', 'accept');
  expect(
    (await r.conversations()).some(
      (c) => c.id === conversationId && c.memberIds.includes('preview-giorgi'),
    ),
  ).toBe(true);
});
it('cannot self-accept an outgoing connection request', async () => {
  const r = await signedIn();
  const request = await r.requestConnection('preview-luka', 'Electrical work', '');
  await expect(r.respondRequest(request.id, 'accept')).rejects.toThrow('FORBIDDEN');
});
it('matching explanations only contain actual profile capabilities', async () => {
  const r = await signedIn();
  const interpreted = await r.interpret('I need an electrician in Vake today', 'need');
  const need = await r.saveNeed('need', interpreted);
  const matches = await r.matches(need.id);
  expect(matches).toHaveLength(2);
  expect(
    matches.every(
      (m) =>
        m.reasons.every(
          (reason) =>
            reason.signal === 'capability' && m.profile.capabilities.includes(reason.fact),
        ) && !m.profile.verified,
    ),
  ).toBe(true);
});
it('blocks a preview user from subsequent discovery', async () => {
  const r = await signedIn();
  await r.block('preview-giorgi');
  expect((await r.searchProfiles('giorgi')).length).toBe(0);
  await expect(r.requestConnection('preview-giorgi', 'work', '')).rejects.toThrow('FORBIDDEN');
});
it('never pretends an unavailable account deletion completed', async () => {
  const r = await signedIn();
  await expect(r.requestAccountDeletion()).rejects.toThrow('UNAVAILABLE');
  expect(await r.restoreSession()).not.toBeNull();
});
it('does not treat a disabled internet probe as a lost connection', () => {
  expect(hasConnection({ isConnected: true })).toBe(true);
  expect(hasConnection({ isConnected: null })).toBe(true);
  expect(hasConnection({ isConnected: false })).toBe(false);
});
