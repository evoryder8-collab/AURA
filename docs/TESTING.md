# Testing

## Quality policy

Tests protect domain determinism, authorization boundaries, complete workflows, accessible interaction, offline resilience, and deployment behavior. A check is not considered passed unless it was run against the current revision and its exact result was observed.

Required completion commands:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The complete release suite additionally includes end-to-end and accessibility runs:

```sh
npm run test:e2e
npm run test:a11y
```

Use `npm ci` from a clean checkout for CI/release evidence. `npm install` is appropriate only when intentionally changing dependencies and the lockfile.

## Scripts

| Command                 | Purpose                                                 |
| ----------------------- | ------------------------------------------------------- |
| `npm run dev`           | local Vite server                                       |
| `npm run lint`          | static lint rules                                       |
| `npm run format`        | write repository formatting with Prettier               |
| `npm run format:check`  | verify Prettier formatting without writing              |
| `npm run typecheck`     | strict TypeScript without emitting output               |
| `npm test`              | one-shot Vitest unit/component suite                    |
| `npm run test:watch`    | interactive Vitest watch mode                           |
| `npm run test:coverage` | Vitest coverage report                                  |
| `npm run build`         | strict production build                                 |
| `npm run preview`       | serve the built Vite output locally                     |
| `npm run test:e2e`      | Playwright critical synthetic flows                     |
| `npm run test:a11y`     | Playwright + axe accessibility flows                    |
| `npm run seed:demo`     | secure local synthetic auth/bootstrap where implemented |

If a script is unavailable in an intermediate revision, that phase is incomplete; do not substitute a different command in the delivery report without explaining it.

## Test layers

### Unit tests

Keep pure domain tests fast and table-driven. Required coverage includes:

- normalization of pain, stiffness, ROM, and function boundaries;
- available-weight re-normalization for the Recovery Index;
- weighted trend and comparable-method filtering;
- fewer than three comparable points → Building Baseline;
- improving, mixed, limited-change, maintenance, sustained-worsening, and review-consideration rules;
- exact threshold boundary values;
- contextual-event proximity without causal wording;
- missing streams, follow-ups, retrospective points, and incompatible ROM methods;
- confidence effects from point count, span, completeness, consistency, comparison, and missingness;
- structured evidence, included/excluded reasons, exact deltas, engine/rule versions, and explainability data;
- functional-goal rules and revision/history behavior;
- `max(actual - booked, 0)`, configurable bonus threshold, and therapist confirmation;
- no immediate quote repetition per client;
- consent and fresh-auth guards;
- date/time behavior across UTC, practice timezone, DST, and date-only values;
- offline queue IDs, ordering, idempotency, retries, ownership, and sign-out behavior.

Pattern tests should use explicit `prototype-v1` configuration and assert structured output, not snapshot only prose. Generated narration cannot be part of the classifier assertion.

### Component tests

React Testing Library tests interact by accessible role/name rather than implementation selectors. Cover:

- animated role entrance, reduced motion, and role-specific login presentation;
- protected role routing where backend profile overrides selected entrance;
- body map pointer and keyboard selection with region/side labels;
- flower picker values 1–10 plus zero/resolved action;
- multi-step intake validation, save/resume, goals, and consent choices;
- adaptive check-in confirm/edit/resolve/new-region behavior;
- fact/source/date display and distinct caution styling in Focus Map;
- Session Mode persisted timer, booked-duration gold state, dimmer, Wake Lock states, and offline status;
- next-day follow-up and optional goal score;
- insight draft/approve/reject and client visibility;
- handoff section selection with photos off by default;
- recipient/purpose/category/photo/delivery/expiry consent modal;
- loading, empty, error, and text-summary states for charts.

Use fake timers only at the test boundary. Session elapsed behavior must still be tested from a persisted `started_at` rather than increment-count implementation details.

### End-to-end synthetic flow

