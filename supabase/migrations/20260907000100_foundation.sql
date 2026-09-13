-- Mnelo V1 relational foundation. Identity is derived from Auth, never client roles.
create schema if not exists private;
-- Supabase may also install global default grants; schema-local REVOKE alone cannot remove them.
alter default privileges revoke execute on functions from public, anon, authenticated;
alter default privileges revoke all on tables from anon, authenticated;
revoke all on schema private from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 1000),
  coarse_area text not null default '' check (char_length(coarse_area) <= 120),
  avatar_path text,
  available_today boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'No phone, precise location, role or mutable reputation fields. Phone remains in auth.users.';
create table public.usernames (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,23}$'),
  created_at timestamptz not null default now()
);
create table public.reserved_usernames (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(username)),
  reason text not null,
  created_at timestamptz not null default now()
);
insert into public.reserved_usernames(username, reason)
select name, 'Official or misleading identity' from unnest(array['mnelo','admin','administrator','support','security','moderator','official','system','help','api','root','null','undefined']) as name;
create table public.profile_languages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  language_code text not null check (language_code ~ '^[a-z]{2,3}$'),
  unique(user_id, language_code)
);
create table public.user_capabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 240),
  normalized_term text not null check (char_length(normalized_term) between 1 and 240),
  created_at timestamptz not null default now(),
  unique(user_id, normalized_term)
);
create index user_capabilities_term_idx on public.user_capabilities(normalized_term);
create table public.privacy_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  discoverability text not null default 'relevant' check (discoverability in ('relevant','everyone','nobody')),
  phone_visibility text not null default 'nobody' check (phone_visibility in ('nobody','connections')),
  exact_location text not null default 'never' check (exact_location = 'never'),
  request_audience text not null default 'relevant' check (request_audience in ('relevant','mutual','everyone')),
  updated_at timestamptz not null default now()
);
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(user_id <> blocked_user_id),
  unique(user_id, blocked_user_id)
);
create index blocks_target_idx on public.blocks(blocked_user_id, user_id);
create table public.matching_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check(mode in ('need','offer')),
  raw_text text not null check(char_length(btrim(raw_text)) between 3 and 2000),
  intent_type text not null check(intent_type in ('service','professional','social','capability','opportunity','product')),
  capability_term text not null check(char_length(capability_term) <= 240),
  coarse_area text not null default '' check(char_length(coarse_area) <= 120),
  needed_on date,
  status text not null default 'active' check(status in ('active','paused','completed')),
  interpreter_version text not null default 'rules-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matching_requests_owner_idx on public.matching_requests(user_id, created_at desc, id);
