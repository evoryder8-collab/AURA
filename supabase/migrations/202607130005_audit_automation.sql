-- Privacy-safe, server-authored audit events for direct database workflows.

create or replace function aura_private.append_audit_event(
  target_practice_id uuid,
  event_action text,
  event_resource_type text,
  event_resource_id uuid,
  event_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    practice_id, actor_user_id, action, resource_type, resource_id, safe_metadata
  ) values (
    target_practice_id, auth.uid(), event_action, event_resource_type,
    event_resource_id, coalesce(event_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function aura_private.append_audit_event(uuid, text, text, uuid, jsonb) from public;

create or replace function aura_private.audit_client_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform aura_private.append_audit_event(
    new.practice_id, 'client.created', 'client', new.id,
    jsonb_build_object('intakeStatus', new.intake_status)
  );
  return new;
end;
$$;

create trigger audit_client_created
after insert on public.clients
for each row execute function aura_private.audit_client_created();

create or replace function aura_private.audit_consent_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_action text;
begin
  if tg_op = 'INSERT' then
    event_action := case when new.granted then 'consent.granted' else 'consent.declined' end;
  elsif new.granted is not distinct from old.granted
        and new.revoked_at is not distinct from old.revoked_at then
    return new;
  else
    event_action := case
      when old.revoked_at is null and new.revoked_at is not null then 'consent.revoked'
      when new.granted then 'consent.granted'
      else 'consent.declined'
    end;
  end if;

  perform aura_private.append_audit_event(
    new.practice_id, event_action, 'consent', new.id,
    jsonb_build_object('consentType', new.consent_type, 'version', new.version)
  );
  return new;
end;
$$;

create trigger audit_consent_change
after insert or update on public.consents
for each row execute function aura_private.audit_consent_change();

create or replace function aura_private.audit_photo_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data public.progress_photos;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  perform aura_private.append_audit_event(
    row_data.practice_id,
    case when tg_op = 'DELETE' then 'photo.deleted' else 'photo.created' end,
    'progress_photo', row_data.id,
    jsonb_build_object('viewType', row_data.view_type, 'phase', row_data.phase)
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_photo_change
after insert or delete on public.progress_photos
for each row execute function aura_private.audit_photo_change();

create or replace function aura_private.audit_insight_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  perform aura_private.append_audit_event(
    new.practice_id,
    case when new.status = 'approved' then 'insight.approved' else 'insight.rejected' end,
    'insight', new.id,
    jsonb_build_object(
      'pattern', new.pattern_type,
      'engineVersion', new.engine_version,
      'ruleVersion', new.rule_version
    )
  );
  return new;
end;
$$;

create trigger audit_insight_status
after insert or update of status on public.insights
for each row execute function aura_private.audit_insight_status();

create or replace function aura_private.audit_handoff_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform aura_private.append_audit_event(
    new.practice_id, 'handoff.created', 'handoff_export', new.id,
    jsonb_build_object('status', new.status)
  );
  return new;
end;
$$;

create trigger audit_handoff_created
after insert on public.handoff_exports
for each row execute function aura_private.audit_handoff_created();

create or replace function aura_private.audit_handoff_approval_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform aura_private.append_audit_event(
      new.practice_id, 'handoff.export_approved', 'handoff_export', new.handoff_export_id,
      jsonb_build_object('approvalId', new.id)
    );
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform aura_private.append_audit_event(
      new.practice_id, 'handoff.export_approval_revoked', 'handoff_export', new.handoff_export_id,
      jsonb_build_object('approvalId', new.id)
    );
  end if;
  return new;
end;
$$;

create trigger audit_handoff_approval_change
after insert or update of revoked_at on public.handoff_export_approvals
for each row execute function aura_private.audit_handoff_approval_change();

create or replace function aura_private.audit_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;
  perform aura_private.append_audit_event(
    new.practice_id, 'role.changed', 'profile', new.id,
    jsonb_build_object('previousRole', old.role, 'newRole', new.role)
  );
  return new;
end;
$$;

create trigger audit_profile_role_change
after update of role on public.profiles
for each row execute function aura_private.audit_profile_role_change();

create or replace function aura_private.audit_session_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.finished_at is null
     or (tg_op = 'UPDATE' and old.finished_at is not null) then
    return new;
  end if;
  perform aura_private.append_audit_event(
    new.practice_id, 'session.completed', 'session_record', new.id,
    jsonb_build_object(
      'bookedMinutes', new.booked_minutes,
      'actualMinutes', new.actual_minutes,
      'confirmedBonusMinutes', new.confirmed_bonus_minutes
    )
  );
  return new;
end;
$$;

create trigger audit_session_completed
after insert or update on public.session_records
for each row execute function aura_private.audit_session_completed();

create or replace function aura_private.audit_brand_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform aura_private.append_audit_event(
    new.practice_id, 'settings.brand_updated', 'brand_config', new.practice_id,
    jsonb_build_object('featureFlagsChanged', new.feature_flags is distinct from old.feature_flags)
  );
  return new;
end;
$$;

create trigger audit_brand_update
after update on public.brand_config
for each row execute function aura_private.audit_brand_update();
