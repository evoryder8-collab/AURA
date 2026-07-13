begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
grant usage on schema extensions to anon, authenticated;

-- Build a photo row while consent is active, then revoke consent. The row is
-- transaction-local and exists only to verify the read policy.
insert into public.consents (
  id, practice_id, client_id, consent_type, version, granted, granted_at, metadata
) values (
  '76000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  'photography', 'security-test-v1', true, now(), '{"synthetic":true}'::jsonb
);

insert into public.progress_photos (
  id, practice_id, client_id, appointment_id, storage_path, view_type, phase,
  consent_id, created_by, captured_at, metadata
) values (
  'aa000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002/aa000000-0000-4000-8000-000000000002/photo.webp',
  'front', 'after', '76000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001', now(), '{"synthetic":true}'::jsonb
);

update public.consents
set granted = false, revoked_at = now()
where id = '76000000-0000-4000-8000-000000000002';

insert into public.consents (
  id, practice_id, client_id, consent_type, version, granted, granted_at, metadata
) values (
  '77000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'handoff', 'security-test-v1', true, now(), '{"synthetic":true}'::jsonb
);

insert into public.appointments (
  id, practice_id, client_id, therapist_user_id, starts_at, duration_minutes,
  session_type, status, intake_status_snapshot, requested_by, room
) values (
  '55000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  now() + interval '2 days', 60, 'Security test request', 'requested', 'complete',
  '30000000-0000-4000-8000-000000000001', null
);

insert into public.handoff_exports (
  id, practice_id, client_id, created_by, recipient_name, recipient_organization,
  purpose, date_from, date_to, included_sections, expires_at, status
) values
  (
    'c3000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Security Test Recipient', 'Security Test Organisation',
    'Share the explicitly selected progress categories.',
    current_date - 30, current_date,
    '["pain","functional_goals"]'::jsonb,
    now() + interval '2 days', 'awaiting_consent'
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Second Security Recipient', null,
    'A second export used to verify independent approval.',
    current_date - 14, current_date,
    '["session_response"]'::jsonb,
    now() + interval '1 day', 'awaiting_consent'
  );

select plan(38);

-- Authenticate as client A with a recent password AMR. Entrance-screen state is
-- irrelevant: all helper functions read this validated backend identity.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '30000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::integer))
  )::text,
  true
);

