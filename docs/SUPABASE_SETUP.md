# Supabase setup

AURA runs without Supabase in explicit synthetic demo mode. Connected mode is for a dedicated single-practice Supabase project and must not be enabled with real data until the security and production-readiness review in [SECURITY.md](./SECURITY.md) is complete.

## Prerequisites

- the Node version in `.nvmrc`;
- npm;
- Docker Desktop or another Docker-compatible runtime for local Supabase;
- Supabase CLI (the repository invokes it through `npx`, so a global install is optional);
- Deno 2 for the direct demo-auth bootstrap and Edge Function checks (the npm wrapper may provide the documented shortcut);
- a Supabase account/project only for hosted deployment.

From a clean checkout:

```sh
nvm use
npm ci
npx supabase start
```

`supabase start` prints local API, Studio, database, mail-catcher, publishable/anon, and service-role values. Treat the local service-role value as protected even though it belongs to a local stack.

## Browser environment

Copy `.env.example` to `.env.local`. `.env.local` is ignored and must never be committed.

Connected local mode needs only public browser configuration:

```dotenv
VITE_APP_ENV=development
VITE_DEMO_MODE=false
VITE_BASE_PATH=/
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<local publishable or anon key from supabase status>
```

All `VITE_` values are public at build time. The publishable key is safe only because database grants, RLS, storage policies, and authenticated identity enforce access. Never put the service-role key or provider credentials in a `VITE_` variable.

Feature flags default off unless the corresponding flow is implemented and configured:

```dotenv
VITE_ENABLE_PASSKEYS=false
VITE_ENABLE_AI_NARRATION=false
VITE_ENABLE_TRANSCRIPTION=false
VITE_ENABLE_SECURE_HANDOFF_LINKS=false
VITE_ENABLE_BROWSER_NOTIFICATIONS=false
```

For credential-free local use, set `VITE_DEMO_MODE=true` and leave Supabase values blank. The application must remain usable and clearly identify itself as a synthetic test build.

## Reset, migrations, and seed

Migrations in `supabase/migrations` are ordered and versioned. `supabase/seed.sql` contains relational synthetic fixtures only.

Reset the local database and apply every migration plus seed:

```sh
npx supabase db reset
```

Inspect services and recover the current local keys without writing them to tracked files:

```sh
npx supabase status
```

Useful local interfaces are printed by `supabase status`; typically Studio is on port `54323` and the local email viewer is on `54324`. Use the printed values rather than assuming ports if local configuration changes.

Create a new migration instead of editing one that has been applied or reviewed:

```sh
npx supabase migration new describe_change
```

Review the generated diff, policy/grant effects, comments, and delete behavior before committing. Never use a schema diff as a substitute for deliberate RLS and storage policy design.

## Demo authentication users

Relational `seed.sql` should not contain usable hosted passwords. Auth users require the Auth Admin API, so the repository's demo-user bootstrap command reads a local uncommitted server environment and creates only clearly synthetic accounts.

After `db reset`, create an ignored bootstrap environment and choose your own local passwords:

```sh
cp supabase/scripts/.env.example supabase/scripts/.env.local
```

Fill the local `SUPABASE_URL`, local service-role key from `npx supabase status`, and the five 14-or-more-character synthetic passwords (two therapists and three clients). The project shortcut loads that exact ignored file:

```sh
npm run seed:demo
```

The equivalent direct Deno implementation is available for Edge Function-oriented development:

```sh
deno run \
  --env-file=supabase/scripts/.env.local \
  --allow-env \
  --allow-net \
  supabase/scripts/bootstrap-demo-users.ts
```

The script hard-refuses any target except `localhost`, `127.0.0.1`, or `::1`; never logs passwords/service credentials; and updates only the fixed synthetic auth IDs created by `seed.sql`. The linked profiles, clients, and care-team assignments are relational seed data. The second therapist shares only the Iris fixture, and two Iris appointments are attributed to that therapist so cross-provider client aggregation can be tested. Use the passwords you supplied locally, then remove the ignored environment when it is no longer needed. Do not improvise an insecure public therapist signup.

## Team assignments and therapist directory

`therapist_client_assignments` is the RLS authorization boundary for client records. Therapists do not gain access merely by sharing a practice. A client booking an opted-in, online-bookable therapist creates the assignment and appointment atomically; therapist-created clients are assigned to their creator. Ordinary appointment scheduling never grants a teammate access. Cancellation does not automatically end a care relationship.

