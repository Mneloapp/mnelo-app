begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Explicit test-only fixtures; every change rolls back at the end of this suite.
insert into auth.users(id,aud,role,phone,phone_confirmed_at) values
 ('10000000-0000-0000-0000-000000000001','authenticated','authenticated','15555550201',now()),
 ('10000000-0000-0000-0000-000000000002','authenticated','authenticated','15555550202',now()),
 ('10000000-0000-0000-0000-000000000003','authenticated','authenticated','15555550203',now()),
 ('10000000-0000-0000-0000-000000000004','authenticated','authenticated','15555550204',now());
insert into auth.sessions(id,user_id,created_at,updated_at)
 select ('51000000-0000-0000-0000-'||right(id::text,12))::uuid,id,now(),now() from auth.users where id in('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","session_id":"51000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.save_profile('Alice Development','rls_alice_dev','','Vake',array['Photography'])$$,'A can create own profile through the controlled function');
select is((select discoverability from privacy_settings),'relevant','Relevant matches is the default');
select is((select phone_visibility from privacy_settings),'nobody','Phone hidden by default');
select is((select exact_location from privacy_settings),'never','Exact location never public');
select throws_ok($$select public.save_profile('Impersonator','admin')$$,'22023','INVALID','Reserved usernames rejected');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","session_id":"51000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.save_profile('Bob Development','rls_bob_dev','','Vake',array['Residential electrical installation'])$$,'B can create own profile');
select lives_ok($$select public.update_privacy('everyone','nobody','everyone')$$,'B may choose broader discoverability');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","session_id":"51000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select lives_ok($$select public.save_profile('Carol Development','rls_carol_dev')$$,'C can create own profile');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","session_id":"51000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select public.save_profile('Dan Development','rls_dan_dev');
reset role;
insert into conversations(id,kind) values('20000000-0000-0000-0000-000000000001','direct'),('20000000-0000-0000-0000-000000000002','direct');
insert into conversation_members(conversation_id,user_id) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003');
insert into messages(id,conversation_id,sender_id,client_id,kind,body) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',gen_random_uuid(),'text','Authorized development message'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',gen_random_uuid(),'location','Private development location');
insert into message_locations(message_id,latitude,longitude,label) values('30000000-0000-0000-0000-000000000002',41.710000,44.760000,'Test-only coordinates');
insert into message_attachments(id,user_id,conversation_id,object_path,file_name,mime_type,byte_size,status)
 values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','development-private-file','test.txt','text/plain',12,'ready');
insert into storage.objects(bucket_id,name) values('chat-media','development-private-file');
insert into blocks(user_id,blocked_user_id) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004');
insert into reports(reporter_id,subject_id,reason) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','spam');
insert into auth.sessions(id,user_id,created_at,updated_at) values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',now(),now());
insert into devices(id,user_id,auth_session_id,device_name,platform,os_version) values('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','Development fixture','ios','test');
insert into push_tokens(user_id,device_id,token) values('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','development-not-a-real-push-token');
insert into verification_status(user_id,verification_type,verified_at) values('10000000-0000-0000-0000-000000000002','professional',now());

