-- Backend-derived identity helpers and least-privilege Row Level Security.

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.current_practice_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.practice_id from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.clients c where c.auth_user_id = auth.uid();
$$;

create or replace function public.is_therapist()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'therapist', false);
$$;

create or replace function public.is_therapist_for_practice(target_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_therapist() and public.current_practice_id() = target_practice_id,
    false
  );
$$;

create or replace function public.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = target_client_id
      and c.practice_id = public.current_practice_id()
      and (
        public.is_therapist()
        or c.auth_user_id = auth.uid()
      )
  );
$$;

create or replace function public.has_active_consent(
  target_client_id uuid,
  target_consent_type public.consent_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.consents c
    where c.client_id = target_client_id
      and c.practice_id = public.current_practice_id()
      and c.consent_type = target_consent_type
      and c.granted
      and c.revoked_at is null
  );
$$;

create or replace function public.has_recent_auth(max_age interval default interval '10 minutes')
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when max_age <= interval '0 seconds' or max_age > interval '1 hour' then false
    else coalesce((
      select max(to_timestamp((entry ->> 'timestamp')::double precision)) >= now() - max_age
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) entry
      where entry ->> 'method' not in ('token_refresh', 'anonymous')
        and entry ->> 'timestamp' ~ '^[0-9]+$'
    ), false)
  end;
$$;

