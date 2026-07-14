# AURA

AURA is a single-practice treatment-workflow test application with therapist and client experiences inside one React application. It covers structured intake, body/goal tracking, appointments, Session Mode, follow-up, deterministic progress patterns, consent-aware visual progress, and therapist-reviewed professional handoff preparation.

> **Synthetic-data test build:** this repository is not approved for real client or health data. Outside an explicitly approved production configuration, the interface displays `TEST BUILD — SYNTHETIC DATA ONLY` and uses clearly fictional records.

Published demo: [https://evoryder8-collab.github.io/AURA/](https://evoryder8-collab.github.io/AURA/)

This is an implementation repository, not a pricing, marketing, billing, investor, legal-contract, shared multi-tenant, or separate-frontend project.

## Core principles

- The role entrance is presentation; protected backend profile data authorizes therapist/client routes.
- Clients can access only their own records. Therapist-private observations are separate from client-visible information.
- The progress pattern engine is pure, deterministic, versioned, explainable, and unit-tested. Generative narration can never determine a pattern.
- Database grants, Row Level Security, private-storage policies, explicit consent, and fresh authentication protect connected data.
- Demo mode works without Supabase and persists synthetic state locally without claiming synchronization.
- Every workflow is designed for keyboard, touch, reduced motion, responsive layouts, and non-color status cues.
- External providers are optional and sit behind protected adapters with deterministic or manual fallbacks.

Repository-wide rules are in [AGENTS.md](./AGENTS.md).

## Stack

- React 19, Vite 8, and strict TypeScript
- React Router with GitHub-Pages-safe HashRouter
- TanStack Query for server state
- React Hook Form and Zod for structured forms
- Supabase Auth, Postgres, Row Level Security, Storage, Edge Functions, CLI migrations, and synthetic seed data
- IndexedDB through `idb` for allowed demo/offline state
- Vite PWA plugin for the installable application shell
- Bespoke accessible SVG journey charts with textual progress summaries
- Radix primitives and a small custom CSS-variable design system
- date-fns, React PDF, and QR rendering
- Vitest, React Testing Library, Playwright, and axe
- Oxlint and Prettier

Versions are reproducible through `package-lock.json`. Node requirements are declared in `.nvmrc` and `package.json`.

## Quick start: synthetic demo

Prerequisites: Node 22 and npm 10 or later.

```sh
git clone <repository-url>
cd AURA
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

The example environment already selects explicit demo mode. Open the local URL printed by Vite, choose either role, and use only the labelled fictional records. No Supabase project or provider key is required.

To reset local demo state, use the in-application reset action. `npm run seed:demo` is for local Supabase auth/relational bootstrap, not browser-only demo fixtures.

### Adding transparent demo portraits

The identity reveal, secure credential card, signed-in therapist identity, appointment views, care-team strip, and booking cards support optimized transparent PNG/WebP portraits and fall back to polished monograms when no image is configured. Put synthetic/demo-only images under `public/portraits/`, then add the base-relative public path to the matching therapist or client in `src/data/demo/fixtures.ts`, for example:

```ts
portraitUrl: 'portraits/demo-therapist.webp',
portraitScale: 1.4,
```

Use a tightly cropped transparent portrait with comfortable space above the head and around the shoulders; roughly `1200 × 1500` pixels works well. Tune `portraitScale` per source image rather than assuming every transparent canvas has the same crop. Paths with spaces must be percent encoded. Do not commit a real client photograph or identifying filename. Connected client portraits remain protected and are never looked up from the pre-auth name-and-age presentation step.

## Environment variables

Every `VITE_` value is public at build time. Never put a service-role key, AI/transcription key, handoff pepper, provider credential, password, or deploy token in a Vite variable.

| Variable                            | Purpose                                                                 | Safe test default |
| ----------------------------------- | ----------------------------------------------------------------------- | ----------------- |
| `VITE_APP_ENV`                      | `development`, `test`, or explicitly approved `production` presentation | `development`     |
| `VITE_DEMO_MODE`                    | use synthetic local repositories                                        | `true`            |
| `VITE_BASE_PATH`                    | Vite/PWA deployment base                                                | `/` locally       |
| `VITE_SUPABASE_URL`                 | public connected project URL                                            | empty             |
| `VITE_SUPABASE_PUBLISHABLE_KEY`     | public key constrained by RLS/grants                                    | empty             |
| `VITE_ENABLE_PASSKEYS`              | expose configured passkey flow                                          | `false`           |
| `VITE_ENABLE_AI_NARRATION`          | call protected narration adapter                                        | `false`           |
| `VITE_ENABLE_TRANSCRIPTION`         | call protected transcription adapter                                    | `false`           |
| `VITE_ENABLE_SECURE_HANDOFF_LINKS`  | expose deployed token workflow                                          | `false`           |
| `VITE_ENABLE_BROWSER_NOTIFICATIONS` | expose configured browser notifications                                 | `false`           |

The typed parser distinguishes demo and connected modes, reports safe setup errors, never logs values, and falls back to a usable synthetic interface when credentials are absent.

Protected Supabase Edge Function configuration may include `AI_PROVIDER`, `AI_PROVIDER_URL`, `AI_API_KEY`, `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_API_KEY`, `HANDOFF_TOKEN_PEPPER`, `RATE_LIMIT_PEPPER`, `APP_ORIGIN`, `APP_BASE_URL`, and future messaging credentials. Supabase injects its URL, anon key, and service-role key into functions; none may enter Vite. Set project-managed server values only in ignored `supabase/functions/.env.local` or with `supabase secrets`; see [Supabase setup](./docs/SUPABASE_SETUP.md).

## Common commands

```sh
npm run dev          # Vite development server
npm run build        # strict TypeScript + production Vite build
npm run preview      # serve dist locally
npm run lint         # Oxlint
npm run format       # write Prettier formatting
npm run format:check # verify formatting without writes
npm run typecheck    # strict TypeScript without emit
npm test             # one-shot unit/component suite
npm run test:watch   # Vitest watch mode
npm run test:coverage # Vitest coverage report
npm run test:e2e     # Playwright critical flows
npm run test:a11y    # Playwright + axe flows
npm run seed:demo    # local, protected Supabase demo bootstrap
```

Before describing work as complete, run and observe at minimum:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

See [Testing](./docs/TESTING.md) for browser installation, SQL/storage authorization tests, accessibility review, PWA checks, and the exact delivery-evidence format.

## Production build

Build a credential-free repository Pages artifact locally:

```sh
VITE_APP_ENV=test \
VITE_DEMO_MODE=true \
VITE_BASE_PATH=/AURA/ \
npm run build
```

Preview it at the same base:

```sh
npm run preview
```

Vite writes the static application to `dist/`. HashRouter keeps protected client routes after `#`, so Pages does not need rewrite rules.

## Supabase local setup

Docker is required for the local stack.

```sh
npx supabase start
npx supabase db reset
npx supabase test db
```

`db reset` applies ordered files under `supabase/migrations` and then `supabase/seed.sql`. Use only synthetic seed records. Obtain the local URL and publishable/anon key with `npx supabase status`, place only those public values in ignored `.env.local`, and set `VITE_DEMO_MODE=false`.

Auth users cannot be safely represented as usable passwords in SQL seed files. Copy `supabase/scripts/.env.example` to ignored `supabase/scripts/.env.local`, supply only the local stack values and your own 14-or-more-character synthetic passwords, then run `npm run seed:demo`. The bootstrap hard-refuses non-local targets, never prints credentials, and updates only the fixed synthetic users linked by the relational seed. Never commit its credential file or enable public therapist signup.

Apply a hosted schema only after reviewing pending migrations, grants, policies, constraints, and delete behavior:

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push
```

Deploy only implemented Edge Functions, for example:

```sh
npx supabase secrets set --env-file <path-to-uncommitted-function-env>
npx supabase functions deploy narrate-insight
npx supabase functions deploy resolve-username
npx supabase functions deploy secure-handoff
npx supabase functions deploy admin-users
```

Provider-free deterministic/manual fallbacks remain usable when functions or provider keys are absent. Full local/hosted instructions, protected secret handling, demo-user bootstrap, and verification live in [Supabase setup](./docs/SUPABASE_SETUP.md).

## Supabase authentication redirects

HashRouter callbacks end in `#/auth/callback`. Allow local origins and the deployed site in **Supabase Dashboard → Authentication → URL Configuration**:

The browser auth client uses PKCE so Supabase can return the short-lived code without competing with the HashRouter fragment. Keep PKCE and URL session detection enabled when changing auth configuration.

```text
http://localhost:5173/**
http://127.0.0.1:5173/**
https://<owner>.github.io/AURA/**
https://<owner>.github.io/AURA/#/auth/callback
```

For a future custom domain, add `https://<custom-domain>/**` and `https://<custom-domain>/#/auth/callback`, update the Site URL, and remove obsolete entries only after testing the transition.

## GitHub Pages

CI runs clean install, lint, type checking, unit/component tests, production build, and Playwright Chromium smoke tests. A successful CI run on `main` triggers the official Pages artifact/deployment workflow.

The actual repository name is uppercase `AURA`, so the default is case-sensitive:

```text
URL:  https://evoryder8-collab.github.io/AURA/
Base: VITE_BASE_PATH=/AURA/
```

The brief's `/Aura/` form is an example and is not the correct path for this repository.

This repository's Pages source is configured as **GitHub Actions**. Do not change it to a branch folder.

For a custom domain, configure/verify it in repository Pages settings, set `VITE_BASE_PATH=/`, update Supabase redirects and the Edge Function `APP_ORIGIN` plus `APP_BASE_URL`, redeploy, and test auth/assets/PWA scope. A `CNAME` file alone does not configure the domain.

See [GitHub Pages](./docs/GITHUB_PAGES.md) for public build variables, first deploy, custom domains, troubleshooting, and rollback.

## Repository architecture

```text
src/
  app/          providers, router, layouts
  components/   custom design system, feedback, navigation
  features/     role and treatment workflow verticals
  domain/       deterministic engine, rules, types, validation
  data/         repository contracts plus demo/Supabase adapters
  lib/          dates, offline, security, formatting
  styles/       semantic tokens and responsive foundations
supabase/
  migrations/   schema, grants, RLS, storage, functions
  functions/    protected server adapters
  tests/        SQL authorization/storage tests
  seed.sql       relational synthetic fixtures
docs/           engineering and operations references
```

The connected auth boundary and core client/appointment data access use explicit adapters; domain code does not import React or Supabase, and view components do not scatter raw Supabase queries. Connected therapist Today/Clients views and client appointment selection now consume those protected adapters, while the published synthetic experience continues to use the IndexedDB-backed demo store. Connected navigation deliberately hides clinical screens that have not yet been promoted. Before enabling a non-synthetic deployment, each remaining clinical workflow must receive a connected adapter and independent security review rather than silently writing local state. See [Architecture](./docs/ARCHITECTURE.md) and [Data model](./docs/DATA_MODEL.md).

## Feature flags and fallback behavior

Flags are false by default and must not reveal non-functional controls.

| Capability            | When disabled/unavailable                                                        |
| --------------------- | -------------------------------------------------------------------------------- |
| Passkeys              | email/password remains available; therapist TOTP follows configured Auth support |
| AI narration          | deterministic therapist/client templates preserve the complete insight workflow  |
| Transcription         | manual structured/text note entry remains fully usable                           |
| Secure handoff links  | authenticated therapist PDF preview/download remains available                   |
| Browser notifications | in-application due state/outbox remains available                                |

The application does not require external SMS, email, AI, transcription, or passkey providers to exercise the synthetic treatment workflow.

## Security summary

- RLS and deliberate grants apply to every exposed application table.
- Connected roles come from protected `profiles`, not entrance state or user-editable metadata.
- Therapist-private notes and draft insights are absent from client-safe data surfaces.
- Private objects use non-guessable paths and authenticated/short-lived access; health details and names are excluded from filenames.
- Photography and handoff workflows check active consent; sensitive views/actions require fresh authentication.
- Handoff tokens are opaque, expiring, revocable, and stored only as hashes.
- Audit records contain allowlisted IDs/metadata and are append-only for application users.
- Service workers never cache tokens, private photos, PDFs, voice notes, or unrestricted authenticated API responses.

Read [Security](./docs/SECURITY.md) before changing auth, RLS, storage, consent, narration, offline, or handoff behavior.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Data model](./docs/DATA_MODEL.md)
- [Security and privacy](./docs/SECURITY.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [Supabase setup](./docs/SUPABASE_SETUP.md)
- [GitHub Pages](./docs/GITHUB_PAGES.md)
- [Testing](./docs/TESTING.md)

## Known limitations

- Prototype pattern thresholds are labelled **not clinically validated** and require professional judgment.
- This test build is not a jurisdiction-specific consent, guardian, retention, deletion, medical-record, or regulatory solution.
- AI/transcription/messaging/passkey/secure-link behavior depends on protected provider or Edge Function configuration; deterministic/manual/in-app fallbacks cover the core workflow.
- The first hosted therapist identity requires a trusted out-of-band bootstrap and MFA enrollment; `admin-users` cannot bootstrap its own administrator.
- A secure handoff link requires active handoff consent and a private PDF already generated/uploaded by the therapist workflow.
- Browser Wake Lock, camera, notifications, MediaRecorder, installability, and PDF download behavior vary by browser/device and require feature detection.
- Photo alignment assists consistency but cannot guarantee identical posture, angle, lighting, or distance.
- GitHub Pages hosts only public static assets. It cannot protect server secrets or replace Supabase authorization.
- Delivery status is separate from code presence: do not claim checks, hosted migrations/functions, Pages deployment, or published navigation succeeded until exact evidence is observed.

## Production-readiness warning

Do not remove the synthetic indicator, set `VITE_APP_ENV=production`, or introduce real client data merely because the application builds. Production requires, at minimum, independent security/privacy review, local and hosted RLS/storage test evidence, MFA/fresh-auth verification, provider and data-processing review, backup/restore, retention/deletion and incident-response procedures, monitoring, accessibility review, content/clinical-language review, deployment hardening, and explicit owner approval.

The next engineering priority is always the highest unchecked acceptance gate in [the implementation plan](./docs/IMPLEMENTATION_PLAN.md), with authorization and data-isolation blockers taking precedence over feature expansion.