select is(
  (select count(*)::integer from public.clients),
  1,
  'client A sees exactly their own client record'
);
select is(
  (
    select count(*)::integer from public.clients
    where id = '40000000-0000-4000-8000-000000000002'
  ),
  0,
  'client A cannot read client B'
);
select results_eq(
  $$
    update public.appointments
    set starts_at = starts_at + interval '1 hour'
    where id = '55000000-0000-4000-8000-000000000001'
    returning 1
  $$,
  $$ select 1 where false $$,
  'client cannot directly alter appointment scheduling fields'
);
select results_eq(
  $$
    update public.appointments
    set therapist_user_id = '30000000-0000-4000-8000-000000000001'
    where id = '55000000-0000-4000-8000-000000000001'
    returning 1
  $$,
  $$ select 1 where false $$,
  'client cannot directly alter the assigned therapist'
);
select results_eq(
  $$
    update public.appointments
    set status = 'cancelled'
    where id = '55000000-0000-4000-8000-000000000001'
    returning 1
  $$,
  $$ select 1 where false $$,
  'client cannot bypass the narrow cancellation RPC with a whole-row update'
);
select throws_ok(
  $$
    insert into public.appointments (
      practice_id, client_id, therapist_user_id, starts_at, duration_minutes,
      session_type, status, intake_status_snapshot, requested_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', now() + interval '3 days',
      60, 'Forged whole-row request', 'requested', 'complete',
      '30000000-0000-4000-8000-000000000001'
    )
  $$
);
select results_eq(
  $$
    select status::text, requested_by::text, room, intake_status_snapshot::text
    from public.request_appointment(
      '20000000-0000-4000-8000-000000000001',
      now() + interval '4 days',
      45,
      'Client requested follow-up'
    )
  $$,
  $$
    values (
      'requested'::text,
      '30000000-0000-4000-8000-000000000001'::text,
      null::text,
      'complete'::text
    )
  $$,
  'appointment request RPC derives status, requester, room, and intake snapshot server-side'
);
select results_eq(
  $$
    select status::text
    from public.cancel_appointment('55000000-0000-4000-8000-000000000001')
  $$,
  $$ values ('cancelled'::text) $$,
  'client can cancel their own cancellable appointment through the narrow RPC'
);
select throws_ok(
  $$ select public.cancel_appointment('51000000-0000-4000-8000-000000000001') $$
);
select is(
  public.has_active_handoff_approval('c3000000-0000-4000-8000-000000000001'),
  false,
  'standing handoff consent alone does not authorize an individual export'
);
select throws_ok(
  $$
    insert into public.handoff_export_approvals (
      practice_id, handoff_export_id, client_id, approved_by, standing_consent_id,
      recipient_name_snapshot, recipient_organization_snapshot, purpose_snapshot,
      included_sections_snapshot, approved_expires_at
    )
    select
      he.practice_id, he.id, he.client_id,
      '30000000-0000-4000-8000-000000000001',
      '77000000-0000-4000-8000-000000000001',
      he.recipient_name, he.recipient_organization, he.purpose,
      he.included_sections, he.expires_at
    from public.handoff_exports he
    where he.id = 'c3000000-0000-4000-8000-000000000001'
  $$
);
select throws_ok(
  $$
    select public.approve_handoff_export(
      'c3000000-0000-4000-8000-000000000001',
      'Security Test Recipient',
      'Security Test Organisation',
      'A purpose the client was not shown',
      '["pain","functional_goals"]'::jsonb,
      (select expires_at from public.handoff_exports
       where id = 'c3000000-0000-4000-8000-000000000001')
    )
  $$
);
select results_eq(
  $$
    select recipient_name_snapshot, purpose_snapshot, included_sections_snapshot
    from public.approve_handoff_export(
      'c3000000-0000-4000-8000-000000000001',
      'Security Test Recipient',
      'Security Test Organisation',
      'Share the explicitly selected progress categories.',
      '["pain","functional_goals"]'::jsonb,
      (select expires_at from public.handoff_exports
       where id = 'c3000000-0000-4000-8000-000000000001')
    )
  $$,
  $$
    values (
      'Security Test Recipient'::text,
      'Share the explicitly selected progress categories.'::text,
      '["pain","functional_goals"]'::jsonb
    )
  $$,
  'client deliberately approves the exact recipient, purpose, and categories shown'
);
select is(
  public.has_active_handoff_approval('c3000000-0000-4000-8000-000000000001'),
  true,
  'exact per-export approval activates only the approved handoff'
);
select is(
  (
    select count(*)::integer
    from public.handoff_export_approvals
    where handoff_export_id = 'c3000000-0000-4000-8000-000000000001'
      and approved_by = '30000000-0000-4000-8000-000000000001'
      and standing_consent_id = '77000000-0000-4000-8000-000000000001'
      and approved_expires_at = (
        select expires_at from public.handoff_exports
        where id = 'c3000000-0000-4000-8000-000000000001'
      )
  ),
  1,
  'approval snapshot binds client identity, standing consent, and maximum expiry'
);
select results_eq(
  $$
    update public.therapist_assessments
    set stiffness_score = 0
    where client_id = '40000000-0000-4000-8000-000000000001'
    returning 1
  $$,
  $$ select 1 where false $$,
  'client cannot modify a therapist assessment'
);
select is(
  (select count(*)::integer from public.appointment_private_notes),
  0,
  'client cannot read therapist scheduling notes'
);
select is(
  (select count(*)::integer from public.session_private_notes),
  0,
  'client cannot read therapist session notes'
);
select is(
  (
    select count(*)::integer from public.insights
    where id = 'b1000000-0000-4000-8000-000000000004'
  ),
  0,
  'client cannot read an unapproved insight'
);
select results_eq(
  $$
    update public.insights
    set status = 'approved',
        client_narration = 'Unauthorized narration',
        approved_by = '30000000-0000-4000-8000-000000000001',
        approved_at = now()
    where id = 'b1000000-0000-4000-8000-000000000004'
    returning 1
  $$,
  $$ select 1 where false $$,
  'client cannot approve a professional insight'
);
select is(
  (
    select count(*)::integer from public.progress_photos
    where id = 'aa000000-0000-4000-8000-000000000002'
  ),
  0,
  'client cannot read photo metadata after photography consent is revoked'
);
select throws_ok(
  $$
    update public.profiles
    set role = 'therapist'
    where id = '30000000-0000-4000-8000-000000000001'
  $$
);
select throws_ok(
  $$
    update public.audit_events
    set action = 'tampered'
    where id = 'f1000000-0000-4000-8000-000000000001'
  $$
);
select throws_ok(
  $$
    update public.consents
    set consent_type = 'ai_processing'
    where id = '71000000-0000-4000-8000-000000000001'
  $$
);
select results_eq(
  $$
    update public.clients
    set intake_status = 'partial'
    where id = '40000000-0000-4000-8000-000000000001'
    returning intake_status
  $$,
  $$ values ('partial'::public.intake_status) $$,
  'client can save progress through an allowed intake state'
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '30000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'aal', 'aal1',
    'amr', jsonb_build_array(
      jsonb_build_object(
        'method', 'password',
        'timestamp', extract(epoch from now() - interval '30 minutes')::integer
      )
    )
  )::text,
  true
);
select results_eq(
  $$
    update public.consents
    set metadata = metadata || '{"attemptedWithoutFreshAuth":true}'::jsonb
    where id = '71000000-0000-4000-8000-000000000001'
    returning 1
  $$,
  $$ select 1 where false $$,
  'stale authentication cannot change consent'
);
select throws_ok(
  $$
    select public.approve_handoff_export(
      'c3000000-0000-4000-8000-000000000002',
      'Second Security Recipient',
      null,
      'A second export used to verify independent approval.',
      '["session_response"]'::jsonb,
      (select expires_at from public.handoff_exports
       where id = 'c3000000-0000-4000-8000-000000000002')
    )
  $$
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '20000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'aal', 'aal2',
    'amr', jsonb_build_array(
      jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::integer),
      jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::integer)
    )
  )::text,
  true
);