create or replace function public.has_active_handoff_approval(target_handoff_export_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select aura_private.handoff_approval_is_active(target_handoff_export_id)
    and exists (
      select 1
      from public.handoff_exports he
      where he.id = target_handoff_export_id
        and (auth.uid() is null or public.can_access_client(he.client_id))
    );
$$;

create or replace function public.request_appointment(
  requested_therapist_user_id uuid,
  requested_starts_at timestamptz,
  requested_duration_minutes integer,
  requested_session_type text
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_client public.clients;
  created_appointment public.appointments;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'client'::public.user_role then
    raise exception 'client authentication required' using errcode = '42501';
  end if;

  select c.* into actor_client
  from public.clients c
  where c.auth_user_id = auth.uid();

  if not found or requested_starts_at <= now() then
    raise exception 'future appointment request required' using errcode = '22023';
  end if;

  insert into public.appointments (
    practice_id, client_id, therapist_user_id, starts_at, duration_minutes,
    session_type, status, intake_status_snapshot, requested_by, room
  ) values (
    actor_client.practice_id, actor_client.id, requested_therapist_user_id,
    requested_starts_at, requested_duration_minutes, requested_session_type,
    'requested', actor_client.intake_status, auth.uid(), null
  )
  returning * into created_appointment;

  return created_appointment;
end;
$$;

create or replace function public.cancel_appointment(target_appointment_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  cancelled_appointment public.appointments;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'client'::public.user_role then
    raise exception 'client authentication required' using errcode = '42501';
  end if;

  update public.appointments a
  set status = 'cancelled'
  where a.id = target_appointment_id
    and a.client_id = public.current_client_id()
    and a.practice_id = public.current_practice_id()
    and a.status in ('requested', 'pending', 'confirmed')
  returning a.* into cancelled_appointment;

  if not found then
    raise exception 'appointment is unavailable or cannot be cancelled'
      using errcode = '42501';
  end if;

  return cancelled_appointment;
end;
$$;

create or replace function public.approve_handoff_export(
  target_handoff_export_id uuid,
  expected_recipient_name text,
  expected_recipient_organization text,
  expected_purpose text,
  expected_included_sections jsonb,
  expected_expires_at timestamptz
)
returns public.handoff_export_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  export_row public.handoff_exports;
  consent_row public.consents;
  approval_row public.handoff_export_approvals;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'client'::public.user_role
    or not public.has_recent_auth(interval '10 minutes')
  then
    raise exception 'fresh client authentication required' using errcode = '42501';
  end if;

  select he.* into export_row
  from public.handoff_exports he
  where he.id = target_handoff_export_id
    and he.client_id = public.current_client_id()
    and he.practice_id = public.current_practice_id()
    and he.status in ('draft', 'awaiting_consent')
  for update;

  if not found then
    raise exception 'handoff export is unavailable for approval' using errcode = '42501';
  end if;

  if export_row.recipient_name is distinct from expected_recipient_name
    or export_row.recipient_organization is distinct from expected_recipient_organization
    or export_row.purpose is distinct from expected_purpose
    or export_row.included_sections is distinct from expected_included_sections
    or export_row.expires_at is distinct from expected_expires_at
  then
    raise exception 'handoff approval details no longer match the proposed export'
      using errcode = '22023';
  end if;

  select c.* into consent_row
  from public.consents c
  where c.practice_id = export_row.practice_id
    and c.client_id = export_row.client_id
    and c.consent_type = 'handoff'
    and c.granted
    and c.revoked_at is null
  order by c.granted_at desc
  limit 1;

  if not found then
    raise exception 'active standing handoff consent is required' using errcode = '42501';
  end if;

  insert into public.handoff_export_approvals (
    practice_id, handoff_export_id, client_id, approved_by, standing_consent_id,
    recipient_name_snapshot, recipient_organization_snapshot, purpose_snapshot,
    included_sections_snapshot, approved_expires_at
  ) values (
    export_row.practice_id, export_row.id, export_row.client_id, auth.uid(), consent_row.id,
    expected_recipient_name, expected_recipient_organization, expected_purpose,
    expected_included_sections, expected_expires_at
  )
  returning * into approval_row;

  update public.handoff_exports
  set status = 'consented'
  where id = export_row.id and practice_id = export_row.practice_id;

  return approval_row;
end;
$$;

create or replace function public.revoke_handoff_export_approval(target_handoff_export_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_id uuid;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'client'::public.user_role
    or not public.has_recent_auth(interval '10 minutes')
  then
    raise exception 'fresh client authentication required' using errcode = '42501';
  end if;

  update public.handoff_export_approvals hea
  set revoked_at = now()
  from public.handoff_exports he
  where hea.handoff_export_id = target_handoff_export_id
    and hea.revoked_at is null
    and he.id = hea.handoff_export_id
    and he.practice_id = hea.practice_id
    and he.client_id = public.current_client_id()
    and he.practice_id = public.current_practice_id()
  returning hea.id into approval_id;

  if approval_id is null then
    raise exception 'handoff approval is unavailable' using errcode = '42501';
  end if;

  update public.handoff_exports
  set status = 'revoked', revoked_at = now()
  where id = target_handoff_export_id
    and client_id = public.current_client_id()
    and practice_id = public.current_practice_id();

  return true;
end;
$$;

create or replace function public.record_audit_event(
  event_action text,
  event_resource_type text,
  event_resource_id uuid default null,
  event_safe_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  actor_practice_id uuid;
  actor_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  actor_practice_id := public.current_practice_id();
  actor_role := public.current_user_role();
  if actor_practice_id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if actor_role = 'client' and event_action <> all(array[
    'export.requested',
    'deletion.requested',
    'photo.viewed',
    'handoff.document_viewed',
    'security.session_revoked'
  ]) then
    raise exception 'audit action is unavailable for this role' using errcode = '42501';
  elsif actor_role = 'therapist' and event_action <> all(array[
    'export.generated',
    'settings.changed',
    'photo.viewed',
    'handoff.previewed',
    'security.session_revoked',
    'security.session_revoked_all'
  ]) then
    raise exception 'audit action is unavailable for this role' using errcode = '42501';
  end if;
  if event_action in ('export.requested', 'export.generated', 'deletion.requested')
     and not public.has_recent_auth(interval '10 minutes') then
    raise exception 'fresh authentication required' using errcode = '42501';
  end if;
  if coalesce(event_safe_metadata, '{}'::jsonb) <> '{}'::jsonb then
    raise exception 'application audit RPC accepts identifiers only; metadata is server-authored'
      using errcode = '42501';
  end if;

  insert into public.audit_events (
    practice_id, actor_user_id, action, resource_type, resource_id, safe_metadata
  ) values (
    actor_practice_id, auth.uid(), event_action, event_resource_type, event_resource_id,
    coalesce(event_safe_metadata, '{}'::jsonb)
  ) returning id into new_id;
  return new_id;
end;
$$;

-- Called only by Edge Functions using the service role. Inputs are keyed
-- digests, never raw identifiers/IP addresses.
create or replace function public.consume_auth_rate_limit(
  rate_bucket_key text,
  max_attempts integer default 8,
  window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempts integer;
begin
  if char_length(rate_bucket_key) < 32
     or max_attempts not between 1 and 100
     or window_seconds not between 10 and 86400 then
    return false;
  end if;

  -- Opportunistic bounded-state cleanup. Bucket keys are non-sensitive HMACs,
  -- but retaining expired limiter rows has no value.
  if random() < 0.02 then
    delete from public.auth_rate_limits
    where updated_at < now() - interval '2 days';
  end if;

  insert into public.auth_rate_limits(bucket_key, window_started_at, attempts)
  values (rate_bucket_key, now(), 1)
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when public.auth_rate_limits.window_started_at <= now() - make_interval(secs => window_seconds)
        then now()
      else public.auth_rate_limits.window_started_at
    end,
    attempts = case
      when public.auth_rate_limits.window_started_at <= now() - make_interval(secs => window_seconds)
        then 1
      else public.auth_rate_limits.attempts + 1
    end
  returning attempts into current_attempts;

  return current_attempts <= max_attempts;
end;
$$;

create or replace function public.resolve_login_email(normalized_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(btrim(normalized_username))
  limit 1;
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_practice_id() from public;
revoke all on function public.current_client_id() from public;
revoke all on function public.is_therapist() from public;
revoke all on function public.is_therapist_for_practice(uuid) from public;
revoke all on function public.can_access_client(uuid) from public;
revoke all on function public.has_active_consent(uuid, public.consent_type) from public;
revoke all on function public.has_recent_auth(interval) from public;
revoke all on function public.has_active_handoff_approval(uuid) from public;
revoke all on function public.request_appointment(uuid, timestamptz, integer, text) from public;
revoke all on function public.cancel_appointment(uuid) from public;
revoke all on function public.approve_handoff_export(uuid, text, text, text, jsonb, timestamptz) from public;
revoke all on function public.revoke_handoff_export_approval(uuid) from public;
revoke all on function public.record_audit_event(text, text, uuid, jsonb) from public;
revoke all on function public.consume_auth_rate_limit(text, integer, integer) from public;
revoke all on function public.resolve_login_email(text) from public;

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.current_practice_id() to authenticated, service_role;
grant execute on function public.current_client_id() to authenticated, service_role;
grant execute on function public.is_therapist() to authenticated, service_role;
grant execute on function public.is_therapist_for_practice(uuid) to authenticated, service_role;
grant execute on function public.can_access_client(uuid) to authenticated, service_role;
grant execute on function public.has_active_consent(uuid, public.consent_type) to authenticated, service_role;
grant execute on function public.has_recent_auth(interval) to authenticated, service_role;
grant execute on function public.has_active_handoff_approval(uuid) to authenticated, service_role;
grant execute on function public.request_appointment(uuid, timestamptz, integer, text) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
grant execute on function public.approve_handoff_export(uuid, text, text, text, jsonb, timestamptz)
  to authenticated;
grant execute on function public.revoke_handoff_export_approval(uuid) to authenticated;
grant execute on function public.record_audit_event(text, text, uuid, jsonb) to authenticated;
grant execute on function public.consume_auth_rate_limit(text, integer, integer) to service_role;
grant execute on function public.resolve_login_email(text) to service_role;

-- Every application table is explicitly protected, including internal tables.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'practices', 'profiles', 'therapist_profiles', 'clients', 'appointments',
    'appointment_private_notes', 'health_conditions', 'consents', 'pain_entries',
    'functional_goals', 'functional_goal_professional_notes', 'functional_goal_entries',
    'therapist_assessments', 'context_events', 'session_records', 'session_private_notes',
    'session_interventions', 'follow_up_responses', 'progress_photos', 'insights',
    'insight_private_narrations', 'handoff_exports', 'handoff_export_approvals',
    'handoff_secrets', 'handoff_responses',
    'audit_events', 'brand_config', 'knowledge_rules', 'notification_outbox', 'auth_rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('alter table public.%I force row level security', target_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', target_table);
  end loop;
end;
$$;

-- Practices
create policy practices_select_own on public.practices for select to authenticated
using (id = public.current_practice_id());
create policy practices_update_therapist on public.practices for update to authenticated
using (public.is_therapist_for_practice(id))
with check (public.is_therapist_for_practice(id));

-- Profiles and therapist directory
create policy profiles_select_authorized on public.profiles for select to authenticated
using (id = auth.uid() or public.is_therapist_for_practice(practice_id));
create policy profiles_update_self on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy therapist_profiles_select_therapist on public.therapist_profiles for select to authenticated
using (public.is_therapist_for_practice(practice_id));
create policy therapist_profiles_insert_therapist on public.therapist_profiles for insert to authenticated
with check (public.is_therapist_for_practice(practice_id));
create policy therapist_profiles_update_therapist on public.therapist_profiles for update to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));

-- Clients
create policy clients_select_authorized on public.clients for select to authenticated
using (public.can_access_client(id));
create policy clients_insert_therapist on public.clients for insert to authenticated
with check (public.is_therapist_for_practice(practice_id));
create policy clients_update_authorized on public.clients for update to authenticated
using (public.can_access_client(id)) with check (public.can_access_client(id));
create policy clients_delete_therapist on public.clients for delete to authenticated
using (public.is_therapist_for_practice(practice_id));

-- Appointments and separated therapist scheduling notes
create policy appointments_select_authorized on public.appointments for select to authenticated
using (public.can_access_client(client_id));
create policy appointments_insert_therapist on public.appointments for insert to authenticated
with check (public.is_therapist_for_practice(practice_id));
create policy appointments_update_therapist on public.appointments for update to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));
create policy appointments_delete_therapist on public.appointments for delete to authenticated
using (public.is_therapist_for_practice(practice_id));

-- Client request/cancel mutations are intentionally available only through
-- request_appointment/cancel_appointment. Those security-definer RPCs derive
-- ownership and server-managed fields instead of accepting whole-row writes.

create policy appointment_private_notes_therapist_all on public.appointment_private_notes
for all to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));

