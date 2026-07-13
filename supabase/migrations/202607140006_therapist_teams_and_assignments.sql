-- Explicit care-team assignments, opt-in therapist discovery, and therapist-selectable booking.
--
-- This migration deliberately does not invent a practice-owner or administrator role. Assignment
-- lifecycle changes outside the two narrow care workflows below remain trusted service operations
-- until that role and its governance are designed explicitly.

alter table public.therapist_profiles
  add column if not exists directory_slug text,
  add column if not exists professional_title text,
  add column if not exists public_portrait_resource_id uuid not null default gen_random_uuid(),
  add column if not exists public_portrait_path text,
  add column if not exists directory_opt_in boolean not null default false,
  add column if not exists accepting_online_bookings boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.therapist_profiles'::regclass
      and conname = 'therapist_profiles_directory_slug_check'
  ) then
    alter table public.therapist_profiles
      add constraint therapist_profiles_directory_slug_check check (
        directory_slug is null
        or (
          directory_slug = lower(btrim(directory_slug))
          and directory_slug ~ '^[a-z][a-z0-9-]{2,63}$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.therapist_profiles'::regclass
      and conname = 'therapist_profiles_professional_title_check'
  ) then
    alter table public.therapist_profiles
      add constraint therapist_profiles_professional_title_check check (
        professional_title is null
        or char_length(btrim(professional_title)) between 1 and 120
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.therapist_profiles'::regclass
      and conname = 'therapist_profiles_public_portrait_path_check'
  ) then
    alter table public.therapist_profiles
      add constraint therapist_profiles_public_portrait_path_check check (
        public_portrait_path is null
        or (
          char_length(public_portrait_path) between 1 and 512
          and public_portrait_path !~* '^(https?:|data:|javascript:)'
          and public_portrait_path !~ '(^|/)\.\.(/|$)'
          and public_portrait_path ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]*\.(webp|png|jpe?g|avif)$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.therapist_profiles'::regclass
      and conname = 'therapist_profiles_booking_requires_directory_check'
  ) then
    alter table public.therapist_profiles
      add constraint therapist_profiles_booking_requires_directory_check check (
        not accepting_online_bookings or directory_opt_in
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.therapist_profiles'::regclass
      and conname = 'therapist_profiles_opt_in_requires_slug_check'
  ) then
    alter table public.therapist_profiles
      add constraint therapist_profiles_opt_in_requires_slug_check check (
        not directory_opt_in or directory_slug is not null
      );
  end if;
end;
$$;

create unique index if not exists therapist_profiles_directory_slug_idx
  on public.therapist_profiles(directory_slug)
  where directory_slug is not null;
create unique index if not exists therapist_profiles_public_portrait_resource_idx
  on public.therapist_profiles(practice_id, public_portrait_resource_id);

comment on column public.therapist_profiles.directory_slug is
  'Public non-auth identifier for an explicitly opted-in professional directory entry.';
comment on column public.therapist_profiles.professional_title is
  'Optional public professional title. It must not contain private credentials or client data.';
comment on column public.therapist_profiles.public_portrait_resource_id is
  'Server-generated immutable opaque owner namespace for therapist public portrait objects; never an auth ID.';
comment on column public.therapist_profiles.public_portrait_path is
  'Optional same-practice opaque raster path in brand-assets-public. Never a signed/private URL.';
comment on column public.therapist_profiles.directory_opt_in is
  'Explicit consent to publish the narrow professional name/title/portrait directory projection.';
comment on column public.therapist_profiles.accepting_online_bookings is
  'Whether authenticated clients may select this opted-in therapist in the booking RPC.';

create or replace function aura_private.validate_therapist_public_portrait_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- App-authenticated inserts cannot choose or reuse a public storage namespace. Trusted migration
  -- and service contexts without an end-user auth UID may supply deterministic synthetic fixtures.
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.public_portrait_resource_id := gen_random_uuid();
  end if;

  if tg_op = 'UPDATE'
    and new.public_portrait_resource_id is distinct from old.public_portrait_resource_id
  then
    raise exception 'public therapist portrait resource identity is immutable'
      using errcode = '42501';
  end if;

  if new.public_portrait_path is not null and (
    not public.is_valid_practice_asset_path(new.public_portrait_path)
    or public.storage_path_uuid(new.public_portrait_path, 1) is distinct from new.practice_id
    or public.storage_path_uuid(new.public_portrait_path, 2)
      is distinct from new.public_portrait_resource_id
  ) then
    raise exception 'public therapist portrait must use the current practice and an opaque resource'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function aura_private.validate_therapist_public_portrait_path() from public;
drop trigger if exists validate_therapist_public_portrait_path on public.therapist_profiles;
create trigger validate_therapist_public_portrait_path
before insert or update of public_portrait_resource_id, public_portrait_path, practice_id
on public.therapist_profiles
for each row execute function aura_private.validate_therapist_public_portrait_path();

create table if not exists public.therapist_client_assignments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  client_id uuid not null,
  therapist_user_id uuid not null,
  assignment_source text not null check (
    assignment_source in (
      'trusted_administration',
      'client_creator',
      'client_booking',
      'migration_existing_care'
    )
  ),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint therapist_client_assignments_practice_id_id_key unique (practice_id, id),
  constraint therapist_client_assignments_dates_check check (
    ended_at is null or ended_at >= assigned_at
  ),
  foreign key (practice_id, client_id)
    references public.clients(practice_id, id) on delete cascade,
  foreign key (practice_id, therapist_user_id)
    references public.profiles(practice_id, id) on delete restrict
);

