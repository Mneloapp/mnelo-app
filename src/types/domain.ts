export type UserId = string;
export type NeedMode = 'need' | 'offer';
export type Discoverability = 'relevant' | 'everyone' | 'nobody';
export type RequestAudience = 'relevant' | 'mutual' | 'everyone';
export type Profile = {
  id: UserId;
  displayName: string;
  username: string;
  bio: string;
  area: string;
  capabilities: string[];
  languages: string[];
  avatarPath: string | null;
  availableToday: boolean;
  verified: boolean;
  reviewCount: number;
  averageRating: number | null;
};
export type PrivacySettings = {
  discoverability: Discoverability;
  phoneVisibility: 'nobody' | 'connections';
  exactLocation: 'never';
  requestAudience: RequestAudience;
};
export type Conversation = {
  id: string;
  kind: 'direct' | 'group';
  title: string;
  memberIds: UserId[];
  preview: string;
  previewKind?: Message['kind'] | 'deleted' | null;
  updatedAt: string;
  unreadCount: number;
};
export type MessageKind = 'text' | 'image' | 'file' | 'voice' | 'location' | 'contact' | 'call';
export type Message = {
  id: string;
  conversationId: string;
  senderId: UserId;
  kind: MessageKind;
  text: string;
  createdAt: string;
  clientId: string;
  replyTo: string | null;
  deletedAt: string | null;
  status: 'pending' | 'sent' | 'failed';
  attachmentId: string | null;
  durationSeconds: number | null;
  location: { latitude: number; longitude: number; label: string } | null;
  contact: { name: string; username: string } | null;
  readBy?: UserId[];
  reactions: { emoji: string; userId: UserId }[];
};
export type MessagePage = { items: Message[]; nextCursor: string | null };
export type Interpretation = {
  clientId?: string;
  timeZone?: string;
  answers?: { capability?: string; area?: string };
  neededOn?: string | null;
  version?: string;
  category: 'service' | 'professional' | 'social' | 'capability' | 'opportunity' | 'product';
  capability: string;
  area: string;
  when: string;
  details: string;
  rawText: string;
  clarification: 'capability' | 'area' | null;
};
export type NeedOffer = {
  id: string;
  ownerId: UserId;
  mode: NeedMode;
  rawText: string;
  interpretation: Interpretation;
  status: 'active' | 'paused' | 'closed';
  createdAt: string;
};
export type MatchEvidence = {
  signal:
    | 'capability'
    | 'offer'
    | 'need'
    | 'area'
    | 'availability'
    | 'language'
    | 'connection'
    | 'review';
  fact: string;
  count: number | null;
  number: number | null;
};
export type ProfileIntent = {
  id: string;
  mode: NeedMode;
  capability: string;
  area: string;
  neededOn: string | null;
};
export type Match = {
  profile: Profile;
  reasons: MatchEvidence[];
  rank: 'strong' | 'good' | 'possible';
};
export type ConnectionRequest = {
  id: string;
  senderId: UserId;
  recipientId: UserId;
  context: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  createdAt: string;
};
export type DeviceSession = {
  osVersion: string;
  createdAt: string;
  id: string;
  label: string;
  platform: string;
  lastActiveAt: string;
  current: boolean;
};
export type ReportReason = 'spam' | 'fraud' | 'harassment' | 'impersonation' | 'unsafe' | 'other';
export type Session = { userId: string; profile: Profile | null };

export interface GroupDetails {
  id: string;
  title: string;
  avatarId: string | null;
  members: { id: string; displayName: string; username: string; role: 'member' | 'admin' }[];
}

export type ConnectionState = {
  connected: boolean;
  conversationId: string | null;
  pendingRequestId: string | null;
  incoming: boolean;
  canRequest: boolean;
  context: string | null;
};

export type ConnectionDetails = {
  id: string;
  conversationId: string;
  peerId: string;
  displayName: string;
  username: string;
  context: string;
  purpose: 'social' | 'service' | 'business';
  completedAt: string | null;
  confirmedByMe: boolean;
  confirmedByPeer: boolean;
  review: { id: string; rating: number; comment: string } | null;
};
export type Review = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  purpose: 'service' | 'business';
  own: boolean;
};
export type Verification = {
  type: 'identity' | 'professional' | 'business';
  verifiedAt: string;
  expiresAt: string | null;
};

export type BlockedProfile = {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  createdAt: string;
};

export interface NotificationPreferences {
  messages: boolean;
  requests: boolean;
  matches: boolean;
  calls: boolean;
}

export interface CallDetails {
  id: string;
  conversationId: string;
  peerId: string;
  peerName: string;
  media: 'voice' | 'video';
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'failed' | 'missed';
  incoming: boolean;
  canJoin: boolean;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}
