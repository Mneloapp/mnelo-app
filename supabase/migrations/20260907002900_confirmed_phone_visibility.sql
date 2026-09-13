-- Only an Auth-confirmed phone may be deliberately shared with connections.
create or replace function public.profile_phone(target uuid) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); value text;
begin
 perform private.rate_limit('phone_reveal',20,3600);
 if target<>actor and (private.has_block(actor,target) or not private.connected(actor,target) or not exists(select 1 from public.privacy_settings p where p.user_id=target and p.phone_visibility='connections')) then return null;end if;
 select phone into value from auth.users where id=target and phone_confirmed_at is not null;
 if value is null or value='' then return null;end if;
 return '+'||ltrim(value,'+');
end;
$$;
