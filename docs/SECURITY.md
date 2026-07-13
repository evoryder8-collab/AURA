# Security and privacy

## Status

AURA is a synthetic-data test build. It must not store real client or health data until a qualified production review has covered jurisdiction-specific privacy obligations, retention and deletion policy, incident response, processor agreements, backup/restore, accessibility, clinical language, and an independent security assessment.

This document defines engineering controls; it is not a legal or regulatory certification.

## Trust boundaries

Treat the browser, URL, local storage, IndexedDB, service worker, role-selection screen, route parameters, user-editable auth metadata, and every submitted field as untrusted. Authentication establishes an identity; database and storage policies authorize each operation.

The principal boundaries are:

1. unauthenticated visitor → public static application;
2. authenticated browser → Supabase Auth, Postgres API, private Storage, or protected Edge Function;
3. Edge Function → database/storage and optional external provider;
4. opaque recipient token → one scoped, expiring handoff operation;
5. local demo data → synthetic-only browser persistence with no server synchronization.

The most important failure modes are cross-client disclosure, therapist-role escalation, private-note disclosure, consent bypass, private-object exposure, handoff-token leakage, browser-secret exposure, and over-trusting generated narration.

## Public and protected configuration

Every `VITE_` variable is embedded in public browser assets. This includes the Supabase URL and publishable key, which are designed to operate under RLS and grants. They are identifiers, not authorization bypasses.

Never place any of these in a tracked or frontend `.env*` file, workflow `VITE_` values, source, logs, tests, or built assets. A local service-role value may exist only in the specifically ignored server/bootstrap environment documented for local Supabase:

- `SUPABASE_SERVICE_ROLE_KEY`;
- AI or transcription provider API keys;
- `HANDOFF_TOKEN_PEPPER` and `RATE_LIMIT_PEPPER`;
- SMTP/SMS/push provider credentials;
- deploy keys, personal access tokens, or usable account passwords.

Protected values belong in local uncommitted server environment files for development and Supabase Edge Function secrets in hosted environments. Secret-bearing provider calls originate only from protected server code. Errors and telemetry must not echo configuration values.

Before a release, inspect the built bundle for protected key names and known credential prefixes in addition to running automated checks.

## Authentication and role enforcement

- The animated therapist/client choice is presentation only. It may remember a preferred login view, never a privilege.
- After login, routing loads `profiles.role` through protected backend access. User-editable metadata is not trusted for role decisions.
- Therapist signup is closed. Development bootstrap uses an uncommitted local service credential; later administration uses a protected function.
- The first hosted therapist is created through a trusted out-of-band operation. `admin-users` requires an existing fresh-auth therapist, and inviting another therapist additionally requires AAL2.
- Client accounts are linked by therapist invitation, secure intake invitation, or existing-client linking.
- Login errors are generic and do not confirm whether an email or username exists.
- Username-to-email resolution is a protected, rate-limited Edge Function. Without it, email login remains operational.
- Passwords are passed only to the authentication provider, never logged or stored by application code.
- Therapist access supports TOTP enrollment/challenge. Passkeys are unavailable unless explicitly enabled and backed by an implemented secure flow.
- Sign-out-everywhere uses the provider capability where available and accurately states its scope.

Fresh authentication is required in the application flow before viewing photographs, generating/exporting handoffs, changing consent, processing deletion/export requests, and other sensitive operations. Fresh-auth UI complements rather than replaces RLS and consent policies.

## Database grants and RLS

Every application table has RLS enabled and an explicit grant posture. Enabling RLS alone is not sufficient: revoke broad defaults, grant only required operations to `authenticated` or carefully scoped server roles, and pair `USING` and `WITH CHECK` expressions.

Policy rules:

