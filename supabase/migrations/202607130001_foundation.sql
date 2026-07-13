-- AURA single-practice foundation.
-- All timestamps are stored as timestamptz (UTC internally). Presentation uses
-- practices.timezone. JSONB is reserved for extensible configuration/evidence.

create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('therapist', 'client');
create type public.appointment_status as enum (
  'requested', 'pending', 'confirmed', 'completed', 'cancelled', 'declined'
);
create type public.intake_status as enum ('pending', 'partial', 'complete', 'review_required');
create type public.goal_status as enum ('active', 'achieved', 'paused', 'revised', 'archived');
create type public.consent_type as enum (
  'health_data', 'photography', 'reminders', 'handoff', 'ai_processing'
);
create type public.insight_status as enum ('draft', 'approved', 'rejected');
create type public.pattern_type as enum (
  'building_baseline',
  'improving',
  'mixed',
  'limited_change',
  'maintenance',
  'sustained_worsening',
  'medical_review_consideration'
);
create type public.session_response_type as enum (
  'much_better', 'better', 'similar', 'tender_acceptable', 'worse', 'significantly_worse'
);
create type public.body_side as enum ('left', 'right', 'central', 'bilateral', 'not_applicable');

create table public.practices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  locale text not null default 'en-GB',
  timezone text not null default 'Europe/Zurich',
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete restrict,
  role public.user_role not null,
  username text not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_practice_id_id_key unique (practice_id, id),
  constraint profiles_username_normalized_check check (
    username = lower(btrim(username)) and username ~ '^[a-z][a-z0-9._-]{2,31}$'
  ),
  constraint profiles_username_key unique (username)
);

comment on column public.profiles.username is
  'Normalized login alias. Never expose a username-to-email mapping through a table or view.';
comment on column public.profiles.role is
  'Authorization role controlled by backend administration, never entrance-screen state or user metadata.';

create table public.therapist_profiles (
  user_id uuid primary key,
  practice_id uuid not null,
  professional_name text not null check (char_length(btrim(professional_name)) between 1 and 160),
  contact_email text,
  contact_phone text,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  reminder_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(reminder_preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (practice_id, user_id) references public.profiles(practice_id, id) on delete cascade
);

comment on column public.therapist_profiles.settings is 'Therapist-only operational settings; never client-readable.';
comment on column public.therapist_profiles.reminder_preferences is 'Therapist-only notification preferences.';

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete restrict,
  auth_user_id uuid,
  preferred_name text not null check (char_length(btrim(preferred_name)) between 1 and 120),
  legal_name text check (legal_name is null or char_length(btrim(legal_name)) between 1 and 180),
  email text,
  phone text,
  date_of_birth date check (date_of_birth is null or date_of_birth <= current_date),
  intake_status public.intake_status not null default 'pending',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_practice_id_id_key unique (practice_id, id),
  constraint clients_auth_user_id_key unique (auth_user_id),
  foreign key (practice_id, auth_user_id) references public.profiles(practice_id, id)
    on delete set null (auth_user_id)
);

comment on table public.clients is 'Identity and contact information. No clinical narrative belongs in this table.';

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete restrict,
  client_id uuid not null,
  therapist_user_id uuid not null,
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 10 and 480),
  session_type text not null check (char_length(btrim(session_type)) between 1 and 80),
  status public.appointment_status not null default 'pending',
  intake_status_snapshot public.intake_status not null default 'pending',
  requested_by uuid references auth.users(id) on delete set null,
  room text check (room is null or char_length(room) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_practice_id_id_key unique (practice_id, id),
  constraint appointments_practice_id_id_client_id_key unique (practice_id, id, client_id),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade,
  foreign key (practice_id, therapist_user_id) references public.profiles(practice_id, id) on delete restrict
);

create table public.appointment_private_notes (
  appointment_id uuid primary key,
  practice_id uuid not null,
  therapist_scheduling_note text,
  updated_at timestamptz not null default now(),
  foreign key (practice_id, appointment_id) references public.appointments(practice_id, id) on delete cascade
);

comment on table public.appointment_private_notes is
  'Therapist-only scheduling notes, separated so a client-safe appointment row cannot leak them.';

create table public.health_conditions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  category text not null check (char_length(btrim(category)) between 1 and 80),
  body_region text,
  condition_or_procedure text not null check (char_length(btrim(condition_or_procedure)) between 1 and 240),
  approximate_date date,
  clearance_status text not null default 'unknown'
    check (clearance_status in ('not_required', 'pending', 'cleared', 'restricted', 'unknown')),
  restrictions text,
  structured_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(structured_metadata) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_conditions_practice_id_id_key unique (practice_id, id),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade
);

