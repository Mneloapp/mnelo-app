-- Keep this device visible even if many newer sessions exist.
create function public.current_device()
returns table(id uuid,label text,platform text,os_version text,created_at timestamptz,last_active_at timestamptz,is_current boolean)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_user(); current_id uuid:=private.current_session();
begin
 return query select s.id,coalesce(d.device_name,''),coalesce(d.platform,''),coalesce(d.os_version,''),s.created_at,coalesce(d.last_active_at,s.updated_at,s.created_at),s.id=current_id
 from auth.sessions s left join public.devices d on d.auth_session_id=s.id
 where s.user_id=actor and (s.not_after is null or s.not_after>now()) and d.revoked_at is null
 and s.id=current_id
 order by s.created_at desc,s.id desc limit 1;
end;
$$;
grant execute on function public.current_device() to authenticated;