-- Intake health facts and consent ledger
create policy health_conditions_select_authorized on public.health_conditions for select to authenticated
using (public.can_access_client(client_id));
create policy health_conditions_insert_authorized on public.health_conditions for insert to authenticated
with check (public.can_access_client(client_id));
create policy health_conditions_update_authorized on public.health_conditions for update to authenticated
using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy health_conditions_delete_authorized on public.health_conditions for delete to authenticated
using (public.can_access_client(client_id));

create policy consents_select_authorized on public.consents for select to authenticated
using (public.can_access_client(client_id));
create policy consents_insert_authorized on public.consents for insert to authenticated
with check (
  public.can_access_client(client_id)
  and public.has_recent_auth(interval '10 minutes')
);
create policy consents_update_authorized on public.consents for update to authenticated
using (
  public.can_access_client(client_id)
  and public.has_recent_auth(interval '10 minutes')
)
with check (
  public.can_access_client(client_id)
  and public.has_recent_auth(interval '10 minutes')
);

-- Client observations and goals
create policy pain_entries_select_authorized on public.pain_entries for select to authenticated
using (public.can_access_client(client_id));
create policy pain_entries_insert_authorized on public.pain_entries for insert to authenticated
with check (public.can_access_client(client_id) and recorded_by = auth.uid());
create policy pain_entries_update_authorized on public.pain_entries for update to authenticated
using (public.is_therapist_for_practice(practice_id) or recorded_by = auth.uid())
with check (public.can_access_client(client_id));
create policy pain_entries_delete_authorized on public.pain_entries for delete to authenticated
using (public.is_therapist_for_practice(practice_id) or recorded_by = auth.uid());

