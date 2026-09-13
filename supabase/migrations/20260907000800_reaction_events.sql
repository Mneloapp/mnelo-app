-- Keep reaction events RLS-filterable: soft toggles instead of unfilterable DELETE events.
alter table public.message_reactions add column conversation_id uuid;
update public.message_reactions r set conversation_id=m.conversation_id from public.messages m where m.id=r.message_id;
alter table public.message_reactions alter column conversation_id set not null;
alter table public.message_reactions add constraint reaction_message_conversation foreign key(message_id,conversation_id) references public.messages(id,conversation_id) on delete cascade;
alter table public.message_reactions add column active boolean not null default true;
create index reactions_conversation_idx on public.message_reactions(conversation_id,message_id);
create or replace function public.toggle_message_reaction(message uuid, emoji text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); conversation uuid;
begin
  select conversation_id into conversation from public.messages where id=message and deleted_at is null;
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if emoji is null or emoji not in ('👍','❤️','😂','😮','😢','🙏') then raise exception using errcode='22023',message='INVALID'; end if;
  perform private.rate_limit('reaction',60,60);
  insert into public.message_reactions(message_id,user_id,emoji,conversation_id) values(message,actor,emoji,conversation)
    on conflict(message_id,user_id,emoji) do update set active=not public.message_reactions.active;
end;
$$;
create or replace function public.delete_own_message(message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  if not private.can_read_message(message) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  perform private.rate_limit('delete_message',60,60);
  update public.messages set body='',deleted_at=coalesce(deleted_at,now()) where id=message and sender_id=actor;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  update public.message_reactions set active=false where message_id=message;
end;
$$;
create policy own_inbox_topic on realtime.messages for select to authenticated using(realtime.topic()='inbox:'||(select auth.uid())::text);