create unique index if not exists therapist_client_assignments_one_active_idx
  on public.therapist_client_assignments(client_id, therapist_user_id)
  where ended_at is null;
create index if not exists therapist_client_assignments_therapist_active_idx
  on public.therapist_client_assignments(therapist_user_id, client_id)
  where ended_at is null;
create index if not exists therapist_client_assignments_client_active_idx
  on public.therapist_client_assignments(client_id, therapist_user_id)
  where ended_at is null;

comment on table public.therapist_client_assignments is
  'Care-team authorization ledger. Only active rows (ended_at is null) grant therapist access.';
comment on column public.therapist_client_assignments.assignment_source is
  'Auditable reason for assignment; it is not a practice-owner/admin designation.';
comment on column public.therapist_client_assignments.ended_at is
  'Trusted revocation timestamp. Historical rows never grant access.';

drop trigger if exists set_updated_at on public.therapist_client_assignments;
create trigger set_updated_at
before update on public.therapist_client_assignments
for each row execute function aura_private.set_updated_at();

create or replace function aura_private.validate_therapist_client_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if current_user <> 'postgres' then
      raise exception 'assignment history is append-only'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if not aura_private.user_has_role(
    new.therapist_user_id,
    new.practice_id,
    'therapist'::public.user_role
  ) then
    raise exception 'assignment therapist must have a therapist role in the same practice'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.practice_id is distinct from old.practice_id
    or new.client_id is distinct from old.client_id
    or new.therapist_user_id is distinct from old.therapist_user_id
    or new.assignment_source is distinct from old.assignment_source
    or new.assigned_by is distinct from old.assigned_by
    or new.assigned_at is distinct from old.assigned_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'assignment identity and provenance are immutable'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    old.ended_at is not null
    or new.ended_at is null
    or new.ended_at < new.assigned_at
  ) then
    raise exception 'an assignment may be ended once and never reactivated'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function aura_private.validate_therapist_client_assignment() from public;
drop trigger if exists validate_therapist_client_assignment
  on public.therapist_client_assignments;
create trigger validate_therapist_client_assignment
before insert or update or delete on public.therapist_client_assignments
for each row execute function aura_private.validate_therapist_client_assignment();

create or replace function aura_private.audit_therapist_client_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform aura_private.append_audit_event(
      new.practice_id,
      'care_team.assigned',
      'therapist_client_assignment',
      new.id,
      jsonb_build_object('source', new.assignment_source)
    );
  elsif old.ended_at is null and new.ended_at is not null then
    perform aura_private.append_audit_event(
      new.practice_id,
      'care_team.assignment_ended',
      'therapist_client_assignment',
      new.id,
      jsonb_build_object('source', new.assignment_source)
    );
  end if;
  return new;
end;
$$;

revoke all on function aura_private.audit_therapist_client_assignment() from public;
drop trigger if exists audit_therapist_client_assignment
  on public.therapist_client_assignments;
create trigger audit_therapist_client_assignment
after insert or update of ended_at on public.therapist_client_assignments
for each row execute function aura_private.audit_therapist_client_assignment();

-- Preserve only relationships evidenced by the existing creator or appointment history. This is
-- intentionally narrower than backfilling every therapist to every client in the practice.
insert into public.therapist_client_assignments (
  practice_id, client_id, therapist_user_id, assignment_source, assigned_by
)
select distinct
  c.practice_id,
  c.id,
  c.created_by,
  'migration_existing_care',
  null::uuid
from public.clients c
join public.profiles p
  on p.id = c.created_by
 and p.practice_id = c.practice_id
 and p.role = 'therapist'