create policy functional_goals_select_authorized on public.functional_goals for select to authenticated
using (public.can_access_client(client_id));
create policy functional_goals_insert_authorized on public.functional_goals for insert to authenticated
with check (public.can_access_client(client_id));
create policy functional_goals_update_authorized on public.functional_goals for update to authenticated
using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy functional_goals_delete_authorized on public.functional_goals for delete to authenticated
using (public.can_access_client(client_id));

create policy functional_goal_professional_notes_therapist_all
on public.functional_goal_professional_notes for all to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));

create policy functional_goal_entries_select_authorized
on public.functional_goal_entries for select to authenticated
using (public.can_access_client(client_id));
create policy functional_goal_entries_insert_authorized
on public.functional_goal_entries for insert to authenticated
with check (public.can_access_client(client_id) and recorded_by = auth.uid());
create policy functional_goal_entries_update_authorized
on public.functional_goal_entries for update to authenticated
using (public.is_therapist_for_practice(practice_id) or recorded_by = auth.uid())
with check (public.can_access_client(client_id));
create policy functional_goal_entries_delete_authorized
on public.functional_goal_entries for delete to authenticated
using (public.is_therapist_for_practice(practice_id) or recorded_by = auth.uid());

-- Therapist-only assessments
create policy therapist_assessments_select_therapist on public.therapist_assessments
for select to authenticated using (public.is_therapist_for_practice(practice_id));
create policy therapist_assessments_insert_therapist on public.therapist_assessments
for insert to authenticated
with check (public.is_therapist_for_practice(practice_id) and recorded_by = auth.uid());
create policy therapist_assessments_update_therapist on public.therapist_assessments
for update to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));
create policy therapist_assessments_delete_therapist on public.therapist_assessments
for delete to authenticated using (public.is_therapist_for_practice(practice_id));