The acceptance journeys run in Playwright on a controlled clock (`page.clock`), against the real WebGL figure:

- `tests/e2e/story-pratana.spec.ts` — Mira books a 90-minute visit with Pratana, checks in, the session counts down from `90:00`, crosses zero into `+00:0x` extra care, survives a reload, finishes at 102 minutes, and 12 minutes are credited to Pratana exactly once; Mira's home then reads "Pratana gave you 12 extra minutes today, bringing her total to 47 minutes across your visits."
- `tests/e2e/story-wassana.spec.ts` — on day seven Mira logs left shoulder 7/10 with a note; Wassana's Today shows the dated update; on day eight arrival confirms the shoulder (kept as one chart point) and adds right calf 3/10; Session Mode shows both with correct sides, including after a face-up/face-down flip (marker positions are measured on screen).
- `tests/e2e/report.spec.ts` — the doctor report: private and report notes, client consent, PDF download.
- `tests/e2e/entrance.spec.ts` and `tests/e2e/responsive.spec.ts` — both role buttons visible at 320px, name/age reveal, credentials, and no horizontal scroll at 320, 390, tablet landscape and laptop widths.

The PDF itself is rendered to a file by `scripts/render-report-pdf` and every page is inspected as an image, including a grayscale pass; private-note text is asserted absent with `pdftotext`.

### Accessibility tests

`npm run test:a11y` uses Playwright with axe on at least:

- role selection and both login presentations;
- primary navigation in both roles;
- intake steps and validation errors;
- body map and flower picker;
- modal dialogs and consent review;
- Session Mode;
- graph content plus textual summaries.

Automated scans are necessary but incomplete. Manual review also verifies:

- logical Tab/Shift+Tab order and visible focus;
- Enter/Space behavior on custom SVG controls;
- dialog initial focus, containment, Escape behavior, and return focus;
- 200% zoom/reflow and phone/iPad portrait/landscape layouts;
- 44px minimum touch targets;
- screen-reader names and form error announcements;
- status meaning without color;
- reduced-motion behavior and no required animation;
- chart information available without pointer hover or vision;
- high-contrast/forced-color usability where supported.

### Database and storage security tests

Start and reset local Supabase before running the repository SQL test command or documented Supabase test harness:

```sh
npx supabase start
npx supabase db reset
npx supabase db lint
npx supabase test db
deno test supabase/functions/tests/security_test.ts
```

The committed pgTAP files under `supabase/tests` cover schema/RLS invariants and attack cases. When adding integration-level policy tests, create separate JWT-backed identities for a therapist, Client A, Client B, and anonymous access. Verify both intended success and required denial:

- Client A cannot select/update Client B;
- a client cannot select private therapist notes or create/update therapist assessments;
- a client cannot read or approve draft insights;
- client-visible approved narration remains readable by its owner;
- photo metadata/object access fails without photography consent;
- therapist photo creation fails without consent and succeeds with active consent;
- anonymous application-table reads and private-bucket listing fail;
- role/practice escalation fails;
- audit update/delete fails while controlled append succeeds;
- expired and revoked handoff tokens fail generically;
- a valid token exposes only one scoped handoff and no storage path;
- private buckets never return permanent public URLs.

The Deno security suite independently covers active, expired, revoked, consentless, and missing-path handoff states plus opaque-token randomness and deterministic HMAC hashing. Function integration still requires the local stack: a pure state-helper test cannot prove CORS, Auth, database, or Storage behavior by itself.

Run policy tests with real database roles/JWT claims. Tests executed as the database owner or service role cannot demonstrate RLS safety.

### Build and secret checks

Build with missing Supabase credentials and explicit demo mode:

```sh
VITE_APP_ENV=test \
VITE_DEMO_MODE=true \
VITE_BASE_PATH=/AURA/ \
npm run build
```

Then verify:

