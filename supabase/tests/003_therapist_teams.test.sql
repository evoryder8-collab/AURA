begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
grant usage on schema extensions to anon, authenticated, service_role;

select plan(32);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::integer from public.public_therapist_directory),
  2,
  'anonymous visitors see only the two explicitly opted-in synthetic professionals'
);
select columns_are(
  'public',
  'public_therapist_directory',
  array[
    'practice_name', 'directory_slug', 'professional_name',
    'professional_title', 'public_portrait_path'
  ],
  'the public directory has only professional identity and portrait columns'
);
select ok(
  not has_table_privilege(current_user, 'public.therapist_profiles', 'SELECT'),
  'anonymous visitors cannot read therapist base profiles, contact data, or settings'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '30000000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'aal', 'aal1',
    'amr', jsonb_build_array(
      jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::integer)
    )
  )::text,
  true
);

select is(
  (select count(*)::integer from public.client_therapist_directory),
  2,
  'an authenticated client can list all bookable therapists in their practice'
);
select columns_are(
  'public',
  'client_therapist_directory',
  array[
    'user_id', 'directory_slug', 'professional_name',
    'professional_title', 'public_portrait_path'
  ],
  'the booking directory omits contact details, usernames, and therapist settings'
);
select results_eq(
  $$
    select therapist_user_id::text, client_id::text, status::text
    from public.request_appointment(
      '20000000-0000-4000-8000-000000000002',
      now() + interval '5 days',
      60,
      'Client-selected team therapist'
    )
  $$,
  $$
    values (
      '20000000-0000-4000-8000-000000000002'::text,
      '40000000-0000-4000-8000-000000000002'::text,
      'requested'::text
    )
  $$,
  'booking attributes the appointment to the eligible therapist selected by the client'
);
select throws_ok(
  $$
    select public.request_appointment(
      '30000000-0000-4000-8000-000000000001',
      now() + interval '6 days',
      60,
      'Invalid provider selection'
    )
  $$,
  '22023',
  'selected therapist is unavailable for online booking',
  'a client or non-bookable identity cannot be selected as a therapist'
);
select ok(
  not has_table_privilege(
    current_user,
    'public.therapist_client_assignments',
    'SELECT'
  ),
  'clients cannot enumerate the assignment authorization ledger'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '20000000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'aal', 'aal2',
    'amr', jsonb_build_array(
      jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::integer),
      jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::integer)
    )
  )::text,
  true
);

