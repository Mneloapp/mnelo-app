-- Service writes must respect deletion even if an earlier upload reservation was valid.
create function private.reject_closing_upload() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='profiles' then
  if new.avatar_path is distinct from old.avatar_path and new.avatar_path is not null and private.account_closing(new.id) then raise exception using errcode='42501',message='ACCOUNT_DELETING';end if;
 else
  if (tg_op='INSERT' or new.status='ready') and private.account_closing(new.user_id) then raise exception using errcode='42501',message='ACCOUNT_DELETING';end if;
 end if;
 return new;
end;
$$;
create trigger closing_avatar before update of avatar_path on public.profiles for each row execute function private.reject_closing_upload();
create trigger closing_attachment before insert or update of status on public.message_attachments for each row execute function private.reject_closing_upload();
create function public.account_deletion_ready(job uuid,lease uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare item private.account_deletion_jobs;
begin
 select * into item from private.account_deletion_jobs where id=job and lease_id=lease and lease_until>now();
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 -- Allow previously started bounded uploads to settle; known objects are scanned again afterward.
 return item.created_at<now()-interval '2 minutes'
 and not exists(select 1 from public.messages where sender_id=item.user_id and deleted_at is null)
 and not exists(select 1 from private.account_deletion_objects where job_id=job and removed_at is null)
 and not exists(select 1 from storage.objects where bucket_id in('avatars','chat-media') and (owner_id=item.user_id::text or name like item.user_id::text||'/%'))
 and not exists(select 1 from private.call_room_cleanup where completed_at is null and item.user_id in(caller_id,recipient_id));
end;
$$;
revoke all on function public.account_deletion_ready(uuid,uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_ready(uuid,uuid) to service_role;