- clients may access only the `clients` row linked to `auth.uid()` and records owned by that client;
- clients may create only allowed self-service entries and cannot choose another owner/actor;
- therapists may work only with records in this dedicated practice and do not bypass photography or handoff consent;
- therapist assessments, private scheduling notes, private session summaries, draft insights, and raw audit data are never selected through client-facing relations;
- anonymous access is denied except for a documented, narrow, non-sensitive public brand projection;
- audit events are append-only for application users;
- role changes and administrative/bootstrap operations are performed through protected paths, never direct client updates.

Prefer separate private tables and client-safe views/RPCs over column hiding in the UI. A malicious client can call the API without the React application.

Authorization helpers using `SECURITY DEFINER` must:

- be necessary and narrowly scoped;
- set a fixed empty or trusted `search_path` and fully qualify objects;
- avoid caller-controlled object names and dynamic SQL;
- be owned by a non-login role where practical;
- have public execution revoked, then grant only intended roles;
- return authorization facts, not sensitive identity mappings.

## Required negative authorization tests

Local SQL/security tests must prove denial for:

- Client A reading or modifying Client B;
- a client creating/modifying a therapist assessment;
- a client reading a therapist-private note or scheduling note;
- a client reading or approving a draft/unapproved insight;
- a client reading a photo without active photography consent;
- a therapist creating photo metadata without active photography consent;
- anonymous application-table access;
- a user changing their own role or practice ownership;
- application-user update/delete of audit records;
- a revoked or expired handoff token;
- public listing or permanent URL access to private buckets.

Positive controls should also prove the smallest intended access, so a test suite that denies everything cannot pass as secure.

## Storage

Private buckets:

- `progress-photos`;
- `voice-notes`;
- `handoff-documents`;
- `practice-assets-private`.

An optional public bucket contains only deliberately public brand assets. Object paths use non-guessable IDs, for example `<practice_id>/<client_id>/<resource_id>/<opaque-filename>`. Never put a client name, diagnosis, health detail, email, or bearer token in a path.

Storage policy and related database metadata both enforce ownership. Photo access additionally checks active photography consent; handoff access checks the handoff authorization and status. Buckets are not publicly listable and private resources use authenticated downloads or short-lived signed URLs. Permanent object URLs are never placed in handoff links, logs, or client-visible records.

Upload validation should restrict size and expected media type, generate safe server-side names, and treat client-supplied MIME type/extension as advisory. The public upload bucket accepts raster branding only; trusted bundled SVGs remain build-time assets rather than arbitrary uploads. Deletion coordinates the object and metadata and records a safe audit event.

## Edge Functions

Protected functions validate authentication, backend role, ownership, consent, input schema, rate limits, and request size before work. They return generic errors at public/token boundaries and structured safe errors to authenticated clients. CORS origins are restricted to the configured application origins; development origins are explicit.

Functions use the service role only when RLS bypass is genuinely necessary and reproduce authorization checks before privileged access. Prefer an authenticated user-scoped Supabase client when possible. Log request IDs and safe resource IDs, never bearer tokens or full payloads.

### Username resolver

Accepts the identifier and password over TLS, applies keyed non-reversible account/address rate buckets, resolves a username only inside the protected function, completes the password exchange with Supabase Auth, and returns only the session fields the login exchange requires. It never returns the resolved email, logs a password, or exposes a username directory, and it produces indistinguishable unknown-account/password-failure responses.

### Narration

Receives a minimized evidence envelope: approved deterministic pattern ID, exact metrics, confidence, missing-data statement, allowed vocabulary, and audience. It has no unrestricted client-file access. Output is schema-validated, numbers are compared with supplied evidence, prohibited language is rejected, uncertainty is preserved, and client narration remains draft until therapist approval.

### Handoff token operations

Generate at least 256 bits of cryptographically secure randomness. Return the opaque token once, store only a strong peppered hash, enforce expiry and revocation server-side, use constant-time comparison where applicable, and never place raw tokens in logs. The token scopes access to one handoff; it does not expose the storage path or general client APIs. Public inspect, download, and response operations use separate keyed token/address rate buckets before validation. Safe access events record status and handoff ID without the token.

## Consent and data minimization

