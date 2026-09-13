-- Explicit qualification avoids PL/pgSQL parameter/column ambiguity caught by real execution and db lint.
create or replace function public.send_text_message(conversation uuid, text_body text, client_id uuid, reply_to uuid default null)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); result public.messages; peer uuid;
begin
  -- Serialize conversation writes and block pairs in stable order. Recheck permission after locks.
  perform 1 from public.conversations c where c.id=conversation for update;
  for peer in select m.user_id from public.conversation_members m where m.conversation_id=conversation and m.left_at is null and m.user_id<>actor order by m.user_id loop
    perform private.lock_pair(actor,peer);
  end loop;
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if client_id is null or text_body is null or char_length(btrim(text_body)) not between 1 and 8000 then raise exception using errcode='22023',message='INVALID'; end if;
  select * into result from public.messages m where m.sender_id=actor and m.client_id=send_text_message.client_id;
  if found then
    if result.conversation_id<>conversation or result.body<>btrim(text_body) or result.reply_to is distinct from reply_to then raise exception using errcode='23505',message='CONFLICT'; end if;
    return result;
  end if;
  perform private.rate_limit('message',60,60);
  if reply_to is not null and not exists(select 1 from public.messages m where m.id=send_text_message.reply_to and m.conversation_id=conversation and m.deleted_at is null) then raise exception using errcode='22023',message='INVALID'; end if;
  insert into public.messages(conversation_id,sender_id,client_id,kind,body,reply_to)
    values(conversation,actor,client_id,'text',btrim(text_body),reply_to) returning * into result;
  update public.conversations c set updated_at=result.created_at where c.id=conversation;
  return result;
end;
$$;
create or replace function public.toggle_message_reaction(message uuid, emoji text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); conversation uuid;
begin
  select conversation_id into conversation from public.messages where id=message and deleted_at is null;
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if emoji is null or emoji not in ('👍','❤️','😂','😮','😢','🙏') then raise exception using errcode='22023',message='INVALID'; end if;
  perform private.rate_limit('reaction',60,60);
  insert into public.message_reactions(message_id,user_id,emoji,conversation_id) values(message,actor,emoji,conversation)
    on conflict on constraint message_reactions_message_id_user_id_emoji_key do update set active=not public.message_reactions.active;
end;
$$;