comment on column public.health_conditions.restrictions is
  'A recorded restriction or clearance statement, not an inferred diagnosis.';

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  consent_type public.consent_type not null,
  version text not null check (char_length(btrim(version)) between 1 and 40),
  granted boolean not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  guardian_name text,
  guardian_relationship text,
  guardian_confirmed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consents_practice_id_id_key unique (practice_id, id),
  constraint consents_client_type_version_key unique (client_id, consent_type, version),
  constraint consents_grant_timestamps_check check (
    (
      (granted and granted_at is not null)
      or (not granted and granted_at is null and revoked_at is null)
    )
    and (revoked_at is null or (granted_at is not null and revoked_at >= granted_at))
  ),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade
);

create unique index consents_one_active_grant_idx
  on public.consents(client_id, consent_type)
  where granted and revoked_at is null;

create table public.pain_entries (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  appointment_id uuid,
  body_region text not null check (char_length(btrim(body_region)) between 1 and 80),
  body_side public.body_side not null default 'not_applicable',
  intensity smallint not null check (intensity between 0 and 10),
  client_trend text check (client_trend in ('better', 'same', 'worse', 'new', 'resolved')),
  descriptors text[] not null default '{}'::text[] check (cardinality(descriptors) <= 12),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pain_entries_practice_id_id_key unique (practice_id, id),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade,
  foreign key (practice_id, appointment_id, client_id)
    references public.appointments(practice_id, id, client_id) on delete cascade
);

create table public.functional_goals (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  category text not null check (char_length(btrim(category)) between 1 and 80),
  client_wording text not null check (char_length(btrim(client_wording)) between 1 and 500),
  body_region text,
  baseline_score smallint not null check (baseline_score between 0 and 10),
  importance smallint check (importance between 0 and 10),
  target_date date,
  limitation_factors text[] not null default '{}'::text[] check (cardinality(limitation_factors) <= 12),
  status public.goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint functional_goals_practice_id_id_key unique (practice_id, id),
  constraint functional_goals_practice_id_id_client_id_key unique (practice_id, id, client_id),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade
);

create table public.functional_goal_professional_notes (
  goal_id uuid primary key,
  practice_id uuid not null,
  professional_restriction text,
  updated_at timestamptz not null default now(),
  foreign key (practice_id, goal_id) references public.functional_goals(practice_id, id) on delete cascade
);

comment on table public.functional_goal_professional_notes is
  'Therapist-only observations kept outside the client-visible functional goal.';

create table public.functional_goal_entries (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  goal_id uuid not null,
  client_id uuid not null,
  appointment_id uuid,
  score smallint not null check (score between 0 and 10),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint functional_goal_entries_practice_id_id_key unique (practice_id, id),
  foreign key (practice_id, goal_id, client_id)
    references public.functional_goals(practice_id, id, client_id) on delete cascade,
  foreign key (practice_id, appointment_id, client_id)
    references public.appointments(practice_id, id, client_id) on delete cascade
);

create table public.therapist_assessments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  appointment_id uuid,
  body_region text not null check (char_length(btrim(body_region)) between 1 and 80),
  body_side public.body_side not null default 'not_applicable',
  stiffness_score smallint check (stiffness_score between 0 and 10),
  rom_score smallint check (rom_score between 0 and 10),
  movement_name text,
  measurement_method text,
  therapist_private_note text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint therapist_assessments_practice_id_id_key unique (practice_id, id),
  constraint therapist_assessments_measurement_check check (
    rom_score is null or (movement_name is not null and measurement_method is not null)
  ),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade,
  foreign key (practice_id, appointment_id, client_id)
    references public.appointments(practice_id, id, client_id) on delete cascade
);

comment on table public.therapist_assessments is 'Therapist-only professional observation table.';
comment on column public.therapist_assessments.therapist_private_note is
  'Never client-readable; a separately approved client summary belongs in an insight/session record.';

create table public.context_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  appointment_id uuid,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 80),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  occurred_at timestamptz not null,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint context_events_practice_id_id_key unique (practice_id, id),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade,
  foreign key (practice_id, appointment_id, client_id)
    references public.appointments(practice_id, id, client_id) on delete cascade
);