-- Context events
create policy context_events_select_authorized on public.context_events for select to authenticated
using (public.can_access_client(client_id));
create policy context_events_insert_authorized on public.context_events for insert to authenticated
with check (public.can_access_client(client_id) and recorded_by = auth.uid());
create policy context_events_update_authorized on public.context_events for update to authenticated
using (public.is_therapist_for_practice(practice_id) or recorded_by = auth.uid())
with check (public.can_access_client(client_id));
create policy context_events_delete_authorized on public.context_events for delete to authenticated
using (public.is_therapist_for_practice(practice_id) or recorded_by = auth.uid());

-- Session record has only an explicitly client-visible summary. Private text/audio is separated.
create policy session_records_select_authorized on public.session_records for select to authenticated
using (
  public.is_therapist_for_practice(practice_id)
  or (
    client_id = public.current_client_id()
    and finished_at is not null
    and client_visible_summary is not null
  )
);
create policy session_records_insert_therapist on public.session_records for insert to authenticated
with check (public.is_therapist_for_practice(practice_id) and therapist_user_id = auth.uid());
create policy session_records_update_therapist on public.session_records for update to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));
create policy session_records_delete_therapist on public.session_records for delete to authenticated
using (public.is_therapist_for_practice(practice_id));

create policy session_private_notes_therapist_all on public.session_private_notes
for all to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));

create policy session_interventions_select_authorized on public.session_interventions
for select to authenticated
using (
  public.is_therapist_for_practice(practice_id)
  or exists (
    select 1 from public.session_records sr
    where sr.id = session_id
      and sr.client_id = public.current_client_id()
      and sr.finished_at is not null
      and sr.client_visible_summary is not null
  )
);
create policy session_interventions_insert_therapist on public.session_interventions
for insert to authenticated with check (public.is_therapist_for_practice(practice_id));
create policy session_interventions_update_therapist on public.session_interventions
for update to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));
create policy session_interventions_delete_therapist on public.session_interventions
for delete to authenticated using (public.is_therapist_for_practice(practice_id));

-- Follow-ups
create policy follow_up_responses_select_authorized on public.follow_up_responses
for select to authenticated using (public.can_access_client(client_id));
create policy follow_up_responses_insert_authorized on public.follow_up_responses
for insert to authenticated with check (public.can_access_client(client_id));
create policy follow_up_responses_update_authorized on public.follow_up_responses
for update to authenticated
using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy follow_up_responses_delete_therapist on public.follow_up_responses
for delete to authenticated using (public.is_therapist_for_practice(practice_id));

