create function private.valid_coarse_area(value text) returns boolean
language sql immutable set search_path='' as $$
 select value is not null and char_length(value)<=120 and (value='' or (
 value ~ '^[[:alpha:] .''-]+$' and value !~* '\y(street|avenue|road|apartment|house|floor|unit|apt|ave|rd|st)\y|ქუჩა|გამზირი|ბინა|სართული'));
$$;
-- This validates existing rows too; do not silently truncate or publish an old precise address.
alter table public.profiles add constraint profiles_coarse_area_only check(private.valid_coarse_area(coarse_area));
create or replace function public.update_privacy(discoverability text,phone_visibility text,request_audience text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 if discoverability is null or discoverability not in('relevant','everyone','nobody') or phone_visibility is null or phone_visibility not in('nobody','connections') or request_audience is null or request_audience not in('relevant','mutual','everyone') then raise exception using errcode='22023',message='INVALID';end if;
 perform private.rate_limit('privacy_update',30,3600);
 update public.privacy_settings p set discoverability=update_privacy.discoverability,phone_visibility=update_privacy.phone_visibility,
 request_audience=update_privacy.request_audience,updated_at=now() where p.user_id=actor;
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
end;
$$;
-- Phone is read from Auth only after a fresh policy check. It never joins discovery/profile summaries.
create function public.profile_phone(target uuid) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); value text;
begin
 perform private.rate_limit('phone_reveal',20,3600);
 if target<>actor and (private.has_block(actor,target) or not private.connected(actor,target) or not exists(select 1 from public.privacy_settings p where p.user_id=target and p.phone_visibility='connections')) then return null;end if;
 select phone into value from auth.users where id=target;
 if value is null or value='' then return null;end if;
 return '+'||ltrim(value,'+');
end;
$$;
grant execute on function public.profile_phone(uuid) to authenticated;