create table public.session_records (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  appointment_id uuid not null,
  client_id uuid not null,
  therapist_user_id uuid not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  booked_minutes integer not null check (booked_minutes between 10 and 480),
  actual_minutes integer check (actual_minutes between 0 and 720),
  confirmed_bonus_minutes integer not null default 0 check (confirmed_bonus_minutes between 0 and 240),
  pressure_level smallint check (pressure_level between 0 and 10),
  client_visible_summary text,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'syncing', 'synced', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_records_practice_id_id_key unique (practice_id, id),
  constraint session_records_practice_id_id_client_id_key unique (practice_id, id, client_id),
  constraint session_records_appointment_id_key unique (appointment_id),
  constraint session_records_time_check check (finished_at is null or finished_at >= started_at),
  constraint session_records_duration_check check (
    actual_minutes is null or finished_at is not null
  ),
  constraint session_records_bonus_check check (
    (actual_minutes is null and confirmed_bonus_minutes = 0)
    or (
      actual_minutes is not null
      and confirmed_bonus_minutes <= greatest(actual_minutes - booked_minutes, 0)
    )
  ),
  foreign key (practice_id, appointment_id, client_id)
    references public.appointments(practice_id, id, client_id) on delete cascade,
  foreign key (practice_id, therapist_user_id) references public.profiles(practice_id, id) on delete restrict
);

create table public.session_private_notes (
  session_id uuid primary key,
  practice_id uuid not null,
  therapist_private_summary text,
  voice_note_path text,
  updated_at timestamptz not null default now(),
  foreign key (practice_id, session_id) references public.session_records(practice_id, id) on delete cascade
);

comment on table public.session_private_notes is
  'Therapist-only wrap-up content and private voice-note reference.';

create table public.session_interventions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  session_id uuid not null,
  client_id uuid not null,
  body_region text not null check (char_length(btrim(body_region)) between 1 and 80),
  intervention_type text not null check (char_length(btrim(intervention_type)) between 1 and 120),
  pressure_level smallint check (pressure_level between 0 and 10),
  display_order smallint not null default 0 check (display_order between 0 and 100),
  created_at timestamptz not null default now(),
  constraint session_interventions_practice_id_id_key unique (practice_id, id),
  foreign key (practice_id, session_id, client_id)
    references public.session_records(practice_id, id, client_id) on delete cascade
);

create table public.follow_up_responses (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  appointment_id uuid not null,
  client_id uuid not null,
  response public.session_response_type not null,
  functional_goal_id uuid,
  optional_goal_score smallint check (optional_goal_score between 0 and 10),
  optional_comment text check (optional_comment is null or char_length(optional_comment) <= 1000),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint follow_up_responses_appointment_client_key unique (appointment_id, client_id),
  constraint follow_up_responses_goal_score_check check (
    (functional_goal_id is null and optional_goal_score is null)
    or functional_goal_id is not null
  ),
  foreign key (practice_id, appointment_id, client_id)
    references public.appointments(practice_id, id, client_id) on delete cascade,
  foreign key (practice_id, functional_goal_id, client_id)
    references public.functional_goals(practice_id, id, client_id)
    on delete set null (functional_goal_id)
);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  appointment_id uuid,
  storage_path text not null unique,
  view_type text not null check (view_type in ('front', 'side_left', 'side_right', 'back')),
  phase text not null check (phase in ('before', 'after', 'reference')),
  consent_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  captured_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint progress_photos_practice_id_id_key unique (practice_id, id),
  constraint progress_photos_practice_consent_key foreign key (practice_id, consent_id)
    references public.consents(practice_id, id) on delete restrict,
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade,
  foreign key (practice_id, appointment_id, client_id)
    references public.appointments(practice_id, id, client_id) on delete cascade
);

comment on column public.progress_photos.storage_path is
  'Private object path only. Never persist a public URL or put client/health text in filenames.';

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  appointment_id uuid,
  pattern_type public.pattern_type not null,
  engine_version text not null,
  rule_version text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  structured_evidence jsonb not null check (jsonb_typeof(structured_evidence) = 'object'),
  client_narration text,
  status public.insight_status not null default 'draft',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insights_practice_id_id_key unique (practice_id, id),
  constraint insights_approval_check check (
    (status = 'approved' and approved_by is not null and approved_at is not null and client_narration is not null)
    or (status <> 'approved' and approved_at is null)
  ),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade,
  foreign key (practice_id, appointment_id, client_id)
    references public.appointments(practice_id, id, client_id) on delete cascade
);