where c.created_by is not null
  and not exists (
    select 1 from public.therapist_client_assignments existing
    where existing.client_id = c.id
      and existing.therapist_user_id = c.created_by
  )
on conflict (client_id, therapist_user_id) where ended_at is null do nothing;

insert into public.therapist_client_assignments (
  practice_id, client_id, therapist_user_id, assignment_source, assigned_by
)
select distinct
  a.practice_id,
  a.client_id,
  a.therapist_user_id,
  'migration_existing_care',
  null::uuid
from public.appointments a
where not exists (
  select 1 from public.therapist_client_assignments existing
  where existing.client_id = a.client_id
    and existing.therapist_user_id = a.therapist_user_id
)
on conflict (client_id, therapist_user_id) where ended_at is null do nothing;

create or replace function public.is_assigned_therapist(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_therapist()
    and exists (
      select 1
      from public.therapist_client_assignments tca
      where tca.client_id = target_client_id
        and tca.therapist_user_id = auth.uid()
        and tca.practice_id = public.current_practice_id()
        and tca.ended_at is null
    ),
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
        c.auth_user_id = auth.uid()
        or public.is_assigned_therapist(c.id)
      )
  );
$$;

revoke all on function public.is_assigned_therapist(uuid) from public;
revoke all on function public.can_access_client(uuid) from public;
grant execute on function public.is_assigned_therapist(uuid) to authenticated, service_role;
grant execute on function public.can_access_client(uuid) to authenticated, service_role;

create or replace function aura_private.assign_new_client_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and new.created_by = auth.uid()
    and aura_private.user_has_role(auth.uid(), new.practice_id, 'therapist'::public.user_role)
  then
    insert into public.therapist_client_assignments (
      practice_id, client_id, therapist_user_id, assignment_source, assigned_by
    ) values (
      new.practice_id, new.id, auth.uid(), 'client_creator', auth.uid()
    )
    on conflict (client_id, therapist_user_id) where ended_at is null do nothing;
  end if;
  return new;
end;
$$;

revoke all on function aura_private.assign_new_client_creator() from public;
drop trigger if exists assign_new_client_creator on public.clients;
create trigger assign_new_client_creator
after insert on public.clients
for each row execute function aura_private.assign_new_client_creator();

create or replace function aura_private.protect_appointment_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.practice_id is distinct from old.practice_id
    or new.client_id is distinct from old.client_id
    or new.therapist_user_id is distinct from old.therapist_user_id
    or new.requested_by is distinct from old.requested_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'appointment identity and attribution are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function aura_private.protect_appointment_identity() from public;
drop trigger if exists protect_appointment_identity on public.appointments;
create trigger protect_appointment_identity
before update on public.appointments
for each row execute function aura_private.protect_appointment_identity();

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
  therapist_is_bookable boolean;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'client'::public.user_role
  then
    raise exception 'client authentication required' using errcode = '42501';
  end if;

  select c.* into actor_client
  from public.clients c
  where c.auth_user_id = auth.uid();

  if not found
    or requested_starts_at <= now()
    or requested_duration_minutes not between 10 and 480
    or char_length(btrim(requested_session_type)) not between 1 and 80
  then
    raise exception 'valid future appointment request required' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.therapist_profiles tp
    join public.profiles p
      on p.id = tp.user_id
     and p.practice_id = tp.practice_id
     and p.role = 'therapist'
    where tp.user_id = requested_therapist_user_id
      and tp.practice_id = actor_client.practice_id
      and tp.directory_opt_in
      and tp.accepting_online_bookings
  ) into therapist_is_bookable;

  if not therapist_is_bookable then
    raise exception 'selected therapist is unavailable for online booking'
      using errcode = '22023';
  end if;

  insert into public.therapist_client_assignments (
    practice_id, client_id, therapist_user_id, assignment_source, assigned_by
  ) values (
    actor_client.practice_id,
    actor_client.id,
    requested_therapist_user_id,
    'client_booking',
    auth.uid()
  )
  on conflict (client_id, therapist_user_id) where ended_at is null do nothing;

  insert into public.appointments (
    practice_id, client_id, therapist_user_id, starts_at, duration_minutes,
    session_type, status, intake_status_snapshot, requested_by, room
  ) values (
    actor_client.practice_id,
    actor_client.id,
    requested_therapist_user_id,
    requested_starts_at,
    requested_duration_minutes,
    btrim(requested_session_type),
    'requested',
    actor_client.intake_status,
    auth.uid(),
    null
  )
  returning * into created_appointment;

  return created_appointment;
end;
$$;