select ok(not has_function_privilege('authenticated','private.rate_limit(text,integer,integer)','execute'),'Client cannot choose its own rate limit');
select ok(not has_table_privilege('authenticated','private.rate_limits','select'),'Client cannot read internal abuse records');
select ok((select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'),'Every application table enables RLS');
select ok(not exists(select 1 from pg_tables t where t.schemaname='public' and not exists(select 1 from pg_policies p where p.schemaname=t.schemaname and p.tablename=t.tablename and p.policyname='live_session_required' and p.permissive='RESTRICTIVE')),'Every exposed table requires a live session in addition to ownership');
select ok(not exists(select 1 from pg_policies where schemaname='public' and (qual='true' or with_check='true')),'No permissive true placeholder policies');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname in ('public','private') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)),'Definer functions fix their search path');
select is((select count(*) from storage.buckets where id in ('chat-media','avatars') and public),0::bigint,'Both application storage buckets are private');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from profiles$$,'42501',null,'Anonymous users cannot enumerate profiles');
select throws_ok($$select public.save_profile('Anonymous','anonymous_dev')$$,'42501',null,'Anonymous caller cannot mutate profile');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","session_id":"51000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select phone from auth.users where id='10000000-0000-0000-0000-000000000002'$$,'42501',null,'A cannot read B private phone');
select is((select count(*) from profiles where id='10000000-0000-0000-0000-000000000002'),0::bigint,'Raw profile scanning cannot bypass bounded discovery');
select is((select count(*) from public.get_profile('10000000-0000-0000-0000-000000000002')),1::bigint,'B public-safe projection is readable with everyone visibility');
select is((select count(*) from usernames where user_id='10000000-0000-0000-0000-000000000002'),0::bigint,'Raw username scans cannot bypass search limits');
select is((select count(*) from user_capabilities where user_id='10000000-0000-0000-0000-000000000002'),0::bigint,'Raw capabilities cannot bypass discovery limits');
select throws_ok($$select * from verification_status$$,'42501',null,'Raw verification metadata is server-only');
select is((select count(*) from profiles where id='10000000-0000-0000-0000-000000000003'),0::bigint,'Unmatched relevant-only profile is hidden');
select is((select count(*) from conversations),1::bigint,'A sees only its conversation');
select is((select count(*) from conversation_members where conversation_id='20000000-0000-0000-0000-000000000002'),0::bigint,'A cannot enumerate unrelated membership');
select is((select count(*) from messages where conversation_id='20000000-0000-0000-0000-000000000002'),0::bigint,'A cannot read unrelated conversation messages');
select throws_ok($$insert into messages(conversation_id,sender_id,client_id,kind,body) values('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',gen_random_uuid(),'text','unauthorized')$$,'42501',null,'A cannot insert into unrelated conversation');
select throws_ok($$update messages set body='tampered' where id='30000000-0000-0000-0000-000000000001'$$,'42501',null,'A cannot alter B message even in shared conversation');
select throws_ok($$update conversation_members set role='admin'$$,'42501',null,'Client cannot promote membership role');
select is((select count(*) from blocks),0::bigint,'A cannot enumerate B blocks');
select is((select count(*) from reports),0::bigint,'A cannot enumerate reports or reporter identities');
select throws_ok($$select * from devices$$,'42501',null,'Raw device/session identifiers are not exposed to clients');
select throws_ok('select token from public.push_tokens','42501','permission denied for table push_tokens','Client cannot read any bearer push token');
select is((select count(*) from message_locations),0::bigint,'Exact private location is hidden from unrelated user');
select is((select count(*) from message_attachments),0::bigint,'A cannot read unrelated attachment metadata');
select is((select count(*) from storage.objects where bucket_id='chat-media'),0::bigint,'A cannot access unrelated attachment object');
select throws_ok($$insert into storage.objects(bucket_id,name) values('chat-media','unreserved')$$,'42501',null,'Unreserved upload is denied');
select throws_ok($$insert into verification_status(user_id,verification_type,verified_at) values('10000000-0000-0000-0000-000000000001','identity',now())$$,'42501',null,'Client cannot self-verify');
select throws_ok($$update verification_status set expires_at=null$$,'42501',null,'Client cannot alter verification');
select throws_ok($$insert into reviews(connection_id,author_id,subject_id,rating) values(gen_random_uuid(),'10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',5)$$,'42501',null,'Client cannot award itself reputation or spoof reviewer');
select throws_ok($$insert into private.moderation_actions(actor_reference,action) values('client','ban')$$,'42501',null,'Client cannot perform moderator/admin operations');
select throws_ok($$insert into call_sessions(conversation_id,caller_id,recipient_id,media) values('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','voice')$$,'42501',null,'Client cannot insert unauthorized call session');
select lives_ok($$select public.send_connection_request('10000000-0000-0000-0000-000000000002','Development electrician request')$$,'Eligible connection request is allowed');
select throws_ok($$select public.respond_connection_request((select id from connection_requests limit 1),'accept')$$,'42501','FORBIDDEN','Sender cannot self-accept');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","session_id":"51000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.respond_connection_request((select id from connection_requests limit 1),null)$$,'42501','FORBIDDEN','Null request action is rejected');
select lives_ok($$select public.respond_connection_request((select id from connection_requests limit 1),'accept')$$,'Recipient can accept atomically');
select is((select count(*) from connections),1::bigint,'Acceptance establishes a connection');
select lives_ok($$select public.respond_connection_request((select id from connection_requests limit 1),'accept')$$,'Acceptance retry is idempotent');
select is((select count(*) from conversations where connection_id is not null),1::bigint,'Acceptance retry does not duplicate conversation');
select is((select count(*) from storage.objects where name='development-private-file'),1::bigint,'Authorized member can access private attachment object');
select is((select count(*) from message_locations),1::bigint,'Shared location is visible only inside authorized conversation');
select lives_ok($$select public.block_user('10000000-0000-0000-0000-000000000001')$$,'B may block A');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","session_id":"51000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*) from profiles where id='10000000-0000-0000-0000-000000000002'),0::bigint,'Blocked discovery/profile read denied');
select throws_ok($$select public.send_connection_request('10000000-0000-0000-0000-000000000002','Blocked request')$$,'42501','FORBIDDEN','Blocked user cannot send connection request');
select is((select count(*) from conversations),0::bigint,'Block removes direct conversation access');
select is((select count(*) from blocks),0::bigint,'Block owner identity cannot be enumerated through blocks table');
select * from finish();
rollback;