create table public.insight_private_narrations (
  insight_id uuid primary key,
  practice_id uuid not null,
  therapist_narration text,
  raw_provider_response jsonb,
  updated_at timestamptz not null default now(),
  foreign key (practice_id, insight_id) references public.insights(practice_id, id) on delete cascade
);

comment on table public.insight_private_narrations is
  'Therapist-only narration and optional provider response; clients receive only approved insights.client_narration.';

create table public.handoff_exports (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  recipient_name text not null check (char_length(btrim(recipient_name)) between 1 and 160),
  recipient_organization text,
  purpose text not null check (char_length(btrim(purpose)) between 1 and 500),
  date_from date not null,
  date_to date not null,
  included_sections jsonb not null default '[]'::jsonb check (jsonb_typeof(included_sections) = 'array'),
  expires_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_consent', 'consented', 'generated', 'shared', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accessed_at timestamptz,
  revoked_at timestamptz,
  constraint handoff_exports_practice_id_id_key unique (practice_id, id),
  constraint handoff_exports_practice_id_id_client_id_key unique (practice_id, id, client_id),
  constraint handoff_exports_date_range_check check (date_to >= date_from),
  constraint handoff_exports_expiry_check check (expires_at is null or expires_at > created_at),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade
);

create table public.handoff_export_approvals (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  handoff_export_id uuid not null,
  client_id uuid not null,
  approved_by uuid not null,
  standing_consent_id uuid not null,
  recipient_name_snapshot text not null
    check (char_length(btrim(recipient_name_snapshot)) between 1 and 160),
  recipient_organization_snapshot text
    check (
      recipient_organization_snapshot is null
      or char_length(btrim(recipient_organization_snapshot)) between 1 and 160
    ),
  purpose_snapshot text not null
    check (char_length(btrim(purpose_snapshot)) between 1 and 500),
  included_sections_snapshot jsonb not null,
  approved_expires_at timestamptz not null,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint handoff_export_approvals_practice_id_id_key unique (practice_id, id),
  constraint handoff_export_approvals_sections_check check (
    case
      when jsonb_typeof(included_sections_snapshot) = 'array'
        then jsonb_array_length(included_sections_snapshot) between 1 and 32
      else false
    end
  ),
  constraint handoff_export_approvals_expiry_check check (approved_expires_at > approved_at),
  constraint handoff_export_approvals_revocation_check check (
    revoked_at is null or revoked_at >= approved_at
  ),
  foreign key (practice_id, handoff_export_id, client_id)
    references public.handoff_exports(practice_id, id, client_id) on delete cascade,
  foreign key (practice_id, standing_consent_id)
    references public.consents(practice_id, id) on delete restrict,
  foreign key (practice_id, approved_by)
    references public.profiles(practice_id, id) on delete restrict
);

create unique index handoff_export_approvals_one_active_idx
  on public.handoff_export_approvals(handoff_export_id)
  where revoked_at is null;

comment on table public.handoff_export_approvals is
  'Append-only per-export client approval snapshot of recipient, purpose, included categories, and maximum expiry. Standing handoff consent alone never authorizes an export.';

create table public.handoff_secrets (
  handoff_export_id uuid primary key,
  practice_id uuid not null,
  storage_path text,
  token_hash text unique,
  token_created_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (practice_id, handoff_export_id)
    references public.handoff_exports(practice_id, id) on delete cascade
);

comment on table public.handoff_secrets is
  'Therapist/service-only object path and one-way handoff token hash. Raw tokens are never stored.';

create table public.handoff_responses (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  handoff_export_id uuid not null,
  response_data jsonb not null check (jsonb_typeof(response_data) = 'object'),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint handoff_responses_practice_id_id_key unique (practice_id, id),
  foreign key (practice_id, handoff_export_id)
    references public.handoff_exports(practice_id, id) on delete cascade
);

comment on column public.handoff_responses.response_data is
  'Recipient response only; validated and size-limited by the secure handoff Edge Function.';

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(btrim(action)) between 1 and 100),
  resource_type text not null check (char_length(btrim(resource_type)) between 1 and 80),
  resource_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.audit_events is
  'Append-only, privacy-safe audit events. Never include tokens, URLs, passwords, narratives, or transcripts.';