- `dist/index.html` uses `/AURA/` asset paths;
- the build opens at the repository subpath;
- a nested `#/...` route refreshes;
- the test-build indicator is visible;
- no source map or asset contains service-role keys, provider credentials, token peppers, usable passwords, or private fixture data;
- service-worker rules exclude authenticated APIs, photos, PDFs, voice, tokens, and signed URLs.

Do not paste real secrets into an automated scan command or its logs. Search for protected variable names and use safe test canaries when verifying that values cannot enter the build.

### PWA and offline tests

Test in a production build/preview because service worker behavior differs in development:

- installability and manifest scope under `/AURA/`;
- app-shell/offline route after one online visit;
- update-available prompt and controlled refresh;
- online/offline status;
- Session Mode refresh and elapsed time from persisted timestamp;
- queued mutation IDs/retries and safe reconciliation;
- no private media/API response is available from Cache Storage after access or sign-out;
- synthetic reset clears demo state predictably.

### PDF and handoff tests

Unit/component tests verify section allowlists, date ranges, consent gates, photo default-off behavior, disclaimer inclusion, and deterministic evidence. End-to-end tests verify preview and PDF generation/download.

PDF layout needs visual review at representative content lengths. Check branded cover, page breaks, graph/text alternatives, body-map timeline, no clipped text, recipient/consent details, confidence, exact observation, therapist note, and permanent scope disclaimer. Never use a golden snapshot to approve sensitive field inclusion; assert the allowlisted data model directly.

## Synthetic fixtures

Fixtures (`src/data/demo/fixtures.ts`) are generated relative to the moment the demo first loads so the story always reads correctly:

- Mira Ellison: six visits over six weeks with both Pratana and Wassana, left shoulder steady at 5–6/10, at-home entries between visits, one visit that only confirmed an earlier home entry, a missed next-day follow-up (an honest gap of more than a week), goniometer neck rotation and shoulder abduction, a functional goal in her words, 35 Bonus Care minutes from Pratana and 10 from Wassana, two private notes and one note written for a doctor; a visit with Wassana tomorrow at 10:00.
- Noa Lindqvist: lower back, an at-home update yesterday, a 90-minute visit with Pratana at the next half hour.
- Sage Okafor: right hip with Wassana, a visit later in the week.

Do not use names, emails, phone numbers, dates of birth, photos, or narratives copied from real people.

## CI behavior

CI installs from the lockfile with `npm ci`, runs lint/typecheck/tests/build, installs the Playwright Chromium runtime, and runs smoke flows. Browser installation is intentionally after the lower-cost checks so a basic failure exits early.

The Pages workflow is downstream of successful CI on `main`. Deployment success is not test success: report validation, deployment, and published-site navigation as separate evidence.

## Failure triage

1. Reproduce the exact failing command locally with the same Node version and public environment.
2. Fix the cause; do not weaken a security/accessibility assertion or broadly increase a timeout without evidence.
3. Run the smallest affected test while iterating.
4. Run all required completion checks before handoff.
5. Record any environment-only skip and why it is safe; a skipped critical flow remains incomplete.

Flaky tests are defects. Prefer deterministic clocks/fixtures, accessible locators, explicit state assertions, and Playwright auto-waiting over sleeps.

## Delivery evidence template

Record the current commit and exact observed outcomes:

```text
Commit: <sha>
Node/npm: <versions>
npm ci: <pass/fail, duration>
npm run lint: <pass/fail, count>
npm run typecheck: <pass/fail>
npm test: <pass/fail, files/tests/duration>
npm run build: <pass/fail, duration>
npm run test:e2e: <pass/fail, projects/tests/duration>
npm run test:a11y: <pass/fail, pages/violations/duration>
Supabase security/storage tests: <pass/fail, assertions>
Pages deploy: <run URL and conclusion>
Published navigation: <URL and flows manually opened>
```

Leave a field as not run when it was not run. Never convert absence of a failure into a pass.