revoke all on function public.request_appointment(uuid, timestamptz, integer, text) from public;
grant execute on function public.request_appointment(uuid, timestamptz, integer, text)
  to authenticated;

alter table public.therapist_client_assignments enable row level security;
alter table public.therapist_client_assignments force row level security;
drop policy if exists therapist_client_assignments_select_participant
  on public.therapist_client_assignments;
-- No direct application policies are created. Assignment membership and lifecycle are evaluated
-- through SECURITY DEFINER authorization helpers and narrow workflows, not a browsable ledger.
revoke all on public.therapist_client_assignments from public, anon, authenticated;
grant select, insert, update on public.therapist_client_assignments to service_role;

-- Base identity tables become self-scoped. Team discovery uses the narrow projections below.
drop policy if exists profiles_select_authorized on public.profiles;
create policy profiles_select_authorized on public.profiles for select to authenticated
using (
  id = auth.uid()
  or (
    public.is_therapist()
    and role = 'client'
    and exists (
      select 1 from public.clients c
      where c.auth_user_id = profiles.id
        and public.is_assigned_therapist(c.id)
    )
  )
);

drop policy if exists therapist_profiles_select_therapist on public.therapist_profiles;
drop policy if exists therapist_profiles_insert_therapist on public.therapist_profiles;
drop policy if exists therapist_profiles_update_therapist on public.therapist_profiles;
drop policy if exists therapist_profiles_select_self on public.therapist_profiles;
drop policy if exists therapist_profiles_insert_self on public.therapist_profiles;
drop policy if exists therapist_profiles_update_self on public.therapist_profiles;
create policy therapist_profiles_select_self on public.therapist_profiles for select to authenticated
using (user_id = auth.uid());
create policy therapist_profiles_insert_self on public.therapist_profiles for insert to authenticated
with check (
  user_id = auth.uid()
  and public.is_therapist_for_practice(practice_id)
);
create policy therapist_profiles_update_self on public.therapist_profiles for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_therapist_for_practice(practice_id)
);

drop policy if exists clients_insert_therapist on public.clients;
drop policy if exists clients_delete_therapist on public.clients;
drop policy if exists clients_insert_assigned_creator on public.clients;
drop policy if exists clients_delete_assigned_therapist on public.clients;
create policy clients_insert_assigned_creator on public.clients for insert to authenticated
with check (
  public.is_therapist_for_practice(practice_id)
  and created_by = auth.uid()
);
-- Client aggregates are never deleted directly by an application user. A future governed
-- retention/deletion workflow must perform the authorization, audit, and dependent-row handling.
revoke delete on public.clients from authenticated;

drop policy if exists appointments_insert_therapist on public.appointments;
drop policy if exists appointments_update_therapist on public.appointments;
drop policy if exists appointments_delete_therapist on public.appointments;
drop policy if exists appointments_insert_assigned_therapist on public.appointments;
drop policy if exists appointments_update_assigned_therapist on public.appointments;
drop policy if exists appointments_delete_assigned_therapist on public.appointments;
create policy appointments_insert_assigned_therapist on public.appointments for insert to authenticated
with check (
  public.is_assigned_therapist(client_id)
  and therapist_user_id = auth.uid()
  and requested_by = auth.uid()
);
create policy appointments_update_assigned_therapist on public.appointments for update to authenticated
using (
  public.is_assigned_therapist(client_id)
  and therapist_user_id = auth.uid()
)
with check (
  public.is_assigned_therapist(client_id)
  and therapist_user_id = auth.uid()
);
-- Appointment identity is retained for the longitudinal record. Cancellation/decline is a status
-- transition; no authenticated role receives a direct appointment DELETE policy.
revoke delete on public.appointments from authenticated;

drop policy if exists appointment_private_notes_therapist_all on public.appointment_private_notes;
drop policy if exists appointment_private_notes_assigned_therapist_all
  on public.appointment_private_notes;
create policy appointment_private_notes_assigned_therapist_all
on public.appointment_private_notes for all to authenticated
using (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and public.is_assigned_therapist(a.client_id)
  )
)
with check (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and public.is_assigned_therapist(a.client_id)
  )
);

drop policy if exists pain_entries_update_authorized on public.pain_entries;
drop policy if exists pain_entries_delete_authorized on public.pain_entries;
create policy pain_entries_update_authorized on public.pain_entries for update to authenticated
using (public.is_assigned_therapist(client_id) or recorded_by = auth.uid())
with check (public.can_access_client(client_id));
create policy pain_entries_delete_authorized on public.pain_entries for delete to authenticated
using (public.is_assigned_therapist(client_id) or recorded_by = auth.uid());

