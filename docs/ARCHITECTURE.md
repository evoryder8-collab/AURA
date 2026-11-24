# Architecture

## Purpose and boundaries

AURA is one React application for one dedicated therapist or practice installation. It presents role-controlled therapist and client experiences, but it is not a shared multi-tenant platform and the entrance role choice is never an authorization decision.

The application has two runtime modes:

- **Synthetic demo mode** uses unmistakably fictional fixtures and local persistence. It works without credentials and never implies that data is synchronized.
- **Supabase mode** uses authenticated repository implementations backed by a dedicated Supabase project, database policies, private storage, and protected Edge Functions.

The same domain rules sit above either data implementation. Core client/appointment access and authentication have concrete connected adapters; the published feature screens intentionally remain on the synthetic IndexedDB implementation until each clinical write workflow receives an end-to-end connected adapter and security review. This keeps the credential-free GitHub Pages build useful without presenting local state as synchronized.

## Runtime topology

```mermaid
flowchart LR
    Browser["React application\nHashRouter + Query + forms"]
    Domain["Pure domain layer\nrules + pattern engine"]
    Ports["Repository interfaces"]
    Demo["Synthetic repositories\nIndexedDB/local fixtures"]
    Supa["Supabase repositories\nRLS-protected API"]
    Edge["Protected Edge Functions\nprovider adapters"]
    DB[("Postgres\nRLS + audit")]
    Storage["Private Storage\nsigned access"]
    External["Optional providers\nserver-side secrets only"]

    Browser --> Domain
    Browser --> Ports
    Ports --> Demo
    Ports --> Supa
    Supa --> DB
    Supa --> Storage
    Browser --> Edge
    Edge --> DB
    Edge --> Storage
    Edge --> External
```

GitHub Pages serves static assets only. HashRouter keeps application paths after `#`, so a route refresh does not require a server rewrite. Supabase remains the authority for identity, backend roles, record ownership, consent, and connected data access.

## Source layout

The intended feature-oriented layout is:

```text
src/
  app/
    providers/       query, auth, mode, error, and accessibility providers
    router/          route definitions and backend-role guards
    layouts/         public, therapist, client, and session shells
  components/
    design-system/   tokens and reusable surface/form/navigation primitives
    feedback/        status, empty, loading, error, and offline states
    navigation/      role-specific primary navigation
  features/
    auth/ entrance/ today/ clients/ intake/ body-map/
    functional-goals/ appointments/ session/ assessments/
    follow-up/ progress/ insights/ photos/ handoffs/
    consent/ settings/
  domain/
    engine/          pure deterministic pattern calculations
    rules/           caution, consent, bonus-time, and workflow rules
    types/           domain values independent from transport types
    validation/      shared schemas and structured constraints
  data/
    demo/            synthetic fixtures and local repository adapters
    repositories/    interfaces, mapping, and mode composition
    supabase/        client and connected repository implementations
  lib/
    dates/ offline/ security/ formatting/
  styles/            tokens, foundations, motion, and print/export styles
supabase/
  migrations/        ordered, versioned database/storage/RLS changes
  functions/         protected provider-neutral server operations
  seed.sql            synthetic relational fixtures
  tests/              SQL authorization and storage tests
```

Feature folders may contain their own views, components, schemas, hooks, and tests. Reusable visual primitives belong in `components`; cross-feature business rules belong in `domain`; data transport belongs in `data`.

## Dependency rules

Dependencies point inward:

1. UI features may depend on components, domain APIs, repository interfaces, and shared libraries.
2. Repository adapters may depend on domain types and transport clients.
3. Domain code may depend only on other domain code and small general-purpose utilities.
4. Domain code must not import React, browser APIs, Supabase, query clients, or UI text generators.
5. Components and route pages must not issue ad hoc Supabase queries.

This separation matters most for the pattern engine. It receives structured observations and a versioned configuration and returns structured evidence; narration is a separate downstream concern.

## Application composition

The root providers currently compose:

1. the parsed public environment and runtime mode;
2. authentication/session state and protected backend role;
3. TanStack Query and its retry policy;
4. owner-scoped online/offline reconciliation;
5. HashRouter and protected route boundaries.

The repository factory selects demo or Supabase implementations for core client and appointment access. It is intentionally not used to make the remaining demo feature screens appear connected; each additional clinical mutation needs its own contract, invalidation, and authorization review before a production composition can enable it.

