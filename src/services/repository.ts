import type {
  CallDetails,
  NotificationPreferences,
  ConnectionRequest,
  ConnectionState,
  BlockedProfile,
  ConnectionDetails,
  Review,
  Verification,
  Conversation,
  GroupDetails,
  DeviceSession,
  Interpretation,
  Match,
  Message,
  MessagePage,
  NeedMode,
  NeedOffer,
  PrivacySettings,
  Profile,
  ProfileIntent,
  ReportReason,
  Session,
} from '@/types/domain';
export interface MneloRepository {
  readonly mode: 'preview' | 'supabase' | 'unavailable';
  restoreSession(): Promise<Session | null>;
  watchSession(listener: (session: Session | null) => void): () => void;
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<Session>;
  logout(): Promise<void>;
  saveProfile(
    input: Pick<Profile, 'displayName' | 'username' | 'bio' | 'capabilities' | 'area'>,
  ): Promise<Profile>;
  updateProfilePreferences(languages: string[], availableToday: boolean): Promise<void>;
  uploadAvatar(bytes: ArrayBuffer): Promise<Profile>;
  avatarUrl(path: string): Promise<string>;
  profile(id: string): Promise<Profile>;
  searchProfiles(query: string): Promise<Profile[]>;
  conversation(id: string): Promise<Conversation>;
  conversations(cursor?: string): Promise<Conversation[]>;
  messages(conversationId: string, cursor?: string): Promise<MessagePage>;
  sendMessage(input: {
    conversationId: string;
    text: string;
    clientId: string;
    replyTo?: string;
  }): Promise<Message>;
  forwardMessage(messageId: string, conversationId: string, clientId: string): Promise<Message>;
  uploadAttachment(input: {
    conversationId: string;
    clientId: string;
    name: string;
    mime: string;
    bytes: ArrayBuffer;
  }): Promise<string>;
  sendAttachment(attachmentId: string, caption: string, clientId: string): Promise<Message>;
  attachment(id: string): Promise<{
    id: string;
    url: string;
    name: string;
    mime: string;
    size: number;
    duration: number | null;
  }>;
  sendLocation(input: {
    conversationId: string;
    clientId: string;
    latitude: number;
    longitude: number;
    label: string;
  }): Promise<Message>;
  sendContact(conversationId: string, profileId: string, clientId: string): Promise<Message>;
  react(messageId: string, emoji: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  markRead(conversationId: string, throughMessage?: string): Promise<void>;
  createGroup(name: string, members: string[], clientId: string): Promise<Conversation>;
  group(id: string): Promise<GroupDetails>;
  renameGroup(id: string, name: string): Promise<void>;
  addGroupMember(id: string, target: string): Promise<void>;
  manageGroupMember(
    id: string,
    target: string,
    action: 'remove' | 'promote' | 'demote',
  ): Promise<void>;
  leaveGroup(id: string): Promise<void>;
  setGroupAvatar(id: string, attachmentId: string | null): Promise<void>;
  interpret(text: string, mode: NeedMode): Promise<Interpretation>;
  clarify(mode: NeedMode, interpretation: Interpretation, answer: string): Promise<Interpretation>;
  need(id: string): Promise<NeedOffer>;
  saveNeed(mode: NeedMode, interpretation: Interpretation): Promise<NeedOffer>;
  matches(needId: string): Promise<Match[]>;
  profileIntents(id: string): Promise<ProfileIntent[]>;
  needs(cursor?: string): Promise<NeedOffer[]>;
  setNeedStatus(id: string, status: NeedOffer['status']): Promise<void>;
  requestConnection(
    recipientId: string,
    context: string,
    message: string,
    options?: { clientId: string; matchingRequestId?: string },
  ): Promise<ConnectionRequest>;
  relationship(target: string, matchingRequestId?: string): Promise<ConnectionState>;
  openDirectConversation(target: string): Promise<string>;
  requests(cursor?: string): Promise<ConnectionRequest[]>;
  respondRequest(id: string, action: 'accept' | 'decline' | 'cancel'): Promise<string | null>;
  connections(query?: string): Promise<Profile[]>;
  connectionDetails(conversationId: string): Promise<ConnectionDetails>;
  completedConnections(cursor?: string): Promise<ConnectionDetails[]>;
  confirmCompletion(connectionId: string): Promise<void>;
  submitReview(connectionId: string, rating: number, comment: string): Promise<string>;
  reviews(profileId: string, cursor?: string): Promise<Review[]>;
  verifications(profileId: string): Promise<Verification[]>;
  revealPhone(target: string): Promise<string | null>;
  privacy(): Promise<PrivacySettings>;
  updatePrivacy(settings: PrivacySettings): Promise<void>;
  startCall(conversation: string, media: 'voice' | 'video', clientId: string): Promise<string>;
  call(id: string): Promise<CallDetails>;
  respondCall(id: string, action: 'accept' | 'decline' | 'end' | 'failed'): Promise<void>;
  callToken(id: string): Promise<{ token: string; url: string }>;
  incomingCall(): Promise<string | null>;
  subscribeCalls(userId: string, listener: () => void): () => void;
  notificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(settings: NotificationPreferences): Promise<void>;
  registerDevice(input: {
    name: string;
    platform: 'ios' | 'android' | 'web';
    osVersion: string;
    locale?: 'en' | 'ka';
  }): Promise<string>;
  registerPush(device: string, token: string): Promise<void>;
  disablePush(): Promise<void>;
  resolveNotification(id: string): Promise<{ event: string; target: string } | null>;
  devices(cursor?: string): Promise<DeviceSession[]>;
  currentDeviceId(): Promise<string>;
  revokeOtherDevices(): Promise<void>;
  validateSession(): Promise<boolean>;
  forgetSession(): Promise<void>;
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;
  blockedProfiles(cursor?: string): Promise<BlockedProfile[]>;
  report(
    userId: string,
    reason: ReportReason,
    detail: string,
    options?: { clientId: string; messageId?: string },
  ): Promise<void>;
  requestAccountDeletion(): Promise<{ status: 'requested' | 'deleted' }>;
  pendingAccountDeletion(): Promise<boolean>;
  accountDeletionStatus(): Promise<'processing' | 'deleted' | 'not_found'>;
  clearAccountDeletionReceipt(): Promise<void>;
  subscribeInbox(
    userId: string,
    listener: (kind?: 'conversation' | 'request' | 'access') => void,
  ): () => void;
  subscribe(
    conversationId: string,
    listener: () => void,
    status?: (ready: boolean) => void,
  ): () => void;
}
export class RepositoryError extends Error {
  constructor(
    public readonly code:
      | 'PERMISSION_REQUIRED'
      | 'CAMERA_PERMISSION_REQUIRED'
      | 'LOCATION_PERMISSION_REQUIRED'
      | 'CONTACTS_PERMISSION_REQUIRED'
      | 'UNAVAILABLE'
      | 'UNAUTHORIZED'
      | 'INVALID'
      | 'EXPIRED'
      | 'RATE_LIMITED'
      | 'CONFLICT'
      | 'FORBIDDEN'
      | 'OFFLINE'
      | 'QUEUE_FULL',
  ) {
    super(code);
    this.name = 'RepositoryError';
  }
}