There is no owner/admin role yet. Do not add a UI that lets ordinary therapist accounts browse or mutate the assignment ledger. Until ownership/delegation governance is implemented, other assignment or revocation changes are controlled service-role operations with an external authorization decision and an audit event. Review migration backfill results before hosted rollout: only relationships evidenced by `clients.created_by` or existing appointments are preserved.

Public therapist discovery is opt-in. Set a unique lowercase `directory_slug`, an optional professional title, `directory_opt_in=true`, and optionally `accepting_online_bookings=true`. Each therapist receives a server-generated, immutable, practice-unique `public_portrait_resource_id`; a `public_portrait_path`, when present, must point to that therapist-owned same-practice raster namespace in `brand-assets-public` using `<practice_id>/<opaque_resource_id>/<opaque_filename>`. App-authenticated inserts cannot choose this resource ID. The opaque resource must never be an auth user ID. Only that therapist can mutate objects in the claimed portrait namespace. Upload and review the deliberately public asset separately, and never place a private/signed URL or a client image in this field.

The unauthenticated app may read only `public_therapist_directory`, which omits auth IDs, contacts, usernames, settings, and booking state. After client authentication, `client_therapist_directory` supplies the therapist user ID needed by `request_appointment`. Name plus age/date of birth must never call a client lookup or reveal a client portrait before authentication; it is not an authentication factor.

## Local Edge Functions

Protected function configuration belongs in ignored `supabase/functions/.env.local`:

```sh
cp supabase/functions/.env.example supabase/functions/.env.local
```

The file contains only server-side values:

```dotenv
APP_ORIGIN=http://localhost:5173
APP_BASE_URL=http://localhost:5173/
HANDOFF_TOKEN_PEPPER=<at-least-32-character high-entropy local test value>
RATE_LIMIT_PEPPER=<separate high-entropy local test value>
AI_PROVIDER=disabled
AI_PROVIDER_URL=
AI_API_KEY=
```

The local Supabase CLI injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; hosted Supabase injects the corresponding hosted values. Never copy them into Vite. Serve functions with:

```sh
npx supabase functions serve --env-file supabase/functions/.env.local
```

Functions that do not have a provider key must use their documented deterministic/manual fallback. AI narration is optional; manual notes keep transcription optional; authenticated therapist PDF download keeps secure handoff links optional.

`APP_ORIGIN` accepts a comma-separated list of exact browser origins during a controlled domain transition. It must never include a path or wildcard. `APP_BASE_URL` is the one complete public application URL used for secure links; on repository Pages it includes the base path, for example `https://<owner>.github.io/AURA/`. Its origin must appear exactly in `APP_ORIGIN`. Remove obsolete origins after verification.

## Redirect URLs

Supabase Auth must allow each exact application origin/path used by the login callback. With HashRouter, construct redirects from the current origin and Vite base, ending in `#/auth/callback`; do not hard-code an account name in application code.

The browser client must use the PKCE flow with URL session detection enabled. PKCE returns a short-lived authorization code in URL query parameters, leaving the hash fragment available to the router; the implicit flow also uses the fragment and is incompatible with this callback shape.

Typical development entries:

```text
http://localhost:5173/**
http://127.0.0.1:5173/**
```

Current repository Pages entries:

```text
https://<owner>.github.io/AURA/**
https://<owner>.github.io/AURA/#/auth/callback
```

For a custom domain, add its HTTPS origin and callback, then remove obsolete origins when the migration is complete:

```text
https://<custom-domain>/**
https://<custom-domain>/#/auth/callback
```

Configure local redirects in `supabase/config.toml` and hosted redirects in **Supabase Dashboard → Authentication → URL Configuration**. Use the Pages URL as Site URL until a custom domain is active. Test email links, magic links, OAuth if later enabled, and recovery flows on the actual deployed origin.

## Link a hosted project