Role selection at `/` stores only a visual preference and opens a role-specific login presentation. After authentication, the application loads the protected profile and routes by its backend role. A selected therapist card cannot unlock therapist routes.

## Routes and navigation

Public routes:

- `/`, `/login/therapist`, `/login/client`, `/auth/callback`
- `/handoff/:token`, `/offline`, `/privacy-placeholder`

Therapist routes (shell: side rail ≥1000px, bottom bar on phones):

- `/therapist/today` — next appointment with the client's latest update and a body preview
- `/therapist/clients`, `/therapist/clients/:clientId` (overview, history across therapists, progress, dated notes, photos)
- `/therapist/clients/:clientId/report[/:reportId]` — doctor report builder
- `/therapist/session/:appointmentId/finish`, `/therapist/calendar`, `/therapist/settings`

Full-screen therapist routes: `/therapist/arrival/:appointmentId` (hand the device to the client) and `/therapist/session/:appointmentId` (Session Mode). Session Mode and its finish screen share one access rule (`canRunSession`): only the booking's therapist, who is credited with the visit's Bonus Care.

Client routes (shell: bottom bar with a centre **Log how I feel** button):

- `/client/home`, `/client/progress`, `/client/visits`, `/client/visits/book`, `/client/me`, `/client/reports/:reportId`, `/client/settings`

Full-screen client routes: `/client/log`, `/client/arrival/:appointmentId`, `/client/follow-up/:appointmentId`.

Connected mode (Supabase) shows only the screens with protected adapters: Today, Clients, Settings for therapists and Visits, Settings for clients.

## Care domain (`src/domain/care`)

Pure TypeScript, no React or Supabase:

- `regions.ts` — body regions, anatomical sides (`left` is always the client's own left), surfaces (front, back, edge) and area keys such as `shoulder:left`. "Both" is stored as one entry per side.
- `observations.ts` — dated observations (`observedAt` vs `recordedAt`, source: home, arrival, session, next-day follow-up), per-area series, what changed since the previous visit, the areas to review at arrival, and the pain points Session Mode shows. An arrival "Still accurate" is an `ArrivalConfirmation` pointing at the original observation, so it can never become a second chart point.
- `session.ts` — the session clock derived only from timestamps (`90:00` down, then `+00:01` extra care), the finish summary counted in the clock minutes the finish screen shows (10:00–11:42 on a 90-minute booking → 102 actual, 12 extra), the idempotent Bonus Care ledger (one credit per visit, id `bonus-<appointmentId>`, never more than the time given past the booking and at most 240, like `session_records_bonus_check`), and table orientation helpers that keep anatomical sides correct through rotation and flips.
- `report.ts` — what a doctor report may contain. It takes the report's chosen wording, never the notes collection, so private notes cannot leak; export requires consent matching recipient, purpose and photo inclusion. Sending a report to the client freezes its content (`src/features/reports/inputs.ts`), so the review, the consent and the PDF all read what the client was sent; any edit returns it to a draft that needs consent again. Photographs appear only while the client's photography consent is on.
- `recovery.ts` — one comparable row per completed visit for the unchanged `prototype-v1` pattern engine.

`src/data/demo/selectors.ts` composes these for screens so every figure on a screen comes from one shared calculation.

## The body (`src/features/body`)

A Blender-refined, openly licensed anatomical model (`public/models/aura-body.glb`, credits in `public/models/CREDITS.md`, rebuild scripts in `scripts/body/`) is rendered with three.js through an orthographic camera, so the live figure and the print renders (`public/body/front.png`, `back.png`, `views.json`) share one projection. Ray-cast surface anchors (`anchors.json`) place markers; labels are HTML for legibility and screen readers. Without WebGL the stage falls back to the print renders with identical anchor projection.

## Data access

Repository interfaces cover core client and appointment records with explicit allowlisted fields and safe mutations. Implementations are selected by the repository factory:

- demo repositories use deterministic fixtures and IndexedDB-backed state;
- Supabase repositories use the publishable client, current authenticated session, and narrow request/cancel database functions for client scheduling.

The synthetic screens use the richer demo store (`src/data/demo/store.ts`) for observations, arrival, sessions, Bonus Care, notes, reports and photos. Those capabilities must gain dedicated repository contracts, migrations, grants and RLS before connected mode is approved; the application never labels local mutations as synchronized.

The browser never receives the service-role key. RLS remains in force even if a client route, query key, or browser call is manipulated. Private fields are separated at the schema/view layer instead of being fetched and hidden with CSS.

## Domain engine

The `prototype-v1` engine is pure, deterministic, explainable, and explicitly labelled as not clinically validated. Its processing flow is:

```mermaid
flowchart LR
    Inputs["Comparable structured observations"] --> Normalize["Normalize favourable direction"]
    Normalize --> Trends["Weighted trends + Recovery Index"]
    Trends --> Confidence["Confidence and exclusions"]
    Confidence --> Classify["Versioned deterministic rules"]
    Classify --> Evidence["Pattern, deltas, rule, included/excluded points"]
    Evidence --> Templates["Deterministic narration template"]
    Evidence -. optional .-> AI["Protected narration adapter"]
    AI --> Draft["Validated draft awaiting therapist approval"]
    Templates --> Draft
```

Generative output cannot change the pattern, evidence, numbers, or confidence. It receives only the approved pattern identifier, exact metrics, allowed vocabulary, missing-data statement, and audience. A deterministic template keeps the workflow usable without a provider.

## State, offline, and PWA boundaries

- TanStack Query owns remote server state and invalidation.
- React Hook Form and Zod own editable form state and validation.
- Component state owns transient interaction state.
- A lightweight cross-screen store is appropriate only for local UI state that genuinely spans routes.
- IndexedDB may store synthetic demo state, minimal pending Session Mode state, explicit offline mutations, and non-sensitive preferences.

The service worker caches the application shell and offline route. It must not broadly cache authenticated API responses, access tokens, private photographs, handoff PDFs, or voice notes. Offline mutations carry a unique ID, creation time, retry count, and visible sync state; connected writes should be idempotent where practical.

Session elapsed time derives from a persisted UTC `started_at`, not an incrementing in-memory counter. Refreshes and temporary offline periods therefore do not reset the timer.

## Integrations

Provider-specific services sit behind adapters:

- AI narration → protected `narrate-insight` Edge Function plus deterministic template fallback;
- username sign-in → rate-limited `resolve-username` function that completes Auth without exposing email;
- client/therapist invitations → fresh-auth `admin-users` function, with AAL2 for therapist invitations;
- transcription → protected Edge Function plus fully usable manual note entry;
- notifications → in-app outbox plus later email/push/SMS adapters;
- secure handoff → protected token operations plus authenticated therapist PDF download;
- passkeys and browser notifications → explicit feature flags with accurate unavailable states.

No browser request goes directly to a provider that requires a secret.

## Time and localization

Database timestamps are UTC. Appointment, due-state, and reporting logic uses the practice timezone from configuration; presentation uses the configured locale. Date-only concepts such as date of birth remain date-only and must not be shifted by timezone conversion.

## Accessibility and responsive behavior

Accessibility is architectural, not a late visual pass. Interactive primitives provide keyboard operation, visible focus, screen-reader names, error announcements, minimum 44px touch targets, and reduced-motion alternatives. SVG body regions are focusable labelled controls. Charts have adjacent textual summaries and export-safe fallbacks. Semantic status uses text/icon/pattern as well as color.

Layouts are designed for phone, iPad portrait, iPad landscape, and desktop. Session Mode prioritizes touch ergonomics and privacy-conscious content in a dark treatment-room context; desk experiences use a light editorial context.

## Deployment

CI validates a clean install, lint, strict type checking, unit tests, production build, and Playwright smoke flow. A successful validation run on `main` triggers a separate Pages workflow that rebuilds with the public deployment environment, uploads `dist`, and deploys it using GitHub's official Pages actions. See [GITHUB_PAGES.md](./GITHUB_PAGES.md).

## Architectural decisions that require explicit review

Create a focused design note or update this document before changing any of these:

- authorizing from client-controlled metadata or entrance state;
- introducing a direct page-to-Supabase dependency;
- changing pattern rules, thresholds, or versioning;
- exposing a table, view, storage bucket, or function anonymously;
- adding cached authenticated/private content;
- sending health-related data to a new external provider;
- weakening fresh-authentication or consent gates;
- changing single-practice scope or adding tenant administration.