-- Photo metadata requires active consent plus a fresh authentication event.
create policy progress_photos_select_consented_fresh on public.progress_photos
for select to authenticated
using (
  public.can_access_client(client_id)
  and public.has_active_consent(client_id, 'photography')
  and public.has_recent_auth(interval '10 minutes')
);
create policy progress_photos_insert_therapist_consented on public.progress_photos
for insert to authenticated
with check (
  public.is_therapist_for_practice(practice_id)
  and public.has_active_consent(client_id, 'photography')
  and public.has_recent_auth(interval '10 minutes')
  and created_by = auth.uid()
);
create policy progress_photos_update_therapist_consented on public.progress_photos
for update to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (
  public.is_therapist_for_practice(practice_id)
  and public.has_active_consent(client_id, 'photography')
  and public.has_recent_auth(interval '10 minutes')
);
create policy progress_photos_delete_therapist on public.progress_photos
for delete to authenticated using (
  public.is_therapist_for_practice(practice_id)
  and public.has_recent_auth(interval '10 minutes')
);

-- Insights: clients can see approved client narration only. Therapist text is separate.
create policy insights_select_authorized on public.insights for select to authenticated
using (
  public.is_therapist_for_practice(practice_id)
  or (client_id = public.current_client_id() and status = 'approved')
);
create policy insights_insert_therapist on public.insights for insert to authenticated
with check (public.is_therapist_for_practice(practice_id));
create policy insights_update_therapist on public.insights for update to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));
create policy insights_delete_therapist on public.insights for delete to authenticated
using (public.is_therapist_for_practice(practice_id));

create policy insight_private_narrations_therapist_all on public.insight_private_narrations
for all to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));

-- Handoff metadata is client-reviewable; object path/token hash are separated.
create policy handoff_exports_select_authorized on public.handoff_exports for select to authenticated
using (public.is_therapist_for_practice(practice_id) or client_id = public.current_client_id());
create policy handoff_exports_insert_therapist on public.handoff_exports for insert to authenticated
with check (
  public.is_therapist_for_practice(practice_id)
  and public.has_recent_auth(interval '10 minutes')
  and created_by = auth.uid()
);
create policy handoff_exports_update_therapist on public.handoff_exports for update to authenticated
using (
  public.is_therapist_for_practice(practice_id)
  and public.has_recent_auth(interval '10 minutes')
)
with check (
  public.is_therapist_for_practice(practice_id)
  and public.has_recent_auth(interval '10 minutes')
);
create policy handoff_exports_delete_therapist on public.handoff_exports for delete to authenticated
using (
  public.is_therapist_for_practice(practice_id)
  and public.has_recent_auth(interval '10 minutes')
);

create policy handoff_export_approvals_select_authorized
on public.handoff_export_approvals for select to authenticated
using (
  public.is_therapist_for_practice(practice_id)
  or client_id = public.current_client_id()
);

-- Approval rows are append-only snapshots. Clients approve/revoke through the
-- narrow fresh-auth RPCs; no application role receives direct write grants.

create policy handoff_secrets_therapist_all on public.handoff_secrets for all to authenticated
using (
  public.is_therapist_for_practice(practice_id)
  and public.has_recent_auth(interval '10 minutes')
  and public.has_active_handoff_approval(handoff_export_id)
)
with check (
  public.is_therapist_for_practice(practice_id)
  and public.has_recent_auth(interval '10 minutes')
  and public.has_active_handoff_approval(handoff_export_id)
);

create policy handoff_responses_select_therapist on public.handoff_responses for select to authenticated
using (public.is_therapist_for_practice(practice_id));

-- Audit is append-only: application users can never insert/update/delete the table directly.
create policy audit_events_select_therapist on public.audit_events for select to authenticated
using (public.is_therapist_for_practice(practice_id));

-- Branding, deterministic rule configuration, and notification queue.
create policy brand_config_select_own on public.brand_config for select to authenticated
using (practice_id = public.current_practice_id());
create policy brand_config_insert_therapist on public.brand_config for insert to authenticated
with check (public.is_therapist_for_practice(practice_id));
create policy brand_config_update_therapist on public.brand_config for update to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));