Authenticate the CLI without placing an access token in the repository, then link by project reference:

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
```

Review pending changes:

```sh
npx supabase db diff --linked
npx supabase migration list
```

Apply committed migrations:

```sh
npx supabase db push
```

Do not run `db reset` against a hosted project. Establish backup/restore and retention procedures before using any non-synthetic data.

## Hosted Edge Function secrets and deployment

Create a temporary ignored environment file outside the tracked source tree or set secrets individually:

```sh
npx supabase secrets set --env-file <path-to-uncommitted-function-env>
```

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into hosted functions. Do not expose or redundantly add them to browser/build configuration. Project-managed protected values include:

- `AI_PROVIDER` and `AI_API_KEY`;
- `AI_PROVIDER_URL` for the protected provider-neutral narration gateway;
- `TRANSCRIPTION_PROVIDER` and `TRANSCRIPTION_API_KEY`;
- `HANDOFF_TOKEN_PEPPER`;
- `RATE_LIMIT_PEPPER` for keyed, non-reversible username/IP rate buckets;
- `APP_ORIGIN`;
- `APP_BASE_URL` for the full public application URL, including any Pages repository path;
- later messaging-provider credentials.

Deploy only functions present in the repository, for example:

```sh
npx supabase functions deploy narrate-insight
npx supabase functions deploy resolve-username
npx supabase functions deploy secure-handoff
npx supabase functions deploy admin-users
```

`resolve-username` and `secure-handoff` deliberately accept public/token-boundary requests and implement their own complete rate-limit or opaque-token authorization; `narrate-insight` and `admin-users` require authenticated protected flows. `admin-users` cannot create the first hosted therapist: create that initial trusted identity out of band, link its protected therapist profile, enroll MFA, and only then use the function with fresh authentication (AAL2 is required to invite another therapist). Secure-link issue/download requires active handoff consent and a PDF already uploaded to the private handoff path. Verify CORS allowlists, input limits, generic public errors, and privacy-safe logging in the hosted environment. A future transcription function is deployed the same way when implemented. Do not use `--no-verify-jwt` unless the function implements an intentionally public protocol with complete internal authorization.

## Hosted browser configuration

The GitHub Pages workflow reads public values from GitHub repository or environment **Variables**, not protected Edge Function secrets. For connected mode set:

| Variable                        | Value                                                       |
| ------------------------------- | ----------------------------------------------------------- |
| `VITE_APP_ENV`                  | `production` only after production review; otherwise `test` |
| `VITE_DEMO_MODE`                | `false` for connected mode                                  |
| `VITE_BASE_PATH`                | `/AURA/` for current repository Pages                       |
| `VITE_SUPABASE_URL`             | hosted project URL                                          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | hosted publishable key                                      |
| feature flags                   | `true` only for configured, tested capabilities             |

Because these values become public, GitHub Secrets do not make a `VITE_` value confidential. Never supply service-role or provider keys to the Pages build.

## Verification

Before describing connected mode as operational:

```sh
npx supabase db reset
npx supabase db lint
npx supabase test db
deno check supabase/functions/*/index.ts
deno test supabase/functions/tests/security_test.ts
npm run typecheck
npm test
npm run build
```

Also run the SQL authorization/storage suite described in [TESTING.md](./TESTING.md), exercise both permitted and denied operations with real JWT identities, and inspect the built assets for protected values. Confirm that:

- backend profile role overrides the entrance choice;
- Client A cannot access Client B;
- a therapist can access only actively assigned clients and loses access when an assignment ends;
- client-selected booking accepts only same-practice, opted-in therapists accepting online bookings and creates the care-team assignment atomically;
- public directory queries expose no therapist auth ID/contact/settings, and no public client identity/photo lookup exists;
- client-safe responses contain no private therapist fields;
- photo and handoff access follow current consent;
- all private buckets reject anonymous listing/download;
- revoked/expired handoff tokens fail with generic responses;
- deterministic fallbacks work with provider secrets absent.

When Docker is unavailable, `supabase db lint`, Deno checks, or running pgTAP against PostgreSQL with Auth/Storage compatibility stubs are useful static/syntax evidence, but they do not replace `npx supabase db reset` and `npx supabase test db` against the full local Supabase containers. Record the container checks as **not run** until a Docker-capable machine executes them.

## Troubleshooting

- **The application opens in demo mode:** inspect the non-secret parsed configuration message; both URL and publishable key are required for connected mode, and `VITE_DEMO_MODE` must be false.
- **A redirect returns to the wrong route:** verify Vite base casing, the `#/auth/callback` construction, Supabase Site URL, and redirect allowlist.
- **A request is denied:** do not disable RLS. Confirm the JWT identity, protected profile/client link, grants, policy predicates, row ownership, and required consent.
- **A function reports unavailable:** confirm it is deployed, its public feature flag is intentional, protected secrets exist server-side, `APP_ORIGIN` matches the browser origin, and `APP_BASE_URL` uses that origin plus the correct application path.
- **Local schema is stale:** stop local services only if necessary, then run `npx supabase db reset`; preserve any fixtures you need in versioned seed/migrations rather than relying on local database state.