drop policy if exists functional_goal_professional_notes_therapist_all
  on public.functional_goal_professional_notes;
drop policy if exists functional_goal_professional_notes_assigned_therapist_all
  on public.functional_goal_professional_notes;
create policy functional_goal_professional_notes_assigned_therapist_all
on public.functional_goal_professional_notes for all to authenticated
using (
  exists (
    select 1 from public.functional_goals fg
    where fg.id = goal_id
      and public.is_assigned_therapist(fg.client_id)
  )
)
with check (
  exists (
    select 1 from public.functional_goals fg
    where fg.id = goal_id
      and public.is_assigned_therapist(fg.client_id)
  )
);

drop policy if exists functional_goal_entries_update_authorized
  on public.functional_goal_entries;
drop policy if exists functional_goal_entries_delete_authorized
  on public.functional_goal_entries;
create policy functional_goal_entries_update_authorized
on public.functional_goal_entries for update to authenticated
using (public.is_assigned_therapist(client_id) or recorded_by = auth.uid())
with check (public.can_access_client(client_id));
create policy functional_goal_entries_delete_authorized
on public.functional_goal_entries for delete to authenticated
using (public.is_assigned_therapist(client_id) or recorded_by = auth.uid());

drop policy if exists therapist_assessments_select_therapist on public.therapist_assessments;
drop policy if exists therapist_assessments_insert_therapist on public.therapist_assessments;
drop policy if exists therapist_assessments_update_therapist on public.therapist_assessments;
drop policy if exists therapist_assessments_delete_therapist on public.therapist_assessments;
drop policy if exists therapist_assessments_select_assigned on public.therapist_assessments;
drop policy if exists therapist_assessments_insert_assigned on public.therapist_assessments;
drop policy if exists therapist_assessments_update_assigned on public.therapist_assessments;
drop policy if exists therapist_assessments_delete_assigned on public.therapist_assessments;
create policy therapist_assessments_select_assigned on public.therapist_assessments
for select to authenticated using (public.is_assigned_therapist(client_id));
create policy therapist_assessments_insert_assigned on public.therapist_assessments
for insert to authenticated
with check (public.is_assigned_therapist(client_id) and recorded_by = auth.uid());
create policy therapist_assessments_update_assigned on public.therapist_assessments
for update to authenticated
using (public.is_assigned_therapist(client_id))
with check (public.is_assigned_therapist(client_id));
create policy therapist_assessments_delete_assigned on public.therapist_assessments
for delete to authenticated using (public.is_assigned_therapist(client_id));

drop policy if exists context_events_update_authorized on public.context_events;
drop policy if exists context_events_delete_authorized on public.context_events;
create policy context_events_update_authorized on public.context_events for update to authenticated
using (public.is_assigned_therapist(client_id) or recorded_by = auth.uid())
with check (public.can_access_client(client_id));
create policy context_events_delete_authorized on public.context_events for delete to authenticated
using (public.is_assigned_therapist(client_id) or recorded_by = auth.uid());

drop policy if exists session_records_select_authorized on public.session_records;
drop policy if exists session_records_insert_therapist on public.session_records;
drop policy if exists session_records_update_therapist on public.session_records;
drop policy if exists session_records_delete_therapist on public.session_records;
drop policy if exists session_records_insert_assigned on public.session_records;
drop policy if exists session_records_update_assigned on public.session_records;
drop policy if exists session_records_delete_assigned on public.session_records;
create policy session_records_select_authorized on public.session_records for select to authenticated
using (
  public.is_assigned_therapist(client_id)
  or (
    client_id = public.current_client_id()
    and finished_at is not null
    and client_visible_summary is not null
  )
);
create policy session_records_insert_assigned on public.session_records for insert to authenticated
with check (
  public.is_assigned_therapist(client_id)
  and therapist_user_id = auth.uid()
);
create policy session_records_update_assigned on public.session_records for update to authenticated
using (public.is_assigned_therapist(client_id))
with check (public.is_assigned_therapist(client_id));
create policy session_records_delete_assigned on public.session_records for delete to authenticated
using (public.is_assigned_therapist(client_id));

drop policy if exists session_private_notes_therapist_all on public.session_private_notes;
drop policy if exists session_private_notes_assigned_therapist_all
  on public.session_private_notes;
create policy session_private_notes_assigned_therapist_all
on public.session_private_notes for all to authenticated
using (
  exists (
    select 1 from public.session_records sr
    where sr.id = session_id
      and public.is_assigned_therapist(sr.client_id)
  )
)
with check (
  exists (
    select 1 from public.session_records sr
    where sr.id = session_id
      and public.is_assigned_therapist(sr.client_id)
  )
);

