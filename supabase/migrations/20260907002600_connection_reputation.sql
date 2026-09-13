alter table public.reviews add column status text not null default 'published' check(status in('published','hidden'));
create index reviews_subject_cursor_idx on public.reviews(subject_id,created_at desc,id desc) where status='published';
create index connections_completed_cursor_idx on public.connections(completed_at desc,id desc) where completed_at is not null;
-- Raw author/connection identifiers are private. Public-safe projections are below.
revoke select on public.reviews from authenticated;
create function private.review_eligible(link uuid,author uuid,subject uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.connections c where c.id=link and c.interaction_type in('service','business') and c.completed_at is not null
 and c.user_low=least(author,subject) and c.user_high=greatest(author,subject) and author<>subject
 and exists(select 1 from public.connection_completions x where x.connection_id=c.id and x.user_id=c.user_low)
 and exists(select 1 from public.connection_completions x where x.connection_id=c.id and x.user_id=c.user_high));
$$;
create view private.published_reviews as
 select r.* from public.reviews r where r.status='published' and private.review_eligible(r.connection_id,r.author_id,r.subject_id);
revoke all on private.published_reviews from public,anon,authenticated;
grant select on private.published_reviews to service_role;
create function private.validate_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not private.review_eligible(new.connection_id,new.author_id,new.subject_id) then raise exception using errcode='23514',message='REVIEW_INELIGIBLE';end if;
 if tg_op='UPDATE' and (new.connection_id<>old.connection_id or new.author_id<>old.author_id or new.subject_id<>old.subject_id or new.rating<>old.rating or new.comment<>old.comment) then raise exception using errcode='42501',message='IMMUTABLE_REVIEW';end if;
 return new;
end;
$$;
create trigger review_eligibility before insert or update on public.reviews for each row execute function private.validate_review();
create function public.confirm_connection_completion(connection uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); c public.connections;
begin
 select * into c from public.connections where id=connection;
 if not found or not private.owns_connection(connection) or c.interaction_type not in('service','business') then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.lock_pair(c.user_low,c.user_high);
 select * into c from public.connections where id=connection for update;
 if not found or not private.owns_connection(connection) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if exists(select 1 from public.connection_completions x where x.connection_id=connection and x.user_id=actor) then return;end if;
 perform private.rate_limit('connection_completion',20,3600);
 insert into public.connection_completions(connection_id,user_id) values(connection,actor) on conflict(connection_id,user_id) do nothing;
 if (select count(*) from public.connection_completions x where x.connection_id=connection and x.user_id in(c.user_low,c.user_high))=2 then update public.connections set completed_at=coalesce(completed_at,now()) where id=connection;end if;
end;
$$;
create function public.submit_connection_review(connection uuid,rating integer,comment text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); c public.connections; subject uuid; previous public.reviews; result uuid;
begin
 if rating is null or rating not between 1 and 5 or comment is null or char_length(comment)>1000 then raise exception using errcode='22023',message='INVALID';end if;
 select * into c from public.connections where id=connection;
 if not found or not private.owns_connection(connection) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.lock_pair(c.user_low,c.user_high);
 subject:=case when actor=c.user_low then c.user_high else c.user_low end;
 if not private.owns_connection(connection) or not private.review_eligible(connection,actor,subject) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select * into previous from public.reviews r where r.connection_id=connection and r.author_id=actor;
 if found then
  if previous.rating<>rating or previous.comment<>btrim(comment) then raise exception using errcode='23505',message='CONFLICT';end if;
  return previous.id;
 end if;
 perform private.rate_limit('review',5,86400);
 insert into public.reviews(connection_id,author_id,subject_id,rating,comment) values(connection,actor,subject,rating,btrim(comment)) returning id into result;
 return result;
end;
$$;
create function private.connection_summary(link uuid)
returns table(id uuid,conversation_id uuid,peer_id uuid,display_name text,username text,context text,interaction_type text,completed_at timestamptz,confirmed_by_me boolean,confirmed_by_peer boolean,review_id uuid,rating smallint,comment text)
language sql stable security definer set search_path='' as $$
 select c.id,v.id,p.id,p.display_name,u.username,c.context,c.interaction_type,c.completed_at,
 exists(select 1 from public.connection_completions x where x.connection_id=c.id and x.user_id=auth.uid()),
 exists(select 1 from public.connection_completions x where x.connection_id=c.id and x.user_id=p.id),r.id,r.rating,r.comment
 from public.connections c join public.conversations v on v.connection_id=c.id
 join public.profiles p on p.id=case when c.user_low=auth.uid() then c.user_high else c.user_low end
 join public.usernames u on u.user_id=p.id left join public.reviews r on r.connection_id=c.id and r.author_id=auth.uid()
 where c.id=link and private.owns_connection(c.id) and private.can_read_conversation(v.id);
$$;
create function public.connection_details(conversation uuid)
returns table(id uuid,conversation_id uuid,peer_id uuid,display_name text,username text,context text,interaction_type text,completed_at timestamptz,confirmed_by_me boolean,confirmed_by_peer boolean,review_id uuid,rating smallint,comment text)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_user();
 if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return query select s.* from public.conversations v cross join lateral private.connection_summary(v.connection_id) s where v.id=conversation and v.kind='direct';
end;
$$;
create function public.completed_connections(before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,conversation_id uuid,peer_id uuid,display_name text,username text,context text,interaction_type text,completed_at timestamptz,confirmed_by_me boolean,confirmed_by_peer boolean,review_id uuid,rating smallint,comment text)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 return query select s.* from (select c.id from public.connections c where actor in(c.user_low,c.user_high) and c.completed_at is not null
 and (before_time is null or (c.completed_at,c.id)<(before_time,before_id)) and not private.has_block(c.user_low,c.user_high)
 order by c.completed_at desc,c.id desc limit 30) page cross join lateral private.connection_summary(page.id) s order by s.completed_at desc,s.id desc;
end;
$$;
create function public.profile_reviews(target uuid,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,rating smallint,comment text,created_at timestamptz,interaction_type text,own boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_user();
 if not private.can_view_profile(target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return query select r.id,r.rating,r.comment,r.created_at,c.interaction_type,r.author_id=auth.uid() from private.published_reviews r join public.connections c on c.id=r.connection_id
 where r.subject_id=target and (before_time is null or (r.created_at,r.id)<(before_time,before_id)) order by r.created_at desc,r.id desc limit 20;
end;
$$;
create function public.profile_verifications(target uuid)
returns table(verification_type text,verified_at timestamptz,expires_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_user();
 if not private.can_view_profile(target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return query select v.verification_type,v.verified_at,v.expires_at from public.verification_status v where v.user_id=target and v.verified_at<=now() and (v.expires_at is null or v.expires_at>now()) order by v.verification_type;
end;
$$;
grant execute on function public.confirm_connection_completion(uuid),public.submit_connection_review(uuid,integer,text),public.connection_details(uuid),public.completed_connections(timestamptz,uuid),public.profile_reviews(uuid,timestamptz,uuid),public.profile_verifications(uuid) to authenticated;
alter publication supabase_realtime add table public.connections,public.connection_completions;