create table public.brand_config (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  logo_path text check (
    logo_path is null
    or (char_length(logo_path) <= 512 and logo_path !~* '^(https?:|data:|javascript:)')
  ),
  portrait_path text check (
    portrait_path is null
    or (char_length(portrait_path) <= 512 and portrait_path !~* '^(https?:|data:|javascript:)')
  ),
  accent_values jsonb not null default '{}'::jsonb check (jsonb_typeof(accent_values) = 'object'),
  typography_configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(typography_configuration) = 'object'),
  bonus_minutes_label text not null default 'Bonus Care Minutes'
    check (char_length(btrim(bonus_minutes_label)) between 1 and 80),
  quote_library jsonb not null default '[]'::jsonb check (jsonb_typeof(quote_library) = 'array'),
  locale text not null default 'en-GB',
  feature_flags jsonb not null default '{}'::jsonb check (jsonb_typeof(feature_flags) = 'object'),
  updated_at timestamptz not null default now()
);

create table public.knowledge_rules (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  rule_key text not null,
  rule_version text not null,
  enabled boolean not null default true,
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
  source_label text not null,
  reviewed boolean not null default false,
  effective_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_rules_key_version_key unique (practice_id, rule_key, rule_version),
  constraint knowledge_rules_dates_check check (retired_at is null or retired_at > effective_at)
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  appointment_id uuid,
  channel text not null check (channel in ('in_app', 'email', 'sms', 'push')),
  template_key text not null check (char_length(btrim(template_key)) between 1 and 100),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (practice_id, client_id) references public.clients(practice_id, id) on delete cascade,
  foreign key (practice_id, appointment_id, client_id)
    references public.appointments(practice_id, id, client_id) on delete cascade
);

-- Edge Functions use this service-only table for coarse abuse protection. It
-- stores keyed hashes, never raw usernames, email addresses, or IP addresses.
create table public.auth_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now()
);

-- High-value query indexes and uniqueness beyond primary keys.
create index profiles_practice_role_idx on public.profiles(practice_id, role);
create index clients_practice_active_name_idx on public.clients(practice_id, active, preferred_name);
create index clients_practice_intake_idx on public.clients(practice_id, intake_status) where active;
create index appointments_practice_starts_idx on public.appointments(practice_id, starts_at);
create index appointments_client_starts_idx on public.appointments(client_id, starts_at desc);
create index appointments_status_starts_idx on public.appointments(status, starts_at);
create index health_conditions_client_active_idx on public.health_conditions(client_id, active);
create index consents_client_type_idx on public.consents(client_id, consent_type, created_at desc);
create index pain_entries_client_recorded_idx on public.pain_entries(client_id, recorded_at desc);
create index pain_entries_client_region_recorded_idx
  on public.pain_entries(client_id, body_region, body_side, recorded_at desc);
create index functional_goals_client_status_idx on public.functional_goals(client_id, status);
create index functional_goal_entries_goal_recorded_idx
  on public.functional_goal_entries(goal_id, recorded_at desc);
create index therapist_assessments_client_recorded_idx
  on public.therapist_assessments(client_id, recorded_at desc);
create index context_events_client_occurred_idx on public.context_events(client_id, occurred_at desc);
create index session_records_client_started_idx on public.session_records(client_id, started_at desc);
create index session_interventions_session_order_idx
  on public.session_interventions(session_id, display_order);
create index follow_up_responses_client_recorded_idx
  on public.follow_up_responses(client_id, recorded_at desc);
create index progress_photos_client_captured_idx on public.progress_photos(client_id, captured_at desc);
create index insights_client_created_idx on public.insights(client_id, created_at desc);
create index insights_client_status_idx on public.insights(client_id, status);
create index handoff_exports_client_created_idx on public.handoff_exports(client_id, created_at desc);
create index handoff_exports_expiry_idx on public.handoff_exports(expires_at) where status = 'shared';
create index handoff_export_approvals_client_created_idx
  on public.handoff_export_approvals(client_id, created_at desc);
create index handoff_responses_export_idx on public.handoff_responses(handoff_export_id, submitted_at);
create index audit_events_practice_created_idx on public.audit_events(practice_id, created_at desc);
create index audit_events_resource_idx on public.audit_events(resource_type, resource_id, created_at desc);
create index knowledge_rules_active_idx
  on public.knowledge_rules(practice_id, rule_key, effective_at desc) where enabled;
create index notification_outbox_due_idx
  on public.notification_outbox(status, scheduled_for) where status = 'pending';
create index auth_rate_limits_updated_idx on public.auth_rate_limits(updated_at);