select is(
  public.is_assigned_therapist('40000000-0000-4000-8000-000000000001'),
  true,
  'the second therapist has the explicit seeded Iris assignment'
);
select is(
  public.is_assigned_therapist('40000000-0000-4000-8000-000000000002'),
  true,
  'client selection created the second therapist assignment for Mika server-side'
);
select is(
  (select count(*)::integer from public.clients),
  2,
  'the second therapist sees only their two actively assigned clients'
);
select is(
  (
    select count(*)::integer from public.clients
    where id = '40000000-0000-4000-8000-000000000003'
  ),
  0,
  'the second therapist cannot see an unassigned client in the same practice'
);
select is(
  (
    select count(*)::integer from public.appointments
    where client_id = '40000000-0000-4000-8000-000000000001'
  ),
  6,
  'an assigned therapist sees the complete client appointment history'
);
select is(
  (
    select count(distinct therapist_user_id)::integer from public.appointments
    where client_id = '40000000-0000-4000-8000-000000000001'
  ),
  2,
  'appointment attribution preserves which of two therapists delivered each session'
);
select is(
  (
    select count(*)::integer from public.pain_entries
    where client_id = '40000000-0000-4000-8000-000000000001'
  ),
  6,
  'client-owned pain progress remains one aggregate across providers'
);
select is(
  (
    select count(*)::integer from public.therapist_assessments
    where client_id = '40000000-0000-4000-8000-000000000001'
  ),
  6,
  'assigned care-team access includes the client assessment history across appointments'
);
select is(
  (select count(*)::integer from public.therapist_profiles),
  1,
  'a therapist reads only their own base profile rather than teammates private settings'
);
select throws_ok(
  $$
    insert into public.therapist_client_assignments (
      practice_id, client_id, therapist_user_id, assignment_source, assigned_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000002',
      'trusted_administration',
      '20000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  'permission denied for table therapist_client_assignments',
  'therapists cannot self-assign arbitrary clients through the ledger'
);
select is(
  (
    select count(*)::integer
    from public.audit_events
    where resource_type = 'therapist_client_assignment'
  ),
  0,
  'ordinary therapists cannot browse the protected assignment audit ledger'
);
select throws_ok(
  $$
    delete from public.clients
    where id = '40000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  'permission denied for table clients',
  'an assigned therapist cannot delete the client aggregate root'
);
select throws_ok(
  $$
    delete from public.appointments
    where id = '51000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  'permission denied for table appointments',
  'a therapist cannot delete a longitudinal appointment record'
);
select throws_ok(
  $$
    insert into public.appointments (
      practice_id, client_id, therapist_user_id, starts_at, duration_minutes,
      session_type, status, intake_status_snapshot, requested_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001',
      now() + interval '8 days', 60, 'Forged teammate assignment',
      'pending', 'complete', '20000000-0000-4000-8000-000000000002'
    )
  $$
);
select throws_ok(
  $$
    update public.appointments
    set client_id = '40000000-0000-4000-8000-000000000002'
    where id = '51000000-0000-4000-8000-000000000002'
  $$
);
select ok(
  public.can_manage_public_brand_asset(
    (
      select tp.practice_id::text || '/' || tp.public_portrait_resource_id::text || '/portrait.webp'
      from public.therapist_profiles tp
      where tp.user_id = '20000000-0000-4000-8000-000000000002'
    )
  ),
  'a therapist can manage objects inside their own opaque public portrait namespace'
);
select ok(
  not public.can_manage_public_brand_asset(
    '10000000-0000-4000-8000-000000000001/99000000-0000-4000-8000-000000000001/portrait.webp'
  ),
  'a therapist cannot overwrite a teammate public portrait namespace'
);

reset role;
delete from public.therapist_profiles
where user_id = '20000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '20000000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
select lives_ok(
  $$
    insert into public.therapist_profiles (
      practice_id, user_id, professional_name, public_portrait_resource_id
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      'Second synthetic therapist',
      '99000000-0000-4000-8000-000000000001'
    )
  $$,
  'an authenticated therapist profile insert replaces a caller-supplied portrait namespace'
);
select isnt(
  (
    select public_portrait_resource_id
    from public.therapist_profiles
    where user_id = '20000000-0000-4000-8000-000000000002'
  ),
  '99000000-0000-4000-8000-000000000001'::uuid,
  'the stored public portrait namespace is generated server-side rather than reused'
);
select ok(
  not public.can_manage_public_brand_asset(
    '10000000-0000-4000-8000-000000000001/99000000-0000-4000-8000-000000000001/portrait.webp'
  ),
  'a profile insert cannot claim a teammate public portrait namespace'
);

reset role;
update public.therapist_client_assignments
set ended_at = now()
where client_id = '40000000-0000-4000-8000-000000000001'
  and therapist_user_id = '20000000-0000-4000-8000-000000000002'
  and ended_at is null;

select throws_ok(
  $$
    update public.therapist_client_assignments
    set ended_at = null
    where client_id = '40000000-0000-4000-8000-000000000001'
      and therapist_user_id = '20000000-0000-4000-8000-000000000002'
      and ended_at is not null
  $$,
  '42501',
  'an assignment may be ended once and never reactivated',
  'ended assignment history cannot be reactivated in place'
);
set local role service_role;
select throws_ok(
  $$
    delete from public.therapist_client_assignments
    where client_id = '40000000-0000-4000-8000-000000000001'
      and therapist_user_id = '20000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  'permission denied for table therapist_client_assignments',
  'service operations cannot delete assignment history'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '20000000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);

select is(
  public.is_assigned_therapist('40000000-0000-4000-8000-000000000001'),
  false,
  'ending an assignment immediately revokes therapist access'
);
select is(
  (
    select count(*)::integer from public.pain_entries
    where client_id = '40000000-0000-4000-8000-000000000001'
  ),
  0,
  'ended assignments cannot read the former client progress aggregate'
);

select * from finish();
rollback;