drop policy if exists session_interventions_select_authorized on public.session_interventions;
drop policy if exists session_interventions_insert_therapist on public.session_interventions;
drop policy if exists session_interventions_update_therapist on public.session_interventions;
drop policy if exists session_interventions_delete_therapist on public.session_interventions;
drop policy if exists session_interventions_insert_assigned on public.session_interventions;
drop policy if exists session_interventions_update_assigned on public.session_interventions;
drop policy if exists session_interventions_delete_assigned on public.session_interventions;
create policy session_interventions_select_authorized
on public.session_interventions for select to authenticated
using (
  public.is_assigned_therapist(client_id)
  or exists (
    select 1 from public.session_records sr
    where sr.id = session_id
      and sr.client_id = public.current_client_id()
      and sr.finished_at is not null
      and sr.client_visible_summary is not null
  )
);
create policy session_interventions_insert_assigned
on public.session_interventions for insert to authenticated
with check (public.is_assigned_therapist(client_id));
create policy session_interventions_update_assigned
on public.session_interventions for update to authenticated
using (public.is_assigned_therapist(client_id))
with check (public.is_assigned_therapist(client_id));
create policy session_interventions_delete_assigned
on public.session_interventions for delete to authenticated
using (public.is_assigned_therapist(client_id));

drop policy if exists follow_up_responses_delete_therapist on public.follow_up_responses;
drop policy if exists follow_up_responses_delete_assigned on public.follow_up_responses;
create policy follow_up_responses_delete_assigned on public.follow_up_responses
for delete to authenticated using (public.is_assigned_therapist(client_id));

drop policy if exists progress_photos_insert_therapist_consented on public.progress_photos;
drop policy if exists progress_photos_update_therapist_consented on public.progress_photos;
drop policy if exists progress_photos_delete_therapist on public.progress_photos;
drop policy if exists progress_photos_insert_assigned_consented on public.progress_photos;
drop policy if exists progress_photos_update_assigned_consented on public.progress_photos;
drop policy if exists progress_photos_delete_assigned on public.progress_photos;
create policy progress_photos_insert_assigned_consented on public.progress_photos
for insert to authenticated
with check (
  public.is_assigned_therapist(client_id)
  and public.has_active_consent(client_id, 'photography')
  and public.has_recent_auth(interval '10 minutes')
  and created_by = auth.uid()
);
create policy progress_photos_update_assigned_consented on public.progress_photos
for update to authenticated
using (public.is_assigned_therapist(client_id))
with check (
  public.is_assigned_therapist(client_id)
  and public.has_active_consent(client_id, 'photography')
  and public.has_recent_auth(interval '10 minutes')
);
create policy progress_photos_delete_assigned on public.progress_photos
for delete to authenticated using (
  public.is_assigned_therapist(client_id)
  and public.has_recent_auth(interval '10 minutes')
);

drop policy if exists insights_select_authorized on public.insights;
drop policy if exists insights_insert_therapist on public.insights;
drop policy if exists insights_update_therapist on public.insights;
drop policy if exists insights_delete_therapist on public.insights;
drop policy if exists insights_insert_assigned on public.insights;
drop policy if exists insights_update_assigned on public.insights;
drop policy if exists insights_delete_assigned on public.insights;
create policy insights_select_authorized on public.insights for select to authenticated
using (
  public.is_assigned_therapist(client_id)
  or (client_id = public.current_client_id() and status = 'approved')
);
create policy insights_insert_assigned on public.insights for insert to authenticated
with check (public.is_assigned_therapist(client_id));
create policy insights_update_assigned on public.insights for update to authenticated
using (public.is_assigned_therapist(client_id))
with check (public.is_assigned_therapist(client_id));
create policy insights_delete_assigned on public.insights for delete to authenticated
using (public.is_assigned_therapist(client_id));

drop policy if exists insight_private_narrations_therapist_all
  on public.insight_private_narrations;
drop policy if exists insight_private_narrations_assigned_therapist_all
  on public.insight_private_narrations;
create policy insight_private_narrations_assigned_therapist_all
on public.insight_private_narrations for all to authenticated
using (
  exists (
    select 1 from public.insights i
    where i.id = insight_id
      and public.is_assigned_therapist(i.client_id)
  )
)
with check (
  exists (
    select 1 from public.insights i
    where i.id = insight_id
      and public.is_assigned_therapist(i.client_id)
  )
);

