begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'practices', 'profiles', 'therapist_profiles', 'therapist_client_assignments',
        'clients', 'appointments',
        'appointment_private_notes', 'health_conditions', 'consents', 'pain_entries',
        'functional_goals', 'functional_goal_professional_notes', 'functional_goal_entries',
        'therapist_assessments', 'context_events', 'session_records', 'session_private_notes',
        'session_interventions', 'follow_up_responses', 'progress_photos', 'insights',
        'insight_private_narrations', 'handoff_exports', 'handoff_export_approvals',
        'handoff_secrets', 'handoff_responses',
        'audit_events', 'brand_config', 'knowledge_rules', 'notification_outbox', 'auth_rate_limits'
      )
      and not c.relrowsecurity
  ),
  0,
  'RLS is enabled on every AURA application table'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'practices', 'profiles', 'therapist_profiles', 'therapist_client_assignments',
        'clients', 'appointments',
        'appointment_private_notes', 'health_conditions', 'consents', 'pain_entries',
        'functional_goals', 'functional_goal_professional_notes', 'functional_goal_entries',
        'therapist_assessments', 'context_events', 'session_records', 'session_private_notes',
        'session_interventions', 'follow_up_responses', 'progress_photos', 'insights',
        'insight_private_narrations', 'handoff_exports', 'handoff_export_approvals',
        'handoff_secrets', 'handoff_responses',
        'audit_events', 'brand_config', 'knowledge_rules', 'notification_outbox', 'auth_rate_limits'
      )
      and not c.relforcerowsecurity
  ),
  0,
  'RLS is forced on every AURA application table'
);

select ok(
  not has_table_privilege('anon', 'public.clients', 'SELECT'),
  'anonymous has no clients-table privilege'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anonymous has no profiles-table privilege'
);
select ok(
  not has_table_privilege('anon', 'public.audit_events', 'SELECT'),
  'anonymous has no audit-table privilege'
);
select ok(
  has_table_privilege('anon', 'public.public_brand_config', 'SELECT'),
  'anonymous can read the deliberately public brand view'
);
select ok(
  has_table_privilege('anon', 'public.public_therapist_directory', 'SELECT'),
  'anonymous can read the deliberately narrow opted-in therapist directory'
);
select ok(
  has_table_privilege('authenticated', 'public.public_therapist_directory', 'SELECT'),
  'the same safe public therapist projection remains readable after login'
);
select ok(
  not has_table_privilege('anon', 'public.therapist_profiles', 'SELECT'),
  'anonymous cannot read therapist base profiles'
);
select ok(
  not has_table_privilege('authenticated', 'public.therapist_client_assignments', 'INSERT'),
  'authenticated users cannot directly forge therapist-client assignments'
);
select ok(
  not has_table_privilege('authenticated', 'public.therapist_client_assignments', 'UPDATE'),
  'authenticated users cannot directly reactivate or end assignments'
);
select is(
  (
    select count(*)::integer
    from storage.buckets
    where id in (
      'progress-photos', 'voice-notes', 'handoff-documents', 'practice-assets-private'
    ) and public
  ),
  0,
  'all sensitive Storage buckets are private'
);
select is(
  (select public from storage.buckets where id = 'brand-assets-public'),
  true,
  'the separate raster-only brand bucket is deliberately public'
);
select ok(
  not has_function_privilege('anon', 'public.resolve_login_email(text)', 'EXECUTE'),
  'anonymous cannot call the username-to-email resolver'
);
select ok(
  not has_table_privilege('authenticated', 'public.handoff_export_approvals', 'INSERT'),
  'application users cannot directly forge per-export approval snapshots'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.approve_handoff_export(uuid,text,text,text,jsonb,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous cannot call the handoff approval RPC'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'appointments'
      and cmd in ('INSERT', 'UPDATE')
      and policyname not in (
        'appointments_insert_assigned_therapist',
        'appointments_update_assigned_therapist'
      )
  ),
  0,
  'appointment table mutations have no direct client RLS policy'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'progress_photos_update_therapist_consented',
        'progress_photos_delete_therapist',
        'voice_notes_update_therapist',
        'voice_notes_delete_therapist',
        'handoff_documents_update_therapist_consented',
        'handoff_documents_delete_therapist'
      )
      and concat_ws(' ', qual, with_check) not like '%can_access_client%'
  ),
  0,
  'private client-object update/delete policies enforce active assignment access'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'brand_assets_public_insert_therapist',
        'brand_assets_public_update_therapist',
        'brand_assets_public_delete_therapist'
      )
      and concat_ws(' ', qual, with_check) not like '%can_manage_public_brand_asset%'
  ),
  0,
  'public brand mutations protect therapist-owned portrait namespaces'
);

select * from finish();
rollback;
