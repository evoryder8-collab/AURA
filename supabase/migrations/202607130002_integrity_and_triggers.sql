-- Cross-record invariants, immutable authorization fields, and timestamps.

create schema if not exists aura_private;
revoke all on schema aura_private from public, anon, authenticated;

create or replace function aura_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'practices', 'profiles', 'therapist_profiles', 'clients', 'appointments',
    'appointment_private_notes', 'health_conditions', 'consents', 'functional_goals',
    'functional_goal_professional_notes', 'session_records', 'session_private_notes',
    'insights', 'insight_private_narrations', 'handoff_exports', 'handoff_secrets',
    'brand_config', 'knowledge_rules', 'notification_outbox', 'auth_rate_limits'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function aura_private.set_updated_at()',
      target_table
    );
  end loop;
end;
$$;

create or replace function aura_private.user_has_role(
  target_user_id uuid,
  target_practice_id uuid,
  expected_role public.user_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.practice_id = target_practice_id
      and p.role = expected_role
  );
$$;

revoke all on function aura_private.user_has_role(uuid, uuid, public.user_role) from public;

create or replace function aura_private.validate_therapist_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not aura_private.user_has_role(new.user_id, new.practice_id, 'therapist') then
    raise exception 'therapist profile requires a therapist role in the same practice'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_therapist_profile
before insert or update on public.therapist_profiles
for each row execute function aura_private.validate_therapist_profile();

create or replace function aura_private.validate_client_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is not null
     and not aura_private.user_has_role(new.auth_user_id, new.practice_id, 'client') then
    raise exception 'client auth link requires a client role in the same practice'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_client_auth_link
before insert or update of auth_user_id, practice_id on public.clients
for each row execute function aura_private.validate_client_auth_link();

create or replace function aura_private.validate_appointment_therapist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not aura_private.user_has_role(new.therapist_user_id, new.practice_id, 'therapist') then
    raise exception 'appointment therapist must have a therapist role in the same practice'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_appointment_therapist
before insert or update of therapist_user_id, practice_id on public.appointments
for each row execute function aura_private.validate_appointment_therapist();

create or replace function aura_private.validate_session_therapist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not aura_private.user_has_role(new.therapist_user_id, new.practice_id, 'therapist') then
    raise exception 'session therapist must have a therapist role in the same practice'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_session_therapist
before insert or update of therapist_user_id, practice_id on public.session_records
for each row execute function aura_private.validate_session_therapist();

create or replace function aura_private.validate_assessment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not aura_private.user_has_role(new.recorded_by, new.practice_id, 'therapist') then
    raise exception 'therapist assessments require a therapist author in the same practice'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_assessment_author
before insert or update of recorded_by, practice_id on public.therapist_assessments
for each row execute function aura_private.validate_assessment_author();

create or replace function aura_private.validate_consent_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.granted and new.granted_at is null then
      new.granted_at := now();
    end if;
  else
    if old.revoked_at is not null and (
      new.granted is distinct from old.granted
      or new.granted_at is distinct from old.granted_at
      or new.revoked_at is distinct from old.revoked_at
    ) then
      raise exception 'revoked consent history is immutable; create a new version to grant again'
        using errcode = '42501';
    end if;
    if old.granted and old.revoked_at is null and not new.granted then
      -- Preserve the original grant timestamp. A revoked grant remains an
      -- historical grant but is inactive because revoked_at is populated.
      new.granted := true;
      new.granted_at := old.granted_at;
      new.revoked_at := coalesce(new.revoked_at, now());
    elsif not old.granted and new.granted then
      new.granted_at := coalesce(new.granted_at, now());
      new.revoked_at := null;
    end if;
  end if;

  if new.granted then
    new.granted_at := coalesce(new.granted_at, now());
  else
    new.granted_at := null;
    new.revoked_at := null;
  end if;
  return new;
end;
$$;

create trigger normalize_consent_state
before insert or update of granted, granted_at, revoked_at on public.consents
for each row execute function aura_private.validate_consent_state();

create or replace function aura_private.validate_progress_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  consent_ok boolean;
  expected_prefix text;
begin
  select exists (
    select 1
    from public.consents c
    where c.id = new.consent_id
      and c.practice_id = new.practice_id
      and c.client_id = new.client_id
      and c.consent_type = 'photography'
      and c.granted
      and c.revoked_at is null
  ) into consent_ok;

  if not consent_ok then
    raise exception 'active photography consent is required' using errcode = '23514';
  end if;

  expected_prefix := new.practice_id::text || '/' || new.client_id::text || '/' || new.id::text || '/';
  if new.storage_path not like expected_prefix || '%' then
    raise exception 'photo storage path must use practice/client/resource identifiers'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_progress_photo