drop policy if exists handoff_exports_select_authorized on public.handoff_exports;
drop policy if exists handoff_exports_insert_therapist on public.handoff_exports;
drop policy if exists handoff_exports_update_therapist on public.handoff_exports;
drop policy if exists handoff_exports_delete_therapist on public.handoff_exports;
drop policy if exists handoff_exports_insert_assigned on public.handoff_exports;
drop policy if exists handoff_exports_update_assigned on public.handoff_exports;
drop policy if exists handoff_exports_delete_assigned on public.handoff_exports;
create policy handoff_exports_select_authorized on public.handoff_exports
for select to authenticated
using (
  public.is_assigned_therapist(client_id)
  or client_id = public.current_client_id()
);
create policy handoff_exports_insert_assigned on public.handoff_exports
for insert to authenticated
with check (
  public.is_assigned_therapist(client_id)
  and public.has_recent_auth(interval '10 minutes')
  and created_by = auth.uid()
);
create policy handoff_exports_update_assigned on public.handoff_exports
for update to authenticated
using (
  public.is_assigned_therapist(client_id)
  and public.has_recent_auth(interval '10 minutes')
)
with check (
  public.is_assigned_therapist(client_id)
  and public.has_recent_auth(interval '10 minutes')
);
create policy handoff_exports_delete_assigned on public.handoff_exports
for delete to authenticated
using (
  public.is_assigned_therapist(client_id)
  and public.has_recent_auth(interval '10 minutes')
);

drop policy if exists handoff_export_approvals_select_authorized
  on public.handoff_export_approvals;
create policy handoff_export_approvals_select_authorized
on public.handoff_export_approvals for select to authenticated
using (
  public.is_assigned_therapist(client_id)
  or client_id = public.current_client_id()
);

drop policy if exists handoff_secrets_therapist_all on public.handoff_secrets;
drop policy if exists handoff_secrets_assigned_therapist_all on public.handoff_secrets;
create policy handoff_secrets_assigned_therapist_all
on public.handoff_secrets for all to authenticated
using (
  public.has_recent_auth(interval '10 minutes')
  and public.has_active_handoff_approval(handoff_export_id)
  and exists (
    select 1 from public.handoff_exports he
    where he.id = handoff_export_id
      and public.is_assigned_therapist(he.client_id)
  )
)
with check (
  public.has_recent_auth(interval '10 minutes')
  and public.has_active_handoff_approval(handoff_export_id)
  and exists (
    select 1 from public.handoff_exports he
    where he.id = handoff_export_id
      and public.is_assigned_therapist(he.client_id)
  )
);

drop policy if exists handoff_responses_select_therapist on public.handoff_responses;
drop policy if exists handoff_responses_select_assigned on public.handoff_responses;
create policy handoff_responses_select_assigned on public.handoff_responses
for select to authenticated
using (
  exists (
    select 1 from public.handoff_exports he
    where he.id = handoff_export_id
      and public.is_assigned_therapist(he.client_id)
  )
);

drop policy if exists notification_outbox_therapist_all on public.notification_outbox;
drop policy if exists notification_outbox_assigned_therapist_all on public.notification_outbox;
create policy notification_outbox_assigned_therapist_all on public.notification_outbox
for all to authenticated
using (public.is_assigned_therapist(client_id))
with check (public.is_assigned_therapist(client_id));

-- Assignment audit rows remain available to trusted service operations only. Exposing them through
-- the legacy same-practice therapist audit policy would recreate a browsable care-team ledger.
drop policy if exists audit_events_select_therapist on public.audit_events;
drop policy if exists audit_events_select_non_assignment_therapist on public.audit_events;
create policy audit_events_select_non_assignment_therapist on public.audit_events
for select to authenticated
using (
  public.is_therapist_for_practice(practice_id)
  and resource_type <> 'therapist_client_assignment'
);

-- Storage update/delete paths must use the same assignment boundary as their metadata. Reads and
-- inserts already call can_access_client in migration 004; these replacements close the remaining
-- same-practice-only mutation predicates.
drop policy if exists progress_photos_update_therapist_consented on storage.objects;
create policy progress_photos_update_therapist_consented
on storage.objects for update to authenticated
using (
  bucket_id = 'progress-photos'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
)
with check (
  bucket_id = 'progress-photos'
  and public.is_valid_client_resource_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
  and public.has_recent_auth(interval '10 minutes')
  and public.has_active_consent(public.storage_path_uuid(name, 2), 'photography')
);

drop policy if exists progress_photos_delete_therapist on storage.objects;
create policy progress_photos_delete_therapist
on storage.objects for delete to authenticated
using (
  bucket_id = 'progress-photos'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
);