Consent is versioned, scoped, and revocable. Photography, handoff, reminders, and optional AI processing are distinct decisions. UI state does not override database consent. Photos remain off by default in handoffs, and client approval covers recipient, purpose, included categories, photo inclusion, delivery, and expiry.

Collect and disclose only fields required for the selected workflow. Separate therapist-private observations from approved client narration. Handoff generation uses a deliberate section allowlist and a final therapist preview rather than serializing an entire client record.

The test build structurally validates guardian details where relevant but makes no claim of jurisdiction-specific legal completeness.

## Deterministic patterns and professional language

The versioned TypeScript engine—not a generative model—classifies patterns. Its evidence includes exact deltas, included/excluded observations and reasons, threshold/rule versions, confidence, and missing data. Incompatible measurement methods are excluded from comparable trends.

Generated narration is optional presentation. It cannot change the pattern or numbers and has a deterministic fallback. Client output requires therapist approval.

Do not use diagnostic, causal, medical-necessity, structural-healing, or guaranteed-outcome language. Context events are shown as temporal proximity, not causation. `medical_review_consideration` is a review prompt based on recorded prototype thresholds, not a diagnosis.

## PWA and offline data

Cache only public application-shell assets and the offline route. Do not cache:

- authenticated API responses indiscriminately;
- access/refresh tokens;
- private photographs;
- PDF handoffs;
- voice notes;
- signed URLs;
- unrestricted client data.

IndexedDB is limited to synthetic demo state, minimal pending Session Mode state, explicit offline mutations, and non-sensitive preferences. Offline records have unique mutation IDs, creation timestamps, retry counts, and clear sync states. Queued writes are scoped to the current authenticated identity, reconciled idempotently, and removed on sign-out where appropriate. The UI never describes local-only demo state as synchronized.

## Audit and privacy-safe logging

Audit important identity/security events where the provider makes them available, client creation, consent changes, photo create/delete, insight decisions, handoff create/consent/access, export/deletion requests, role changes, and sensitive setting changes.

Logs and audit metadata may contain opaque actor/resource IDs, action, timestamp, result, request ID, and a small allowlisted metadata object. They must not contain passwords, session credentials, handoff tokens, full health narratives, client names where avoidable, photo/signed URLs, voice recordings, or raw transcripts.

Application errors shown to users are actionable without disclosing table names, policy internals, existence of another account, or protected provider output.

## Frontend safeguards

Frontend guards improve experience but are not authorization. Still:

- sanitize or render user text as plain text; do not insert untrusted HTML;
- avoid secrets and sensitive detail in query strings, fragment routes, browser titles, analytics, and console logging;
- do not persist auth claims or selected role as an authorization source;
- clear private query caches on sign-out/account switch;
- use safe external-link attributes and an explicit allowlist;
- apply a restrictive Content Security Policy where Pages/application requirements allow it;
- keep dependencies and lockfile reviewed and run package/security maintenance deliberately;
- hide unimplemented controls or label an environment-limited capability accurately.

## Release security checklist

- [ ] Only synthetic data is present unless production approval is documented
- [ ] All application tables have RLS plus deliberate grants and policies
- [ ] Storage buckets and paths have been checked for public access/listing
- [ ] Cross-client, private-note, consent, escalation, anonymous, audit, and token negative tests pass
- [ ] Positive authorization tests pass
- [ ] Therapist MFA and fresh-auth paths work in the configured environment
- [ ] Public Vite configuration contains no protected values
- [ ] Built assets contain no service-role/provider key names or credential material
- [ ] Service worker excludes authenticated/private resources
- [ ] Provider payloads are minimized and narration validation/fallback works
- [ ] Handoff token expiry, revocation, hash-only storage, and audit behavior pass
- [ ] Dependency, migration, backup/restore, retention, and incident-response reviews are complete
- [ ] Exact test evidence is recorded without claiming unrun checks

Report a suspected exposure by privately contacting the repository owner. Do not open a public issue containing client data, secrets, tokens, object paths, or exploit details.
