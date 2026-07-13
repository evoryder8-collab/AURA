-- Synthetic local data only. All names/emails are explicitly fictional.
-- Seeded auth rows receive an unrecoverable random password on each reset; no
-- usable password is committed. Use scripts/bootstrap-demo-users.ts with local,
-- uncommitted environment values to set credentials intentionally.

insert into public.practices (id, name, locale, timezone, configuration)
values (
  '10000000-0000-4000-8000-000000000001',
  'AURA Synthetic Practice',
  'en-GB',
  'Europe/Zurich',
  '{"demo":true,"bonusMinutesThreshold":3,"patternEngine":"prototype-v1"}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  locale = excluded.locale,
  timezone = excluded.timezone,
  configuration = excluded.configuration;

with seed_users(id, email) as (
  values
    ('20000000-0000-4000-8000-000000000001'::uuid, 'therapist@aura-demo.invalid'),
    ('20000000-0000-4000-8000-000000000002'::uuid, 'therapist-two@aura-demo.invalid'),
    ('30000000-0000-4000-8000-000000000001'::uuid, 'iris@aura-demo.invalid'),
    ('30000000-0000-4000-8000-000000000002'::uuid, 'mika@aura-demo.invalid'),
    ('30000000-0000-4000-8000-000000000003'::uuid, 'sol@aura-demo.invalid')
)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  id,
  'authenticated',
  'authenticated',
  email,
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 10)),
  now(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('synthetic', true),
  now(),
  now()
from seed_users
on conflict (id) do nothing;

with seed_users(id, email) as (
  values
    ('20000000-0000-4000-8000-000000000001'::uuid, 'therapist@aura-demo.invalid'),
    ('20000000-0000-4000-8000-000000000002'::uuid, 'therapist-two@aura-demo.invalid'),
    ('30000000-0000-4000-8000-000000000001'::uuid, 'iris@aura-demo.invalid'),
    ('30000000-0000-4000-8000-000000000002'::uuid, 'mika@aura-demo.invalid'),
    ('30000000-0000-4000-8000-000000000003'::uuid, 'sol@aura-demo.invalid')
)
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  id,
  id::text,
  id,
  jsonb_build_object(
    'sub', id::text,
    'email', email,
    'email_verified', true,
    'phone_verified', false,
    'synthetic', true
  ),
  'email',
  now(),
  now(),
  now()
from seed_users
on conflict do nothing;

insert into public.profiles (id, practice_id, role, username, display_name)
values
  (
    '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    'therapist', 'aura.demo.therapist', 'Demo Therapist — Fictional'
  ),
  (
    '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    'therapist', 'aura.demo.therapist.two', 'Demo Therapist Two — Fictional'
  ),
  (
    '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    'client', 'aura.demo.iris', 'Demo Iris — Fictional'
  ),
  (
    '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    'client', 'aura.demo.mika', 'Demo Mika — Fictional'
  ),
  (
    '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    'client', 'aura.demo.sol', 'Demo Sol — Fictional'
  )
on conflict (id) do update set
  practice_id = excluded.practice_id,
  role = excluded.role,
  username = excluded.username,
  display_name = excluded.display_name;

insert into public.therapist_profiles (
  user_id, practice_id, professional_name, contact_email, settings, reminder_preferences,
  directory_slug, professional_title, public_portrait_resource_id, public_portrait_path,
  directory_opt_in, accepting_online_bookings
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Demo Therapist — Fictional',
    'practice@aura-demo.invalid',
    '{"defaultDuration":60,"bonusMinutesThreshold":3}'::jsonb,
    '{"followUp":true,"appointmentRequests":true}'::jsonb,
    'aura-demo-therapist', 'Massage therapist — synthetic profile',
    '99000000-0000-4000-8000-000000000001', null, true, true
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Demo Therapist Two — Fictional',
    'practice-two@aura-demo.invalid',
    '{"defaultDuration":60,"bonusMinutesThreshold":3}'::jsonb,
    '{"followUp":true,"appointmentRequests":true}'::jsonb,
    'aura-demo-therapist-two', 'Massage therapist — synthetic profile',
    '99000000-0000-4000-8000-000000000002', null, true, true
  )
on conflict (user_id) do update set
  professional_name = excluded.professional_name,
  contact_email = excluded.contact_email,
  settings = excluded.settings,
  reminder_preferences = excluded.reminder_preferences,
  directory_slug = excluded.directory_slug,
  professional_title = excluded.professional_title,
  public_portrait_path = excluded.public_portrait_path,
  directory_opt_in = excluded.directory_opt_in,
  accepting_online_bookings = excluded.accepting_online_bookings;

insert into public.clients (
  id, practice_id, auth_user_id, preferred_name, legal_name, email, date_of_birth,
  intake_status, active, created_by
)
values
  (
    '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001', 'Demo Iris — Fictional',
    'Synthetic Iris Record', 'iris@aura-demo.invalid', date '1991-02-14', 'complete', true,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002', 'Demo Mika — Fictional',
    'Synthetic Mika Record', 'mika@aura-demo.invalid', date '1987-06-08', 'complete', true,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003', 'Demo Sol — Fictional',
    'Synthetic Sol Record', 'sol@aura-demo.invalid', date '1979-11-23', 'review_required', true,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
    null, 'Demo Pending — Fictional', 'Synthetic Pending Record',
    'pending@aura-demo.invalid', date '1995-04-19', 'pending', true,
    '20000000-0000-4000-8000-000000000001'
  )
on conflict (id) do update set
  auth_user_id = excluded.auth_user_id,
  preferred_name = excluded.preferred_name,
  legal_name = excluded.legal_name,
  email = excluded.email,
  date_of_birth = excluded.date_of_birth,
  intake_status = excluded.intake_status,
  active = excluded.active;

-- Explicit synthetic care-team memberships. Therapist One owns all four fixtures; Therapist Two
-- shares Iris only, proving that client progress is aggregated by client rather than provider.
insert into public.therapist_client_assignments (
  id, practice_id, client_id, therapist_user_id, assignment_source, assigned_by
)
values
  (
    '41000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    'trusted_administration', '20000000-0000-4000-8000-000000000001'
  ),
  (
    '41000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
    'trusted_administration', '20000000-0000-4000-8000-000000000001'
  ),
  (
    '41000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
    'trusted_administration', '20000000-0000-4000-8000-000000000001'
  ),
  (
    '41000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
    'trusted_administration', '20000000-0000-4000-8000-000000000001'
  ),
  (
    '41000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
    'trusted_administration', '20000000-0000-4000-8000-000000000001'
  )
on conflict (id) do nothing;

insert into public.consents (
  id, practice_id, client_id, consent_type, version, granted, granted_at, metadata
)
values
  (
    '71000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', 'health_data', 'demo-v1', true, now() - interval '100 days',
    '{"synthetic":true}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002', 'health_data', 'demo-v1', true, now() - interval '100 days',
    '{"synthetic":true}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', 'health_data', 'demo-v1', true, now() - interval '100 days',
    '{"synthetic":true}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', 'photography', 'demo-v1', true, now() - interval '60 days',
    '{"synthetic":true}'::jsonb
  ),
  (
    '73000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', 'handoff', 'demo-v1', true, now() - interval '2 days',
    '{"synthetic":true,"recipientReviewed":true}'::jsonb
  ),
  (
    '74000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', 'reminders', 'demo-v1', true, now() - interval '60 days',
    '{"synthetic":true,"channels":["in_app"]}'::jsonb
  )
on conflict (id) do nothing;

insert into public.health_conditions (
  id, practice_id, client_id, category, body_region, condition_or_procedure,
  approximate_date, clearance_status, restrictions, structured_metadata, active
)
values
  (
    '75000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', 'allergy', null,
    'Synthetic fragrance sensitivity', null, 'not_required', 'Avoid fragranced products',
    '{"source":"demo intake","lastReviewed":"2026-06-01"}'::jsonb, true
  ),
  (
    '75000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', 'recent_procedure', 'shoulder_right',
    'Synthetic prior procedure record', current_date - 150, 'pending',
    'Avoid this region until recorded clearance is reviewed',
    '{"source":"demo intake","lastReviewed":"2026-06-20"}'::jsonb, true
  )
on conflict (id) do nothing;

-- Six comparable completed appointments for each pattern fixture.
with series as (select generate_series(1, 6) as n)
insert into public.appointments (
  id, practice_id, client_id, therapist_user_id, starts_at, duration_minutes,
  session_type, status, intake_status_snapshot, requested_by, room
)
select
  ('51000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  case when n in (2, 5)
    then '20000000-0000-4000-8000-000000000002'::uuid
    else '20000000-0000-4000-8000-000000000001'::uuid
  end,
  date_trunc('day', now()) - ((6 - n) * interval '14 days') + interval '10 hours',
  60, 'Restorative session', 'completed', 'complete',
  '20000000-0000-4000-8000-000000000001', 'Studio One'
from series
on conflict (id) do nothing;

with series as (select generate_series(1, 6) as n)
insert into public.appointments (
  id, practice_id, client_id, therapist_user_id, starts_at, duration_minutes,
  session_type, status, intake_status_snapshot, requested_by, room
)
select
  ('52000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  date_trunc('day', now()) - ((6 - n) * interval '12 days') + interval '13 hours',
  60, 'Recovery session', 'completed', 'complete',
  '20000000-0000-4000-8000-000000000001', 'Studio One'
from series
on conflict (id) do nothing;

with series as (select generate_series(1, 6) as n)
insert into public.appointments (
  id, practice_id, client_id, therapist_user_id, starts_at, duration_minutes,
  session_type, status, intake_status_snapshot, requested_by, room
)
select
  ('53000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  date_trunc('day', now()) - ((6 - n) * interval '10 days') + interval '15 hours',
  60, 'Focused session', 'completed', 'review_required',
  '20000000-0000-4000-8000-000000000001', 'Studio Two'
from series
on conflict (id) do nothing;

insert into public.appointments (
  id, practice_id, client_id, therapist_user_id, starts_at, duration_minutes,
  session_type, status, intake_status_snapshot, requested_by, room
)
values (
  '54000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000001',
  date_trunc('day', now()) + interval '1 day 11 hours',
  60, 'First visit', 'confirmed', 'pending',
  '20000000-0000-4000-8000-000000000001', 'Studio One'
)
on conflict (id) do nothing;

insert into public.appointment_private_notes (
  appointment_id, practice_id, therapist_scheduling_note
)
values (
  '53000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001',
  'Synthetic private note: review recorded clearance and progress before the session.'
)
on conflict (appointment_id) do update
set therapist_scheduling_note = excluded.therapist_scheduling_note;

insert into public.functional_goals (
  id, practice_id, client_id, category, client_wording, body_region,
  baseline_score, importance, target_date, limitation_factors, status
)
values
  (
    '81000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', 'daily_living',
    'I want carrying my fictional weekend bag to feel more possible.', 'shoulder_left',
    2, 8, current_date + 45, array['fatigue'], 'active'
  ),
  (
    '81000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002', 'sport',
    'I want my synthetic garden routine to feel steadier.', 'lower_back_central',
    3, 7, current_date + 60, array['long_sitting'], 'active'
  ),
  (
    '81000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', 'mobility',
    'I want reaching a fictional high shelf to feel easier.', 'shoulder_right',
    7, 9, current_date + 30, array['sleep_variation'], 'active'
  )
on conflict (id) do nothing;

insert into public.functional_goal_professional_notes (goal_id, practice_id, professional_restriction)
values (
  '81000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'Synthetic private observation: do not treat the recorded region until clearance is reviewed.'
)
on conflict (goal_id) do update
set professional_restriction = excluded.professional_restriction;

-- Pain trend: improving, mixed, and sustained worsening.
with series as (select generate_series(1, 6) as n)
insert into public.pain_entries (
  practice_id, client_id, appointment_id, body_region, body_side,
  intensity, client_trend, descriptors, recorded_by, recorded_at
)
select
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  ('51000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'shoulder', 'left', 8 - n,
  case when n = 1 then 'new' else 'better' end,
  array['synthetic aching'], '30000000-0000-4000-8000-000000000001',
  date_trunc('day', now()) - ((6 - n) * interval '14 days') + interval '9 hours 45 minutes'
from series;

with series as (select generate_series(1, 6) as n)
insert into public.pain_entries (
  practice_id, client_id, appointment_id, body_region, body_side,
  intensity, client_trend, descriptors, recorded_by, recorded_at
)
select
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  ('52000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'lower_back', 'central', (array[7, 6, 5, 5, 4, 3])[n],
  case when n in (1, 4) then 'same' else 'better' end,
  array['synthetic tightness'], '30000000-0000-4000-8000-000000000002',
  date_trunc('day', now()) - ((6 - n) * interval '12 days') + interval '12 hours 45 minutes'
from series;

with series as (select generate_series(1, 6) as n)
insert into public.pain_entries (
  practice_id, client_id, appointment_id, body_region, body_side,
  intensity, client_trend, descriptors, recorded_by, recorded_at
)
select
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003',
  ('53000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'shoulder', 'right', n + 2,
  case when n = 1 then 'same' else 'worse' end,
  array['synthetic soreness'], '30000000-0000-4000-8000-000000000003',
  date_trunc('day', now()) - ((6 - n) * interval '10 days') + interval '14 hours 45 minutes'
from series;

-- Functional ability follows each fixture's expected pattern.
with fixture(goal_id, client_id, appointment_prefix, scores, recorder) as (
  values
    (
      '81000000-0000-4000-8000-000000000001'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid, '51', array[2,3,4,5,6,7],
      '30000000-0000-4000-8000-000000000001'::uuid
    ),
    (
      '81000000-0000-4000-8000-000000000002'::uuid,
      '40000000-0000-4000-8000-000000000002'::uuid, '52', array[3,4,4,5,4,5],
      '30000000-0000-4000-8000-000000000002'::uuid
    ),
    (
      '81000000-0000-4000-8000-000000000003'::uuid,
      '40000000-0000-4000-8000-000000000003'::uuid, '53', array[7,6,6,5,4,3],
      '30000000-0000-4000-8000-000000000003'::uuid
    )
), expanded as (
  select fixture.*, n, scores[n] as score from fixture cross join generate_series(1, 6) as n
)
insert into public.functional_goal_entries (
  practice_id, goal_id, client_id, appointment_id, score, recorded_by, recorded_at
)
select
  '10000000-0000-4000-8000-000000000001', goal_id, client_id,
  (appointment_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  score, recorder, now() - ((6 - n) * interval '12 days')
from expanded;

-- Comparable therapist observations. Mika's ROM improves while stiffness is
-- flat, creating the mixed fixture without a causal claim.
with fixture(client_id, appointment_prefix, stiffness, rom) as (
  values
    (
      '40000000-0000-4000-8000-000000000001'::uuid, '51',
      array[8,7,6,5,4,3], array[3,4,5,6,7,8]
    ),
    (
      '40000000-0000-4000-8000-000000000002'::uuid, '52',
      array[6,6,6,6,6,6], array[4,5,6,6,7,8]
    ),
    (
      '40000000-0000-4000-8000-000000000003'::uuid, '53',
      array[4,5,5,6,7,8], array[7,6,6,5,4,3]
    )
), expanded as (
  select fixture.*, n, stiffness[n] as stiffness_score, rom[n] as rom_score
  from fixture cross join generate_series(1, 6) as n
)
insert into public.therapist_assessments (
  practice_id, client_id, appointment_id, body_region, body_side,
  stiffness_score, rom_score, movement_name, measurement_method,
  therapist_private_note, recorded_by, recorded_at
)
select
  '10000000-0000-4000-8000-000000000001', client_id,
  (appointment_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case when appointment_prefix = '52' then 'lower_back' else 'shoulder' end,
  case when appointment_prefix = '51' then 'left'::public.body_side
       when appointment_prefix = '53' then 'right'::public.body_side
       else 'central'::public.body_side end,
  stiffness_score, rom_score, 'Synthetic comparable movement', 'prototype-0-to-10',
  'Synthetic therapist-only observation.',
  '20000000-0000-4000-8000-000000000001', now() - ((6 - n) * interval '12 days')
from expanded;

-- Completed session rows. Iris session six demonstrates confirmed Bonus Care Minutes.
with fixture(client_id, appointment_prefix, session_prefix) as (
  values
    ('40000000-0000-4000-8000-000000000001'::uuid, '51', '91'),
    ('40000000-0000-4000-8000-000000000002'::uuid, '52', '92'),
    ('40000000-0000-4000-8000-000000000003'::uuid, '53', '93')
), expanded as (
  select fixture.*, n from fixture cross join generate_series(1, 6) as n
)
insert into public.session_records (
  id, practice_id, appointment_id, client_id, therapist_user_id,
  started_at, finished_at, booked_minutes, actual_minutes,
  confirmed_bonus_minutes, pressure_level, client_visible_summary, sync_status
)
select
  (session_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  (appointment_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  expanded.client_id, '20000000-0000-4000-8000-000000000001',
  a.starts_at,
  a.starts_at + make_interval(mins => case when appointment_prefix = '51' and n = 6 then 66 else 60 end),
  60,
  case when appointment_prefix = '51' and n = 6 then 66 else 60 end,
  case when appointment_prefix = '51' and n = 6 then 6 else 0 end,
  5,
  'Synthetic completed-session summary for this fictional demo record.',
  'synced'
from expanded
join public.appointments a
  on a.id = (appointment_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
on conflict (id) do nothing;

insert into public.session_private_notes (session_id, practice_id, therapist_private_summary)
values (
  '93000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001',
  'Synthetic private session note: review progress and recorded clearance status.'
)
on conflict (session_id) do update
set therapist_private_summary = excluded.therapist_private_summary;

with sessions as (
  select id, practice_id, client_id
  from public.session_records
  where id::text like '9%000000-0000-4000-8000-%'
)
insert into public.session_interventions (
  practice_id, session_id, client_id, body_region, intervention_type, pressure_level, display_order
)
select
  practice_id, id, client_id,
  case when client_id = '40000000-0000-4000-8000-000000000002' then 'lower_back' else 'shoulder' end,
  'Synthetic structured intervention', 5, 1
from sessions;

-- Prior sessions have responses; each latest session remains eligible for a
-- next-day follow-up instead of treating absence as a negative result.
with fixture(client_id, appointment_prefix, goal_id, response) as (
  values
    (
      '40000000-0000-4000-8000-000000000001'::uuid, '51',
      '81000000-0000-4000-8000-000000000001'::uuid, 'better'::public.session_response_type
    ),
    (
      '40000000-0000-4000-8000-000000000002'::uuid, '52',
      '81000000-0000-4000-8000-000000000002'::uuid, 'similar'::public.session_response_type
    ),
    (
      '40000000-0000-4000-8000-000000000003'::uuid, '53',
      '81000000-0000-4000-8000-000000000003'::uuid, 'worse'::public.session_response_type
    )
), expanded as (
  select fixture.*, n from fixture cross join generate_series(1, 5) as n
)
insert into public.follow_up_responses (
  practice_id, appointment_id, client_id, response,
  functional_goal_id, optional_goal_score, optional_comment, recorded_at
)
select
  '10000000-0000-4000-8000-000000000001',
  (appointment_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  client_id, response, goal_id,
  case when appointment_prefix = '51' then least(n + 2, 10)
       when appointment_prefix = '53' then greatest(8 - n, 0)
       else 4 end,
  'Synthetic next-day response.', now() - ((5 - n) * interval '12 days')
from expanded;

insert into public.context_events (
  id, practice_id, client_id, appointment_id, event_type, description,
  occurred_at, recorded_by, recorded_at
)
values
  (
    'a1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000003',
    'sport', 'Synthetic event marker: recreational sport.', now() - interval '42 days',
    '30000000-0000-4000-8000-000000000001', now() - interval '42 days'
  ),
  (
    'a1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000004',
    'long_drive', 'Synthetic event marker: long drive.', now() - interval '24 days',
    '30000000-0000-4000-8000-000000000002', now() - interval '24 days'
  ),
  (
    'a1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000005',
    'poor_sleep', 'Synthetic event marker: poor sleep.', now() - interval '10 days',
    '30000000-0000-4000-8000-000000000003', now() - interval '10 days'
  )
on conflict (id) do nothing;

insert into public.insights (
  id, practice_id, client_id, appointment_id, pattern_type, engine_version,
  rule_version, confidence, structured_evidence, client_narration,
  status, approved_by, approved_at
)
values
  (
    'b1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000006',
    'improving', 'prototype-v1', 'prototype-v1', 0.86,
    '{"pointCount":6,"recoveryIndexDelta":42,"disclaimer":"Prototype pattern thresholds — not clinically validated."}'::jsonb,
    'Across six comparable synthetic observations, the recorded measures show a favourable pattern. This is an observation, not a diagnosis.',
    'approved', '20000000-0000-4000-8000-000000000001', now()
  ),
  (
    'b1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000006',
    'mixed', 'prototype-v1', 'prototype-v1', 0.72,
    '{"pointCount":6,"painDelta":40,"stiffnessDelta":0,"disclaimer":"Prototype pattern thresholds — not clinically validated."}'::jsonb,
    'The synthetic measures move in different directions, so AURA labels this pattern mixed and preserves that uncertainty.',
    'approved', '20000000-0000-4000-8000-000000000001', now()
  ),
  (
    'b1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000006',
    'medical_review_consideration', 'prototype-v1', 'prototype-v1', 0.88,
    '{"pointCount":6,"painRunAtOrAboveSeven":2,"recoveryIndexDelta":-40,"disclaimer":"Prototype pattern thresholds — not clinically validated."}'::jsonb,
    'The synthetic record meets the configured review-consideration threshold. This does not identify a cause or diagnosis.',
    'approved', '20000000-0000-4000-8000-000000000001', now()
  ),
  (
    'b1000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', null,
    'maintenance', 'prototype-v1', 'prototype-v1', 0.44,
    '{"pointCount":3,"draft":true,"disclaimer":"Prototype pattern thresholds — not clinically validated."}'::jsonb,
    null, 'draft', null, null
  )
on conflict (id) do nothing;

insert into public.insight_private_narrations (
  insight_id, practice_id, therapist_narration, raw_provider_response
)
values
  (
    'b1000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Synthetic therapist narration: review the exact evidence and use professional judgment.',
    null
  ),
  (
    'b1000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'Synthetic draft narration that must remain unavailable to clients.',
    '{"provider":"deterministic-fallback","synthetic":true}'::jsonb
  )
on conflict (insight_id) do update
set therapist_narration = excluded.therapist_narration,
    raw_provider_response = excluded.raw_provider_response;

insert into public.handoff_exports (
  id, practice_id, client_id, created_by, recipient_name, recipient_organization,
  purpose, date_from, date_to, included_sections, expires_at, status
)
values (
  'c1000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  'Demo Recipient — Fictional', 'Synthetic Referral Practice',
  'Therapist-reviewed synthetic progress handoff.',
  current_date - 90, current_date,
  '["executive_summary","functional_goals","pain","stiffness","rom","session_response","context_events"]'::jsonb,
  now() + interval '7 days', 'awaiting_consent'
)
on conflict (id) do nothing;

insert into public.handoff_export_approvals (
  id, practice_id, handoff_export_id, client_id, approved_by, standing_consent_id,
  recipient_name_snapshot, recipient_organization_snapshot, purpose_snapshot,
  included_sections_snapshot, approved_expires_at
)
select
  'c2000000-0000-4000-8000-000000000003', he.practice_id, he.id, he.client_id,
  '30000000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000003',
  he.recipient_name, he.recipient_organization, he.purpose,
  he.included_sections, he.expires_at
from public.handoff_exports he
where he.id = 'c1000000-0000-4000-8000-000000000003'
on conflict (id) do nothing;

update public.handoff_exports
set status = 'consented'
where id = 'c1000000-0000-4000-8000-000000000003'
  and status = 'awaiting_consent';

insert into public.handoff_secrets (handoff_export_id, practice_id)
values (
  'c1000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001'
)
on conflict (handoff_export_id) do nothing;

insert into public.notification_outbox (
  id, practice_id, client_id, appointment_id, channel, template_key,
  payload, scheduled_for, status
)
values
  (
    'd1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000006',
    'in_app', 'next_day_follow_up', '{"synthetic":true}'::jsonb,
    date_trunc('day', now()) + interval '1 day 9 hours', 'pending'
  ),
  (
    'd1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000006',
    'in_app', 'review_progress', '{"synthetic":true,"pattern":"medical_review_consideration"}'::jsonb,
    now(), 'pending'
  )
on conflict (id) do nothing;

insert into public.brand_config (
  practice_id, logo_path, accent_values, typography_configuration,
  bonus_minutes_label, quote_library, locale, feature_flags
)
values (
  '10000000-0000-4000-8000-000000000001', null,
  '{"gold":"#b88a44","violet":"#7c6aa6"}'::jsonb,
  '{"display":"editorial-serif","body":"system-sans"}'::jsonb,
  'Bonus Care Minutes',
  '["Synthetic pause, thoughtfully held.","A fictional record can still demonstrate a careful workflow."]'::jsonb,
  'en-GB',
  '{"aiNarration":false,"secureHandoffLinks":true,"transcription":false,"synthetic":true}'::jsonb
)
on conflict (practice_id) do update set
  accent_values = excluded.accent_values,
  typography_configuration = excluded.typography_configuration,
  bonus_minutes_label = excluded.bonus_minutes_label,
  quote_library = excluded.quote_library,
  locale = excluded.locale,
  feature_flags = excluded.feature_flags;

insert into public.knowledge_rules (
  id, practice_id, rule_key, rule_version, enabled, configuration,
  source_label, reviewed, effective_at
)
values
  (
    'e1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    'pattern-thresholds', 'prototype-v1', true,
    '{"minimumComparablePoints":3,"limitedChangeMinimumPoints":4,"painHighThreshold":7,"painHighConsecutiveRun":2,"contextWindowHours":72,"label":"Prototype pattern thresholds — not clinically validated."}'::jsonb,
    'AURA synthetic prototype configuration', true, now() - interval '120 days'
  ),
  (
    'e1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    'focus-cautions', 'prototype-v1', true,
    '{"facts":["anticoagulants","recent_surgery","pregnancy","skin_conditions","allergies","avoid_until_cleared","missing_clearance","missing_required_intake"],"inferRestrictions":false}'::jsonb,
    'AURA synthetic prototype configuration', false, now() - interval '120 days'
  )
on conflict (id) do nothing;

insert into public.audit_events (
  id, practice_id, actor_user_id, action, resource_type, resource_id, safe_metadata
)
values
  (
    'f1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001', 'insight.approved', 'insight',
    'b1000000-0000-4000-8000-000000000003',
    '{"synthetic":true,"pattern":"medical_review_consideration"}'::jsonb
  ),
  (
    'f1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001', 'handoff.created', 'handoff_export',
    'c1000000-0000-4000-8000-000000000003',
    '{"synthetic":true,"sectionCount":7}'::jsonb
  )
on conflict (id) do nothing;
