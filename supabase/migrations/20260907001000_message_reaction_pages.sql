-- JSON is only a transport aggregation; authoritative reactions stay in normalized rows.
create function public.get_message_reactions(message_ids uuid[]) returns table(message_id uuid, reactions jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  if cardinality(message_ids)>40 then raise exception using errcode='22023',message='INVALID'; end if;
  return query select r.message_id,jsonb_agg(jsonb_build_object('userId',r.user_id,'emoji',r.emoji) order by r.user_id,r.emoji)
    from public.message_reactions r where r.message_id=any(message_ids) and r.active and private.can_read_message(r.message_id) group by r.message_id;
end;
$$;
grant execute on function public.get_message_reactions(uuid[]) to authenticated;