before insert or update of practice_id, client_id, consent_id, storage_path
on public.progress_photos
for each row execute function aura_private.validate_progress_photo();

create or replace function aura_private.validate_insight_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    if new.approved_by is null then
      new.approved_by := auth.uid();
    end if;
    if new.approved_by is null
       or not aura_private.user_has_role(new.approved_by, new.practice_id, 'therapist') then
      raise exception 'insight approval requires a therapist in the same practice'
        using errcode = '23514';
    end if;
    if new.client_narration is null or btrim(new.client_narration) = '' then
      raise exception 'approved insight requires client narration' using errcode = '23514';
    end if;
    new.approved_at := coalesce(new.approved_at, now());
  else
    new.approved_at := null;
    if new.status = 'draft' then
      new.approved_by := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_insight_approval
before insert or update of status, approved_by, approved_at, client_narration, practice_id
on public.insights
for each row execute function aura_private.validate_insight_approval();

create or replace function aura_private.handoff_approval_is_active(target_handoff_export_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.handoff_exports he
    join public.handoff_export_approvals hea
      on hea.handoff_export_id = he.id
      and hea.practice_id = he.practice_id
      and hea.client_id = he.client_id
    join public.consents c
      on c.id = hea.standing_consent_id
      and c.practice_id = hea.practice_id
      and c.client_id = hea.client_id
    where he.id = target_handoff_export_id
      and hea.revoked_at is null
      and hea.approved_expires_at > now()
      and he.expires_at is not null
      and he.expires_at > now()
      and he.expires_at <= hea.approved_expires_at
      and he.recipient_name = hea.recipient_name_snapshot
      and he.recipient_organization is not distinct from hea.recipient_organization_snapshot
      and he.purpose = hea.purpose_snapshot
      and he.included_sections = hea.included_sections_snapshot
      and c.consent_type = 'handoff'
      and c.granted
      and c.revoked_at is null
  );
$$;

revoke all on function aura_private.handoff_approval_is_active(uuid) from public;

