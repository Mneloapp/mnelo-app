import { unavailableRepository } from './unavailable-repository';
import type { MneloRepository } from './repository';
import { RepositoryError } from './repository';
import type {
  ConnectionRequest,
  Conversation,
  Interpretation,
  Message,
  NeedOffer,
  PrivacySettings,
  Profile,
  Session,
} from '@/types/domain';
const now = () => new Date().toISOString();
let sequence = 0;
const id = () => 'preview-' + ++sequence;
const self: Profile = {
  id: 'preview-self',
  displayName: 'Nika',
  username: 'nika_preview',
  bio: '',
  area: 'Vake',
  capabilities: [],
  languages: ['en'],
  avatarPath: null,
  availableToday: false,
  verified: false,
  reviewCount: 0,
  averageRating: null,
};
// Explicit local-only UI fixtures. Factory refuses release or configured-backend use.
export function createPreviewRepository(allowed: boolean): MneloRepository {
  if (!__DEV__ || !allowed) throw new RepositoryError('FORBIDDEN');
  let session: Session | null = null;
  const people: Profile[] = [
    self,
    {
      ...self,
      id: 'preview-giorgi',
      displayName: 'Giorgi',
      username: 'giorgi_preview',
      capabilities: ['Residential electrical installation'],
      availableToday: true,
    },
    {
      ...self,
      id: 'preview-mariam',
      displayName: 'Mariam',
      username: 'mariam_preview',
      capabilities: ['Photography'],
      area: 'Vera',
    },
    {
      ...self,
      id: 'preview-luka',
      displayName: 'Luka',
      username: 'luka_preview',
      capabilities: ['Residential electrical installation'],
      availableToday: false,
    },
  ];
  const conversations: Conversation[] = [
    {
      id: 'preview-chat',
      kind: 'direct',
      title: 'Mariam',
      memberIds: [self.id, 'preview-mariam'],
      preview: 'See you tomorrow.',
      updatedAt: now(),
      unreadCount: 1,
    },
  ];
  const messages: Message[] = [
    {
      id: 'preview-message',
      conversationId: 'preview-chat',
      senderId: 'preview-mariam',
      kind: 'text',
      text: 'See you tomorrow.',
      createdAt: now(),
      clientId: 'preview-message',
      replyTo: null,
      deletedAt: null,
      status: 'sent',
      attachmentId: null,
      durationSeconds: null,
      location: null,
      contact: null,
      reactions: [],
    },
  ];
  const needs: NeedOffer[] = [];
  const requests: ConnectionRequest[] = [
    {
      id: 'preview-request',
      senderId: 'preview-giorgi',
      recipientId: self.id,
      context: 'Residential electrical installation in Vake',
      message: 'Development sample request',
      status: 'pending',
      createdAt: now(),
    },
  ];
  const blocked = new Set<string>();
  let privacy: PrivacySettings = {
    discoverability: 'relevant',
    phoneVisibility: 'nobody',
    exactLocation: 'never',
    requestAudience: 'relevant',
  };
  let otpAt = 0;
  const listeners = new Set<() => void>();
  const auth = () => {
    if (!session) throw new RepositoryError('UNAUTHORIZED');
    return session;
  };
  const profile = (personId: string) => {
    const p = people.find((p) => p.id === personId);
    if (!p || blocked.has(personId)) throw new RepositoryError('FORBIDDEN');
    return { ...p };
  };
  return {
    ...unavailableRepository(),
    mode: 'preview',
    forwardMessage: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    uploadAttachment: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    sendAttachment: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    attachment: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    sendLocation: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    sendContact: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    updateProfilePreferences: async () => undefined,
    uploadAvatar: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    avatarUrl: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    watchSession: () => () => undefined,
    async restoreSession() {
      return session;
    },
    async requestOtp(phone) {
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new RepositoryError('INVALID');
      if (Date.now() - otpAt < 30000) throw new RepositoryError('RATE_LIMITED');
      otpAt = Date.now();
    },
    async verifyOtp(_phone, code) {
      if (Date.now() - otpAt > 300000) throw new RepositoryError('EXPIRED');
      if (code !== '123456') throw new RepositoryError('INVALID');
      session = { userId: self.id, profile: null };
      return session;
    },
    async logout() {
      session = null;
    },
    async saveProfile(input) {
      auth();
      if (!/^[a-z][a-z0-9_]{2,23}$/.test(input.username) || !input.displayName.trim())
        throw new RepositoryError('INVALID');
      if (people.some((p) => p.id !== self.id && p.username === input.username))
        throw new RepositoryError('CONFLICT');
      Object.assign(self, input);
      session = { userId: self.id, profile: { ...self } };
      return { ...self };
    },
    async profile(personId) {
      auth();
      return profile(personId);
    },
    async searchProfiles(query) {
      auth();
      const q = query.replace(/^@/, '').toLowerCase();
      return people.filter(
        (p) =>
          p.id !== self.id &&
          !blocked.has(p.id) &&
          (p.username.includes(q) || p.displayName.toLowerCase().includes(q)),
      );
    },
    async conversation(id) {
      auth();
      const c = conversations.find((c) => c.id === id && c.memberIds.includes(self.id));
      if (!c) throw new RepositoryError('FORBIDDEN');
      return { ...c };
    },
    async conversations() {
      auth();
      return conversations
        .map((c) => ({ ...c }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async messages(conversationId, cursor) {
      auth();
      if (!conversations.some((c) => c.id === conversationId && c.memberIds.includes(self.id)))
        throw new RepositoryError('FORBIDDEN');
      const items = messages
        .filter((m) => m.conversationId === conversationId && (!cursor || m.createdAt < cursor))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30);
      return {
        items: JSON.parse(JSON.stringify(items)) as Message[],
        nextCursor: items.length === 30 ? items.at(-1)!.createdAt : null,
      };
    },
    async sendMessage(input) {
      auth();
      const c = conversations.find(
        (c) => c.id === input.conversationId && c.memberIds.includes(self.id),
      );
      if (!c || c.memberIds.some((p) => blocked.has(p))) throw new RepositoryError('FORBIDDEN');
      const existing = messages.find((m) => m.clientId === input.clientId);
      if (existing) return existing;
      if (!input.text.trim()) throw new RepositoryError('INVALID');
      const m: Message = {
        id: id(),
        conversationId: c.id,
        senderId: self.id,
        kind: 'text',
        text: input.text.trim(),
        createdAt: now(),
        clientId: input.clientId,
        replyTo: input.replyTo ?? null,
        deletedAt: null,
        status: 'sent',
        attachmentId: null,
        durationSeconds: null,
        location: null,
        contact: null,
        reactions: [],
      };
      messages.push(m);
      c.preview = m.text;
      c.updatedAt = m.createdAt;
      listeners.forEach((fn) => fn());
      return m;
    },
    async react(messageId, emoji) {
      auth();
      const m = messages.find((m) => m.id === messageId);
      if (!m) throw new RepositoryError('INVALID');
      const existing = m.reactions.findIndex((r) => r.userId === self.id && r.emoji === emoji);
      if (existing >= 0) m.reactions.splice(existing, 1);
      else m.reactions.push({ emoji, userId: self.id });
      listeners.forEach((fn) => fn());
    },
    async deleteMessage(messageId) {
      auth();
      const m = messages.find((m) => m.id === messageId && m.senderId === self.id);
      if (!m) throw new RepositoryError('FORBIDDEN');
      m.deletedAt = now();
      m.text = '';
      listeners.forEach((fn) => fn());
    },
    async markRead(conversationId) {
      auth();
      const c = conversations.find((c) => c.id === conversationId);
      if (c) c.unreadCount = 0;
    },
    group: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    renameGroup: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    addGroupMember: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    manageGroupMember: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    leaveGroup: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    setGroupAvatar: async () => {
      throw new RepositoryError('UNAVAILABLE');
    },
    async createGroup(name, members) {
      auth();
      const memberIds = [...new Set([self.id, ...members])];
      if (!name.trim() || memberIds.length < 3) throw new RepositoryError('INVALID');
      const c: Conversation = {
        id: id(),
        kind: 'group',
        title: name.trim(),
        memberIds,
        preview: '',
        updatedAt: now(),
        unreadCount: 0,
      };
      conversations.unshift(c);
      return c;
    },
    async clarify(mode, interpretation, answer) {
      const field = interpretation.clarification;
      if (!field) throw new RepositoryError('INVALID');
      return {
        ...interpretation,
        [field]: answer.trim(),
        clarification: field === 'capability' && !interpretation.area ? 'area' : null,
      };
    },
    async need(needId) {
      const value = needs.find((n) => n.id === needId);
      if (!value) throw new RepositoryError('INVALID');
      return value;
    },
    async interpret(text) {
      auth();
      const electrical = /electric|ელექტრ/i.test(text);
      const result: Interpretation = {
        category: 'service',
        capability: electrical ? 'Residential electrical installation' : '',
        area: /vake|ვაკე/i.test(text) ? 'Vake' : '',
        when: /today|დღეს/i.test(text) ? 'Today' : '',
        details: text,
        rawText: text,
        clarification: electrical ? (/vake|ვაკე/i.test(text) ? null : 'area') : 'capability',
      };
      return result;
    },
    async saveNeed(mode, interpretation) {
      auth();
      const need: NeedOffer = {
        id: id(),
        ownerId: self.id,
        mode,
        rawText: interpretation.rawText,
        interpretation,
        status: 'active',
        createdAt: now(),
      };
      needs.unshift(need);
      return need;
    },
    async profileIntents() {
      return [];
    },
    async matches(needId) {
      auth();
      const need = needs.find((n) => n.id === needId);
      if (!need) throw new RepositoryError('INVALID');
      return people
        .filter(
          (p) =>
            p.id !== self.id &&
            !blocked.has(p.id) &&
            p.capabilities.some(
              (c) => c.toLowerCase() === need.interpretation.capability.toLowerCase(),
            ),
        )
        .map((p) => ({
          profile: p,
          reasons: p.capabilities
            .filter((c) => c.toLowerCase() === need.interpretation.capability.toLowerCase())
            .map((fact) => ({ signal: 'capability' as const, fact, count: null, number: null })),
          rank: p.availableToday ? ('strong' as const) : ('good' as const),
        }));
    },
    async needs() {
      auth();
      return [...needs];
    },
    async setNeedStatus(needId, status) {
      auth();
      const n = needs.find((n) => n.id === needId);
      if (n) n.status = status;
    },
    async relationship(target, matchingRequestId) {
      auth();
      profile(target);
      const conversation = conversations.find(
        (c) => c.kind === 'direct' && c.memberIds.includes(target),
      );
      const pending = requests.find(
        (r) => r.status === 'pending' && (r.senderId === target || r.recipientId === target),
      );
      const need = needs.find((n) => n.id === matchingRequestId);
      return {
        connected: Boolean(conversation),
        conversationId: conversation?.id ?? null,
        pendingRequestId: pending?.id ?? null,
        incoming: pending?.recipientId === self.id,
        canRequest: !conversation && !pending && !blocked.has(target),
        context: need
          ? [need.interpretation.capability, need.interpretation.area, need.interpretation.when]
              .filter(Boolean)
              .join('\n')
          : null,
      };
    },
    async openDirectConversation(target) {
      auth();
      profile(target);
      const conversation = conversations.find(
        (c) => c.kind === 'direct' && c.memberIds.includes(target),
      );
      if (!conversation || blocked.has(target)) throw new RepositoryError('FORBIDDEN');
      return conversation.id;
    },
    async requestConnection(recipientId, context, message) {
      auth();
      profile(recipientId);
      if (requests.some((r) => r.recipientId === recipientId && r.status === 'pending'))
        throw new RepositoryError('CONFLICT');
      const r: ConnectionRequest = {
        id: id(),
        senderId: self.id,
        recipientId,
        context,
        message,
        status: 'pending',
        createdAt: now(),
      };
      requests.push(r);
      return r;
    },
    async requests() {
      auth();
      return [...requests];
    },
    async respondRequest(requestId, action) {
      auth();
      const r = requests.find((r) => r.id === requestId && r.status === 'pending');
      if (!r) throw new RepositoryError('INVALID');
      if (
        (action === 'cancel' && r.senderId !== self.id) ||
        (action !== 'cancel' && r.recipientId !== self.id)
      )
        throw new RepositoryError('FORBIDDEN');
      r.status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled';
      if (action !== 'accept') return null;
      const peer = r.senderId === self.id ? r.recipientId : r.senderId;
      const c: Conversation = {
        id: id(),
        title: profile(peer).displayName,
        kind: 'direct',
        memberIds: [self.id, peer],
        preview: '',
        updatedAt: now(),
        unreadCount: 0,
      };
      conversations.push(c);
      return c.id;
    },
    async connections() {
      auth();
      const ids = new Set(
        conversations.filter((c) => c.kind === 'direct').flatMap((c) => c.memberIds),
      );
      return people.filter((p) => p.id !== self.id && ids.has(p.id) && !blocked.has(p.id));
    },
    async connectionDetails(conversationId) {
      auth();
      const c = conversations.find((c) => c.id === conversationId && c.kind === 'direct');
      const peerId = c?.memberIds.find((p) => p !== self.id);
      if (!c || !peerId) throw new RepositoryError('FORBIDDEN');
      const p = profile(peerId);
      return {
        id: c.id,
        conversationId: c.id,
        peerId,
        displayName: p.displayName,
        username: p.username,
        context: '',
        purpose: 'social',
        completedAt: null,
        confirmedByMe: false,
        confirmedByPeer: false,
        review: null,
      };
    },
    async completedConnections() {
      auth();
      return [];
    },
    async confirmCompletion() {
      throw new RepositoryError('UNAVAILABLE');
    },
    async submitReview() {
      throw new RepositoryError('UNAVAILABLE');
    },
    async reviews() {
      auth();
      return [];
    },
    async verifications() {
      auth();
      return [];
    },
    async revealPhone() {
      auth();
      return null;
    },
    async privacy() {
      auth();
      return { ...privacy };
    },
    async updatePrivacy(value) {
      auth();
      privacy = { ...value };
    },
    async notificationPreferences() {
      return { messages: true, requests: true, matches: true, calls: true };
    },
    async updateNotificationPreferences() {
      throw new RepositoryError('UNAVAILABLE');
    },
    async registerDevice() {
      throw new RepositoryError('UNAVAILABLE');
    },
    async registerPush() {
      throw new RepositoryError('UNAVAILABLE');
    },
    async disablePush() {
      throw new RepositoryError('UNAVAILABLE');
    },
    async resolveNotification() {
      return null;
    },
    async devices() {
      auth();
      return [
        {
          id: 'preview-device',
          osVersion: '',
          createdAt: new Date().toISOString(),
          label: 'Development preview',
          platform: 'Preview',
          lastActiveAt: now(),
          current: true,
        },
      ];
    },
    async validateSession() {
      return Boolean(session);
    },
    async forgetSession() {
      session = null;
    },
    async revokeOtherDevices() {
      throw new RepositoryError('UNAVAILABLE');
    },
    async block(personId) {
      auth();
      if (personId === self.id) throw new RepositoryError('INVALID');
      blocked.add(personId);
    },
    async unblock(personId) {
      auth();
      blocked.delete(personId);
    },
    async blockedProfiles() {
      auth();
      return people
        .filter((p) => blocked.has(p.id))
        .map((p) => ({
          id: p.id,
          userId: p.id,
          displayName: p.displayName,
          username: p.username,
          createdAt: now(),
        }));
    },
    async report(personId) {
      auth();
      if (personId === self.id) throw new RepositoryError('INVALID');
    },
    async requestAccountDeletion() {
      auth();
      throw new RepositoryError('UNAVAILABLE');
    },
    subscribeInbox(_userId, listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribe(_conversationId, listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
