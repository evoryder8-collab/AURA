-- Private object buckets and path/consent-aware Storage policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'progress-photos', 'progress-photos', false, 15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  ),
  (
    'voice-notes', 'voice-notes', false, 26214400,
    array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']
  ),
  (
    'handoff-documents', 'handoff-documents', false, 26214400,
    array['application/pdf']
  ),
  (
    'practice-assets-private', 'practice-assets-private', false, 15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'brand-assets-public', 'brand-assets-public', true, 5242880,
    array['image/png', 'image/webp', 'image/jpeg']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_path_uuid(object_name text, segment_number integer)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if segment_number < 1 or segment_number > 8 then
    return null;
  end if;
  return nullif(split_part(object_name, '/', segment_number), '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.is_valid_client_resource_path(object_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    public.storage_path_uuid(object_name, 1) is not null
    and public.storage_path_uuid(object_name, 2) is not null
    and public.storage_path_uuid(object_name, 3) is not null
    and split_part(object_name, '/', 4) <> ''
    and object_name !~ '(^|/)\.{1,2}(/|$)'
    and char_length(object_name) <= 512;
$$;

create or replace function public.is_valid_practice_asset_path(object_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    public.storage_path_uuid(object_name, 1) is not null
    and public.storage_path_uuid(object_name, 2) is not null
    and split_part(object_name, '/', 3) <> ''
    and object_name !~ '(^|/)\.{1,2}(/|$)'
    and char_length(object_name) <= 512;
$$;

revoke all on function public.storage_path_uuid(text, integer) from public;
revoke all on function public.is_valid_client_resource_path(text) from public;
revoke all on function public.is_valid_practice_asset_path(text) from public;
grant execute on function public.storage_path_uuid(text, integer) to authenticated, service_role;
grant execute on function public.is_valid_client_resource_path(text) to authenticated, service_role;
grant execute on function public.is_valid_practice_asset_path(text) to authenticated, service_role;

create or replace function aura_private.validate_brand_asset_paths()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.logo_path is not null and (
    not public.is_valid_practice_asset_path(new.logo_path)
    or public.storage_path_uuid(new.logo_path, 1) is distinct from new.practice_id
  ) then
    raise exception 'logo path must use the current practice and an opaque resource identifier'
      using errcode = '23514';
  end if;
  if new.portrait_path is not null and (
    not public.is_valid_practice_asset_path(new.portrait_path)
    or public.storage_path_uuid(new.portrait_path, 1) is distinct from new.practice_id
  ) then
    raise exception 'portrait path must use the current practice and an opaque resource identifier'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_brand_asset_paths
before insert or update of logo_path, portrait_path, practice_id on public.brand_config
for each row execute function aura_private.validate_brand_asset_paths();

-- Public bucket: anonymous reads are deliberate. Only same-practice therapists
-- can write, and object names contain opaque UUIDs rather than client details.
create policy brand_assets_public_read
on storage.objects for select to anon, authenticated
using (bucket_id = 'brand-assets-public');

create policy brand_assets_public_insert_therapist
on storage.objects for insert to authenticated
with check (
  bucket_id = 'brand-assets-public'
  and public.is_therapist()
  and public.is_valid_practice_asset_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

create policy brand_assets_public_update_therapist
on storage.objects for update to authenticated
using (
  bucket_id = 'brand-assets-public'
  and public.is_therapist()
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
)
with check (
  bucket_id = 'brand-assets-public'
  and public.is_valid_practice_asset_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

create policy brand_assets_public_delete_therapist
on storage.objects for delete to authenticated
using (
  bucket_id = 'brand-assets-public'
  and public.is_therapist()
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

-- Progress photos: active photography consent and fresh authentication are
-- enforced for reads. Uploads are therapist-only and require consent before the
-- object exists; metadata is then inserted with the identical path.
create policy progress_photos_read_consented_fresh
on storage.objects for select to authenticated
using (
  bucket_id = 'progress-photos'
  and exists (
    select 1
    from public.progress_photos pp
    where pp.storage_path = name
      and public.can_access_client(pp.client_id)
      and public.has_active_consent(pp.client_id, 'photography')
      and public.has_recent_auth(interval '10 minutes')
  )
);

create policy progress_photos_insert_therapist_consented
on storage.objects for insert to authenticated
with check (
  bucket_id = 'progress-photos'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.is_valid_client_resource_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
  and public.has_active_consent(public.storage_path_uuid(name, 2), 'photography')
);

create policy progress_photos_update_therapist_consented
on storage.objects for update to authenticated
using (
  bucket_id = 'progress-photos'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
)
with check (
  bucket_id = 'progress-photos'
  and public.is_valid_client_resource_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.has_recent_auth(interval '10 minutes')
  and public.has_active_consent(public.storage_path_uuid(name, 2), 'photography')
);

create policy progress_photos_delete_therapist
on storage.objects for delete to authenticated
using (
  bucket_id = 'progress-photos'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

-- Therapist voice notes never become client-readable. Provider transcription
-- is performed by an authenticated Edge Function, not directly by the browser.
create policy voice_notes_read_therapist
on storage.objects for select to authenticated
using (
  bucket_id = 'voice-notes'
  and public.is_therapist()
  and public.is_valid_client_resource_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
);

create policy voice_notes_insert_therapist
on storage.objects for insert to authenticated
with check (
  bucket_id = 'voice-notes'
  and public.is_therapist()
  and public.is_valid_client_resource_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.can_access_client(public.storage_path_uuid(name, 2))
);

create policy voice_notes_update_therapist
on storage.objects for update to authenticated
using (
  bucket_id = 'voice-notes'
  and public.is_therapist()
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
)
with check (
  bucket_id = 'voice-notes'
  and public.is_valid_client_resource_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

create policy voice_notes_delete_therapist
on storage.objects for delete to authenticated
using (
  bucket_id = 'voice-notes'
  and public.is_therapist()
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

-- Handoff PDFs require active handoff consent. Recipients never receive Storage
-- credentials or a permanent object path; secure-handoff streams the bytes.
create policy handoff_documents_read_therapist
on storage.objects for select to authenticated
using (
  bucket_id = 'handoff-documents'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and exists (
    select 1
    from public.handoff_secrets hs
    join public.handoff_exports he on he.id = hs.handoff_export_id
    where hs.storage_path = name
      and he.practice_id = public.current_practice_id()
      and public.has_active_consent(he.client_id, 'handoff')
      and public.has_active_handoff_approval(he.id)
  )
);

create policy handoff_documents_insert_therapist_consented
on storage.objects for insert to authenticated
with check (
  bucket_id = 'handoff-documents'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.is_valid_client_resource_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.has_active_consent(public.storage_path_uuid(name, 2), 'handoff')
  and exists (
    select 1 from public.handoff_exports he
    where he.id = public.storage_path_uuid(name, 3)
      and he.client_id = public.storage_path_uuid(name, 2)
      and he.practice_id = public.storage_path_uuid(name, 1)
      and public.has_active_handoff_approval(he.id)
  )
);

create policy handoff_documents_update_therapist_consented
on storage.objects for update to authenticated
using (
  bucket_id = 'handoff-documents'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
)
with check (
  bucket_id = 'handoff-documents'
  and public.is_valid_client_resource_path(name)
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
  and public.has_active_consent(public.storage_path_uuid(name, 2), 'handoff')
  and public.has_active_handoff_approval(public.storage_path_uuid(name, 3))
);

create policy handoff_documents_delete_therapist
on storage.objects for delete to authenticated
using (
  bucket_id = 'handoff-documents'
  and public.is_therapist()
  and public.has_recent_auth(interval '10 minutes')
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

-- Private practice assets are therapist-only. The separate public brand bucket
-- must be used for assets intentionally visible before authentication.
create policy practice_assets_private_read_therapist
on storage.objects for select to authenticated
using (
  bucket_id = 'practice-assets-private'
  and public.is_therapist()
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

create policy practice_assets_private_insert_therapist
on storage.objects for insert to authenticated
with check (
  bucket_id = 'practice-assets-private'
  and public.is_therapist()
  and public.is_valid_practice_asset_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

create policy practice_assets_private_update_therapist
on storage.objects for update to authenticated
using (
  bucket_id = 'practice-assets-private'
  and public.is_therapist()
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
)
with check (
  bucket_id = 'practice-assets-private'
  and public.is_valid_practice_asset_path(name)
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);

create policy practice_assets_private_delete_therapist
on storage.objects for delete to authenticated
using (
  bucket_id = 'practice-assets-private'
  and public.is_therapist()
  and public.storage_path_uuid(name, 1) = public.current_practice_id()
);