create policy knowledge_rules_select_own on public.knowledge_rules for select to authenticated
using (practice_id = public.current_practice_id());
create policy knowledge_rules_insert_therapist on public.knowledge_rules for insert to authenticated
with check (public.is_therapist_for_practice(practice_id));
create policy knowledge_rules_update_therapist on public.knowledge_rules for update to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));
create policy knowledge_rules_delete_therapist on public.knowledge_rules for delete to authenticated
using (public.is_therapist_for_practice(practice_id));

create policy notification_outbox_therapist_all on public.notification_outbox
for all to authenticated
using (public.is_therapist_for_practice(practice_id))
with check (public.is_therapist_for_practice(practice_id));

-- Deliberate grants. RLS remains the row boundary; no anonymous base-table access exists.
grant select on public.practices to authenticated;
grant update (name, locale, timezone, configuration) on public.practices to authenticated;
grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_path) on public.profiles to authenticated;
grant select, insert, update on public.therapist_profiles to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.appointment_private_notes to authenticated;
grant select, insert, update, delete on public.health_conditions to authenticated;
grant select, insert, update on public.consents to authenticated;
grant select, insert, update, delete on public.pain_entries to authenticated;
grant select, insert, update, delete on public.functional_goals to authenticated;
grant select, insert, update, delete on public.functional_goal_professional_notes to authenticated;
grant select, insert, update, delete on public.functional_goal_entries to authenticated;
grant select, insert, update, delete on public.therapist_assessments to authenticated;
grant select, insert, update, delete on public.context_events to authenticated;
grant select, insert, update, delete on public.session_records to authenticated;
grant select, insert, update, delete on public.session_private_notes to authenticated;
grant select, insert, update, delete on public.session_interventions to authenticated;
grant select, insert, update, delete on public.follow_up_responses to authenticated;
grant select, insert, update, delete on public.progress_photos to authenticated;
grant select, insert, update, delete on public.insights to authenticated;
grant select, insert, update, delete on public.insight_private_narrations to authenticated;
grant select, insert, update, delete on public.handoff_exports to authenticated;
grant select on public.handoff_export_approvals to authenticated;
grant select, insert, update, delete on public.handoff_secrets to authenticated;
grant select on public.handoff_responses to authenticated;
grant select on public.audit_events to authenticated;
grant select, insert, update on public.brand_config to authenticated;
grant select, insert, update, delete on public.knowledge_rules to authenticated;
grant select, insert, update, delete on public.notification_outbox to authenticated;

-- A narrowly-shaped public view is the only anonymous application data. It
-- intentionally omits private asset paths, feature flags, and practice config.
create view public.public_brand_config
with (security_barrier = true)
as
select
  p.name as practice_name,
  b.logo_path,
  jsonb_strip_nulls(jsonb_build_object(
    'primary', b.accent_values -> 'primary',
    'secondary', b.accent_values -> 'secondary',
    'gold', b.accent_values -> 'gold',
    'violet', b.accent_values -> 'violet',
    'surface', b.accent_values -> 'surface',
    'text', b.accent_values -> 'text'
  )) as accent_values,
  jsonb_strip_nulls(jsonb_build_object(
    'display', b.typography_configuration -> 'display',
    'body', b.typography_configuration -> 'body'
  )) as typography_configuration,
  b.bonus_minutes_label,
  b.locale
from public.practices p
join public.brand_config b on b.practice_id = p.id;

comment on view public.public_brand_config is
  'Deliberately anonymous, non-sensitive installation branding. logo_path must target brand-assets-public only.';

revoke all on public.public_brand_config from public, authenticated;
grant select on public.public_brand_config to anon;

-- Client-safe therapist contact view. The owner evaluates only an explicit
-- column list and filters through the backend-derived current practice.
create view public.client_therapist_directory
with (security_barrier = true)
as
select tp.user_id, tp.professional_name, tp.contact_email, tp.contact_phone
from public.therapist_profiles tp
where tp.practice_id = public.current_practice_id();

revoke all on public.client_therapist_directory from public, anon;
grant select on public.client_therapist_directory to authenticated;