create or replace function aura_private.validate_handoff_export_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  export_row public.handoff_exports;
  client_auth_user_id uuid;
  consent_ok boolean;
  section_count integer;
  unique_section_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.practice_id is distinct from old.practice_id
      or new.handoff_export_id is distinct from old.handoff_export_id
      or new.client_id is distinct from old.client_id
      or new.approved_by is distinct from old.approved_by
      or new.standing_consent_id is distinct from old.standing_consent_id
      or new.recipient_name_snapshot is distinct from old.recipient_name_snapshot
      or new.recipient_organization_snapshot is distinct from old.recipient_organization_snapshot
      or new.purpose_snapshot is distinct from old.purpose_snapshot
      or new.included_sections_snapshot is distinct from old.included_sections_snapshot
      or new.approved_expires_at is distinct from old.approved_expires_at
      or new.approved_at is distinct from old.approved_at
      or new.created_at is distinct from old.created_at
      or old.revoked_at is not null
      or new.revoked_at is null
    then
      raise exception 'handoff approval snapshots are append-only and may only be revoked'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if jsonb_typeof(new.included_sections_snapshot) is distinct from 'array' then
    raise exception 'handoff approval categories must be an array' using errcode = '23514';
  end if;

  select count(*), count(distinct value)
  into section_count, unique_section_count
  from jsonb_array_elements(new.included_sections_snapshot);

  if section_count = 0
    or section_count > 32
    or section_count is distinct from unique_section_count
    or exists (
      select 1
      from jsonb_array_elements(new.included_sections_snapshot) section
      where jsonb_typeof(section) <> 'string'
        or char_length(btrim(section #>> '{}')) not between 1 and 80
    )
  then
    raise exception 'handoff approval categories must be unique non-empty strings'
      using errcode = '23514';
  end if;

  select he.* into export_row
  from public.handoff_exports he
  where he.id = new.handoff_export_id
    and he.practice_id = new.practice_id
    and he.client_id = new.client_id;

  if not found then
    raise exception 'handoff export does not exist' using errcode = '23503';
  end if;

  select c.auth_user_id into client_auth_user_id
  from public.clients c
  where c.id = new.client_id and c.practice_id = new.practice_id;

  select exists (
    select 1
    from public.consents c
    where c.id = new.standing_consent_id
      and c.practice_id = new.practice_id
      and c.client_id = new.client_id
      and c.consent_type = 'handoff'
      and c.granted
      and c.revoked_at is null
  ) into consent_ok;

  if new.approved_by is distinct from client_auth_user_id or client_auth_user_id is null then
    raise exception 'handoff approval requires the linked client account'
      using errcode = '42501';
  end if;
  if not consent_ok then
    raise exception 'active standing handoff consent is required' using errcode = '23514';
  end if;
  if export_row.status not in ('draft', 'awaiting_consent') then
    raise exception 'handoff export is not awaiting client approval' using errcode = '23514';
  end if;
  if export_row.recipient_name is distinct from new.recipient_name_snapshot
    or export_row.recipient_organization is distinct from new.recipient_organization_snapshot
    or export_row.purpose is distinct from new.purpose_snapshot
    or export_row.included_sections is distinct from new.included_sections_snapshot
    or export_row.expires_at is null
    or export_row.expires_at is distinct from new.approved_expires_at
    or new.approved_expires_at <= now()
  then
    raise exception 'handoff approval must exactly match the proposed export scope'
      using errcode = '23514';
  end if;

  new.approved_at := now();
  new.created_at := new.approved_at;
  new.revoked_at := null;
  return new;
end;
$$;

create trigger validate_handoff_export_approval
before insert or update on public.handoff_export_approvals
for each row execute function aura_private.validate_handoff_export_approval();

create or replace function aura_private.protect_approved_handoff_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.handoff_export_approvals hea
    where hea.handoff_export_id = old.id
      and hea.practice_id = old.practice_id
      and hea.revoked_at is null
  ) and (
    new.recipient_name is distinct from old.recipient_name
    or new.recipient_organization is distinct from old.recipient_organization
    or new.purpose is distinct from old.purpose
    or new.date_from is distinct from old.date_from
    or new.date_to is distinct from old.date_to
    or new.included_sections is distinct from old.included_sections
    or new.expires_at is null
    or new.expires_at > old.expires_at
  ) then
    raise exception 'approved handoff scope cannot be changed or extended'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_approved_handoff_scope
before update on public.handoff_exports
for each row execute function aura_private.protect_approved_handoff_scope();

create or replace function aura_private.require_handoff_approval_for_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('consented', 'generated', 'shared') and not exists (
    select 1
    from public.handoff_export_approvals hea
    join public.consents c
      on c.id = hea.standing_consent_id
      and c.practice_id = hea.practice_id
      and c.client_id = hea.client_id
    where hea.handoff_export_id = new.id
      and hea.practice_id = new.practice_id
      and hea.client_id = new.client_id
      and hea.revoked_at is null
      and hea.approved_expires_at > now()
      and new.expires_at is not null
      and new.expires_at > now()
      and new.expires_at <= hea.approved_expires_at
      and new.recipient_name = hea.recipient_name_snapshot
      and new.recipient_organization is not distinct from hea.recipient_organization_snapshot
      and new.purpose = hea.purpose_snapshot
      and new.included_sections = hea.included_sections_snapshot
      and c.consent_type = 'handoff'
      and c.granted
      and c.revoked_at is null
  ) then
    raise exception 'active per-export client approval is required before release'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger require_handoff_approval_for_release
before insert or update of status, recipient_name, recipient_organization, purpose,
  included_sections, expires_at
on public.handoff_exports
for each row execute function aura_private.require_handoff_approval_for_release();

create or replace function aura_private.validate_handoff_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  export_row public.handoff_exports;
  expected_prefix text;
begin
  select * into export_row
  from public.handoff_exports
  where id = new.handoff_export_id and practice_id = new.practice_id;

  if not found then
    raise exception 'handoff export does not exist' using errcode = '23503';
  end if;

  if new.token_hash is not null and new.token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'handoff token hash must be a SHA-256/HMAC hex digest' using errcode = '23514';
  end if;

  if (new.storage_path is not null or new.token_hash is not null)
    and not aura_private.handoff_approval_is_active(new.handoff_export_id)
  then
    raise exception 'active per-export client approval is required for handoff content'
      using errcode = '42501';
  end if;

  if new.storage_path is not null then
    expected_prefix := new.practice_id::text || '/' || export_row.client_id::text || '/'
      || new.handoff_export_id::text || '/';
    if new.storage_path not like expected_prefix || '%' then
      raise exception 'handoff storage path must use practice/client/resource identifiers'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_handoff_secret
before insert or update on public.handoff_secrets
for each row execute function aura_private.validate_handoff_secret();

create or replace function aura_private.protect_profile_authorization_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and (
    new.id is distinct from old.id
    or new.practice_id is distinct from old.practice_id
    or new.role is distinct from old.role
  ) then
    raise exception 'profile authorization fields are administrator-controlled'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_profile_authorization_fields
before update on public.profiles
for each row execute function aura_private.protect_profile_authorization_fields();

create or replace function aura_private.protect_client_managed_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  select p.role into actor_role from public.profiles p where p.id = auth.uid();
  if actor_role = 'therapist' then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.practice_id is distinct from old.practice_id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.active is distinct from old.active
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'client-managed profile update contains therapist-controlled fields'
      using errcode = '42501';
  end if;
  if new.intake_status is distinct from old.intake_status
     and new.intake_status not in ('pending', 'partial', 'complete') then
    raise exception 'review-required intake status is therapist-controlled'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_client_managed_fields
before update on public.clients
for each row execute function aura_private.protect_client_managed_fields();

create or replace function aura_private.protect_client_appointment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
  actor_client public.clients;
begin
  if auth.uid() is null then
    return new;
  end if;

  select p.role into actor_role
  from public.profiles p
  where p.id = auth.uid();

  if actor_role = 'therapist' then
    return new;
  end if;

  select c.* into actor_client
  from public.clients c
  where c.auth_user_id = auth.uid();

  if actor_role is distinct from 'client'::public.user_role
    or actor_client.id is null
    or new.practice_id is distinct from actor_client.practice_id
    or new.client_id is distinct from actor_client.id
    or new.requested_by is distinct from auth.uid()
    or new.status is distinct from 'requested'::public.appointment_status
    or new.intake_status_snapshot is distinct from actor_client.intake_status
    or new.room is not null
    or new.starts_at <= now()
  then
    raise exception 'clients may only create a future appointment request for themselves'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger protect_client_appointment_insert
before insert on public.appointments
for each row execute function aura_private.protect_client_appointment_insert();

create or replace function aura_private.protect_client_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
begin
  if auth.uid() is null then
    return new;
  end if;
  select p.role into actor_role from public.profiles p where p.id = auth.uid();
  if actor_role = 'therapist' then
    return new;
  end if;

  if old.status not in ('requested', 'pending', 'confirmed')
    or new.status is distinct from 'cancelled'::public.appointment_status
    or new.id is distinct from old.id
    or new.practice_id is distinct from old.practice_id
    or new.client_id is distinct from old.client_id
    or new.therapist_user_id is distinct from old.therapist_user_id
    or new.starts_at is distinct from old.starts_at
    or new.duration_minutes is distinct from old.duration_minutes
    or new.session_type is distinct from old.session_type
    or new.intake_status_snapshot is distinct from old.intake_status_snapshot
    or new.requested_by is distinct from old.requested_by
    or new.room is distinct from old.room
    or new.created_at is distinct from old.created_at
  then
    raise exception 'clients may only cancel their own cancellable appointment'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_client_appointment_update
before update on public.appointments
for each row execute function aura_private.protect_client_appointment_update();

create or replace function aura_private.audit_events_are_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'audit events are append-only' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_events_are_append_only
before update or delete on public.audit_events
for each row execute function aura_private.audit_events_are_append_only();

create or replace function aura_private.validate_audit_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  forbidden_key text;
begin
  select key into forbidden_key
  from jsonb_object_keys(new.safe_metadata) as keys(key)
  where lower(key) ~ '(password|secret|token|url|narrative|transcript|photo|voice|email|phone)'
  limit 1;

  if forbidden_key is not null then
    raise exception 'unsafe audit metadata key: %', forbidden_key using errcode = '23514';
  end if;
  if new.safe_metadata::text ~* '"[^"]*(password|secret|token|url|narrative|transcript|photo|voice|email|phone)[^"]*"[[:space:]]*:' then
    raise exception 'unsafe nested audit metadata key' using errcode = '23514';
  end if;
  if pg_column_size(new.safe_metadata) > 8192 then
    raise exception 'audit metadata exceeds safe size limit' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_audit_metadata
before insert or update of safe_metadata on public.audit_events
for each row execute function aura_private.validate_audit_metadata();

create or replace function aura_private.validate_handoff_response_size()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_column_size(new.response_data) > 32768 then
    raise exception 'handoff response exceeds size limit' using errcode = '22001';
  end if;
  return new;
end;
$$;

create trigger validate_handoff_response_size
before insert or update of response_data on public.handoff_responses
for each row execute function aura_private.validate_handoff_response_size();

-- Prevent authenticated application users from re-parenting records or
-- rewriting authorship/timestamps after creation. Service-role maintenance has
-- auth.uid() = null and remains possible only from protected server code.
create or replace function aura_private.protect_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  column_name text;
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
begin
  if auth.uid() is null then
    return new;
  end if;
  foreach column_name in array tg_argv loop
    if (new_row -> column_name) is distinct from (old_row -> column_name) then
      raise exception 'immutable field cannot be changed: %', column_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger immutable_health_condition_identity
before update on public.health_conditions
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'created_at'
);
create trigger immutable_therapist_profile_identity
before update on public.therapist_profiles
for each row execute function aura_private.protect_immutable_columns(
  'user_id', 'practice_id', 'created_at'
);
create trigger immutable_appointment_identity
before update on public.appointments
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'created_at'
);
create trigger immutable_appointment_private_note_identity
before update on public.appointment_private_notes
for each row execute function aura_private.protect_immutable_columns(
  'appointment_id', 'practice_id'
);
create trigger immutable_consent_identity
before update on public.consents
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'consent_type', 'version', 'created_at'
);
create trigger immutable_pain_entry_identity
before update on public.pain_entries
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'appointment_id', 'recorded_by', 'recorded_at', 'created_at'
);
create trigger immutable_functional_goal_identity
before update on public.functional_goals
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'created_at'
);
create trigger immutable_goal_professional_note_identity
before update on public.functional_goal_professional_notes
for each row execute function aura_private.protect_immutable_columns(
  'goal_id', 'practice_id'
);
create trigger immutable_goal_entry_identity
before update on public.functional_goal_entries
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'goal_id', 'client_id', 'appointment_id', 'recorded_by', 'recorded_at', 'created_at'
);
create trigger immutable_assessment_identity
before update on public.therapist_assessments
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'appointment_id', 'recorded_by', 'recorded_at', 'created_at'
);
create trigger immutable_context_event_identity
before update on public.context_events
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'appointment_id', 'recorded_by', 'recorded_at'
);
create trigger immutable_session_record_identity
before update on public.session_records
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'appointment_id', 'client_id', 'therapist_user_id', 'started_at', 'created_at'
);
create trigger immutable_session_private_note_identity
before update on public.session_private_notes
for each row execute function aura_private.protect_immutable_columns(
  'session_id', 'practice_id'
);
create trigger immutable_intervention_identity
before update on public.session_interventions
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'session_id', 'client_id', 'created_at'
);
create trigger immutable_follow_up_identity
before update on public.follow_up_responses
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'appointment_id', 'client_id', 'recorded_at', 'created_at'
);
create trigger immutable_progress_photo_identity
before update on public.progress_photos
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'appointment_id', 'storage_path', 'consent_id',
  'created_by', 'captured_at', 'created_at'
);
create trigger immutable_insight_evidence
before update on public.insights
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'appointment_id', 'pattern_type', 'engine_version',
  'rule_version', 'confidence', 'structured_evidence', 'created_at'
);
create trigger immutable_insight_private_narration_identity
before update on public.insight_private_narrations
for each row execute function aura_private.protect_immutable_columns(
  'insight_id', 'practice_id'
);
create trigger immutable_handoff_identity
before update on public.handoff_exports
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'created_by', 'created_at'
);
create trigger immutable_handoff_secret_identity
before update on public.handoff_secrets
for each row execute function aura_private.protect_immutable_columns(
  'handoff_export_id', 'practice_id'
);
create trigger immutable_handoff_response_identity
before update on public.handoff_responses
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'handoff_export_id', 'submitted_at', 'created_at'
);
create trigger immutable_notification_identity
before update on public.notification_outbox
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'client_id', 'appointment_id', 'created_at'
);
create trigger immutable_brand_identity
before update on public.brand_config
for each row execute function aura_private.protect_immutable_columns('practice_id');
create trigger immutable_knowledge_rule_identity
before update on public.knowledge_rules
for each row execute function aura_private.protect_immutable_columns(
  'id', 'practice_id', 'rule_key', 'rule_version', 'effective_at', 'created_at'
);

create or replace function aura_private.protect_client_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.practice_id is distinct from old.practice_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or (old.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id)
  then
    raise exception 'client ownership fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger immutable_client_identity
before update on public.clients
for each row execute function aura_private.protect_client_identity();