select throws_ok(
  $$
    insert into public.progress_photos (
      id, practice_id, client_id, appointment_id, storage_path, view_type, phase,
      consent_id, created_by, captured_at
    ) values (
      'aa000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      '52000000-0000-4000-8000-000000000006',
      '10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002/aa000000-0000-4000-8000-000000000003/photo.webp',
      'front', 'after', '76000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001', now()
    )
  $$
);
select is(
  (select count(*)::integer from public.clients),
  4,
  'therapist can read every client in the dedicated practice'
);
select is(
  (select count(*)::integer from public.therapist_assessments),
  18,
  'therapist can read professional assessments in the dedicated practice'
);
select throws_ok(
  $$
    update public.handoff_exports
    set recipient_name = 'Unapproved replacement recipient'
    where id = 'c3000000-0000-4000-8000-000000000001'
  $$
);
select throws_ok(
  $$
    update public.handoff_exports
    set status = 'consented'
    where id = 'c3000000-0000-4000-8000-000000000002'
  $$
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '30000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'aal', 'aal1',
    'amr', jsonb_build_array(
      jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::integer)
    )
  )::text,
  true
);
select is(
  public.revoke_handoff_export_approval('c3000000-0000-4000-8000-000000000001'),
  true,
  'client can revoke the individual export approval with fresh authentication'
);
select is(
  public.has_active_handoff_approval('c3000000-0000-4000-8000-000000000001'),
  false,
  'revoking per-export approval immediately invalidates handoff access'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok(
  not has_table_privilege(current_user, 'public.clients', 'SELECT'),
  'anonymous cannot read application client data'
);
select ok(
  not has_table_privilege(current_user, 'public.audit_events', 'SELECT'),
  'anonymous cannot read audit data'
);
select ok(
  has_table_privilege(current_user, 'public.public_brand_config', 'SELECT'),
  'anonymous can read the deliberate public brand view'
);
select is(
  (select count(*)::integer from public.public_brand_config),
  1,
  'public brand view exposes only the single synthetic installation brand row'
);

select * from finish();
rollback;