drop policy if exists voice_notes_update_therapist on storage.objects;
create policy voice_notes_update_therapist
on storage.objects for update to authenticated
using (
  bucket_id = 'voice-notes'
  and public.is_therapist()
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
)
with check (
  bucket_id = 'voice-notes'
  and public.is_valid_client_resource_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
);

drop policy if exists voice_notes_delete_therapist on storage.objects;
create policy voice_notes_delete_therapist
on storage.objects for delete to authenticated
using (
  bucket_id = 'voice-notes'
  and public.is_therapist()
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
);

drop policy if exists handoff_documents_update_therapist_consented on storage.objects;
create policy handoff_documents_update_therapist_consented
on storage.objects for update to authenticated
using (
  bucket_id = 'handoff-documents'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
)
with check (
  bucket_id = 'handoff-documents'
  and public.is_valid_client_resource_path(name)
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
  and public.has_active_consent(public.storage_path_uuid(name, 2), 'handoff')
  and public.has_active_handoff_approval(public.storage_path_uuid(name, 3))
);

drop policy if exists handoff_documents_delete_therapist on storage.objects;
create policy handoff_documents_delete_therapist
on storage.objects for delete to authenticated
using (
  bucket_id = 'handoff-documents'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
);

create or replace function public.can_manage_public_brand_asset(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_therapist()
    and public.is_valid_practice_asset_path(object_name)
    and public.storage_path_uuid(object_name, 1) = public.current_practice_id()
    and (
      not exists (
        select 1
        from public.therapist_profiles tp
        where tp.practice_id = public.current_practice_id()
          and tp.public_portrait_resource_id = public.storage_path_uuid(object_name, 2)
      )
      or exists (
        select 1
        from public.therapist_profiles tp
        where tp.practice_id = public.current_practice_id()
          and tp.user_id = auth.uid()
          and tp.public_portrait_resource_id = public.storage_path_uuid(object_name, 2)
      )
    ),
    false
  );
$$;

revoke all on function public.can_manage_public_brand_asset(text) from public;
grant execute on function public.can_manage_public_brand_asset(text)
  to authenticated, service_role;

drop policy if exists brand_assets_public_insert_therapist on storage.objects;
create policy brand_assets_public_insert_therapist
on storage.objects for insert to authenticated
with check (
  bucket_id = 'brand-assets-public'
  and public.can_manage_public_brand_asset(name)
);

drop policy if exists brand_assets_public_update_therapist on storage.objects;
create policy brand_assets_public_update_therapist
on storage.objects for update to authenticated
using (
  bucket_id = 'brand-assets-public'
  and public.can_manage_public_brand_asset(name)
)
with check (
  bucket_id = 'brand-assets-public'
  and public.can_manage_public_brand_asset(name)
);

drop policy if exists brand_assets_public_delete_therapist on storage.objects;
create policy brand_assets_public_delete_therapist
on storage.objects for delete to authenticated
using (
  bucket_id = 'brand-assets-public'
  and public.can_manage_public_brand_asset(name)
);

drop view if exists public.client_therapist_directory;
create view public.client_therapist_directory
with (security_barrier = true)
as
select
  tp.user_id,
  tp.directory_slug,
  tp.professional_name,
  tp.professional_title,
  tp.public_portrait_path
from public.therapist_profiles tp
join public.profiles p
  on p.id = tp.user_id
 and p.practice_id = tp.practice_id
 and p.role = 'therapist'
where tp.practice_id = public.current_practice_id()
  and tp.directory_opt_in
  and tp.accepting_online_bookings
  and public.current_user_role() in ('client', 'therapist');

comment on view public.client_therapist_directory is
  'Authenticated bookable therapist projection. Omits contact, settings, usernames, and private paths.';
revoke all on public.client_therapist_directory from public, anon;
grant select on public.client_therapist_directory to authenticated;

drop view if exists public.public_therapist_directory;
create view public.public_therapist_directory
with (security_barrier = true)
as
select
  pr.name as practice_name,
  tp.directory_slug,
  tp.professional_name,
  tp.professional_title,
  tp.public_portrait_path
from public.therapist_profiles tp
join public.profiles p
  on p.id = tp.user_id
 and p.practice_id = tp.practice_id
 and p.role = 'therapist'
join public.practices pr on pr.id = tp.practice_id
where tp.directory_opt_in;

comment on view public.public_therapist_directory is
  'Explicitly opted-in public professional identity and portrait path only; never a client lookup.';
revoke all on public.public_therapist_directory from public;
grant select on public.public_therapist_directory to anon, authenticated;