create table public.user_needs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  matching_request_id uuid not null unique references public.matching_requests(id) on delete cascade,
  description text not null check(char_length(description) between 3 and 2000),
  created_at timestamptz not null default now()
);
create index user_needs_owner_idx on public.user_needs(user_id);
create table public.user_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  matching_request_id uuid not null unique references public.matching_requests(id) on delete cascade,
  description text not null check(char_length(description) between 3 and 2000),
  created_at timestamptz not null default now()
);
create index user_offers_owner_idx on public.user_offers(user_id);
create table public.matching_candidates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.matching_requests(id) on delete cascade,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check(score >= 0),
  rank_label text not null check(rank_label in ('strong','good','possible')),
  matcher_version text not null default 'rules-v1',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 day',
  unique(request_id, candidate_id)
);
create index matching_candidates_person_idx on public.matching_candidates(candidate_id);
create table public.matching_reasons (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.matching_candidates(id) on delete cascade,
  signal text not null check(signal in ('capability','offer','need','area','availability','language','connection','review')),
  fact text not null check(char_length(fact) between 1 and 500),
  source_id uuid,
  unique(candidate_id, signal, fact)
);
create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  matching_request_id uuid references public.matching_requests(id) on delete set null,
  context text not null check(char_length(btrim(context)) between 1 and 1000),
  message text not null default '' check(char_length(message) <= 1000),
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  check(sender_id <> recipient_id)
);
create unique index connection_requests_pending_idx on public.connection_requests(sender_id, recipient_id) where status = 'pending';
create index connection_requests_recipient_idx on public.connection_requests(recipient_id, created_at desc);
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  request_id uuid unique references public.connection_requests(id) on delete set null,
  context text not null default '' check(char_length(context) <= 1000),
  interaction_type text not null default 'social' check(interaction_type in ('social','service','business')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check(user_low < user_high),
  unique(user_low, user_high)
);
create index connections_high_idx on public.connections(user_high);
create table public.connection_completions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(connection_id,user_id)
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('direct','group')),
  connection_id uuid unique references public.connections(id) on delete set null,
  title text not null default '' check(char_length(title) <= 80),
  avatar_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(kind <> 'group' or char_length(btrim(title)) > 0)
);
create table public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check(role in ('member','admin')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz not null default now(),
  unique(conversation_id,user_id)
);
create index conversation_members_user_idx on public.conversation_members(user_id, conversation_id) where left_at is null;
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  client_id uuid not null,
  kind text not null check(kind in ('text','image','file','voice','location','contact','call')),
  body text not null default '' check(char_length(body) <= 8000),
  reply_to uuid,
  attachment_id uuid unique,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  unique(sender_id, client_id),
  unique(id, conversation_id),
  foreign key(reply_to, conversation_id) references public.messages(id, conversation_id) on delete set null (reply_to)
);
create index messages_cursor_idx on public.messages(conversation_id, created_at desc, id desc);
create table public.message_locations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  latitude numeric(9,6) not null check(latitude between -90 and 90),
  longitude numeric(9,6) not null check(longitude between -180 and 180),
  label text not null default '' check(char_length(label) <= 240)
);
create table public.message_contacts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade
);
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  object_path text not null unique,
  file_name text not null check(char_length(file_name) between 1 and 160),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','audio/mp4','audio/m4a','audio/aac','audio/mpeg','application/octet-stream')),
  byte_size bigint not null check(byte_size between 1 and 20971520),
  duration_seconds numeric(8,2) check(duration_seconds between 0 and 600),
  status text not null default 'pending' check(status in ('pending','ready','rejected')),
  created_at timestamptz not null default now()
);
create index message_attachments_owner_idx on public.message_attachments(user_id);
create index message_attachments_conversation_idx on public.message_attachments(conversation_id);
alter table public.messages add constraint messages_attachment_fk foreign key(attachment_id) references public.message_attachments(id) on delete set null;
create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check(char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique(message_id,user_id,emoji)
);
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  auth_session_id uuid not null unique references auth.sessions(id) on delete cascade,
  device_name text not null check(char_length(device_name) between 1 and 100),
  platform text not null check(platform in ('ios','android','web')),
  os_version text not null check(char_length(os_version) <= 80),
  last_active_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index devices_user_idx on public.devices(user_id);
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null unique references public.devices(id) on delete cascade,
  token text not null unique check(char_length(token) between 10 and 512),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens(user_id);
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  messages boolean not null default true,
  requests boolean not null default true,
  matches boolean not null default true,
  calls boolean not null default true,
  previews boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid references public.profiles(id) on delete set null,
  recipient_id uuid references public.profiles(id) on delete set null,
  media text not null check(media in ('voice','video')),
  status text not null default 'ringing' check(status in ('ringing','accepted','declined','ended','failed','missed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 seconds',
  accepted_at timestamptz,
  ended_at timestamptz,
  check(caller_id <> recipient_id)
);
create index call_sessions_conversation_idx on public.call_sessions(conversation_id,created_at desc);
create index call_sessions_recipient_idx on public.call_sessions(recipient_id,created_at desc);
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check(rating between 1 and 5),
  comment text not null default '' check(char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  check(author_id <> subject_id),
  unique(connection_id,author_id)
);
create index reviews_subject_idx on public.reviews(subject_id);
create table public.verification_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  verification_type text not null check(verification_type in ('identity','professional','business')),
  verified_at timestamptz not null,
  expires_at timestamptz,
  unique(user_id, verification_type)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null check(reason in ('spam','scam','harassment','fake','unsafe','other')),
  detail text not null default '' check(char_length(detail) <= 2000),
  status text not null default 'received' check(status in ('received','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  check(reporter_id <> subject_id)
);
create index reports_reporter_idx on public.reports(reporter_id,created_at desc);
create index reports_subject_idx on public.reports(subject_id);
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'requested' check(status in ('requested','processing','failed')),
  error_code text check(error_code in ('RETRY_REQUIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table private.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  attempts integer not null default 1 check(attempts > 0),
  primary key(user_id,action,window_start)
);
create table private.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  actor_reference text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create table private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check(event_type in ('message','request','accepted','match','call')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  unique(user_id,event_type,entity_id)
);

create index profiles_area_idx on public.profiles(coarse_area);
create index profile_languages_code_idx on public.profile_languages(language_code,user_id);
create index connection_requests_sender_idx on public.connection_requests(sender_id,created_at desc);
create index messages_reply_idx on public.messages(reply_to) where reply_to is not null;
create index notification_outbox_pending_idx on private.notification_outbox(created_at) where processed_at is null;

-- Cross-table ownership and conversation identity must agree even in privileged writes.
alter table public.matching_requests add constraint matching_requests_id_owner unique(id,user_id);
alter table public.user_needs add constraint user_needs_request_owner foreign key(matching_request_id,user_id) references public.matching_requests(id,user_id) on delete cascade;
alter table public.user_offers add constraint user_offers_request_owner foreign key(matching_request_id,user_id) references public.matching_requests(id,user_id) on delete cascade;
alter table public.devices add constraint devices_id_owner unique(id,user_id);
alter table public.push_tokens add constraint push_token_device_owner foreign key(device_id,user_id) references public.devices(id,user_id) on delete cascade;
alter table public.message_attachments add constraint attachments_id_conversation unique(id,conversation_id);
alter table public.messages add constraint message_attachment_conversation foreign key(attachment_id,conversation_id) references public.message_attachments(id,conversation_id) on delete set null (attachment_id);
