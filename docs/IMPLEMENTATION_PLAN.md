# AURA implementation plan

This is a living, evidence-based checklist. A checked item means the repository contains the implementation and it has been verified at the level stated; an unchecked item must not be represented as complete. External deployment and credentials are tracked separately from code readiness.

## Phase 0 — foundation

- [x] React, Vite, strict TypeScript, npm lockfile, Node version, editor settings, and ignore rules
- [x] Feature-oriented source structure and shared custom design-system primitives
- [x] HashRouter with public, therapist, client, callback, handoff, offline, and technical privacy routes
- [x] Typed environment parser with explicit demo/connected modes and safe setup errors
- [x] TanStack Query, React Hook Form, Zod, IndexedDB wrapper, PWA shell, chart, PDF, and QR foundations
- [x] Engineering contract in `AGENTS.md`
- [x] Architecture, data model, security, Supabase, Pages, testing, and operational documentation

Exit gate: a credential-free production build opens in synthetic demo mode and the required validation scripts exist.

## Phase 1 — synthetic application shell

- [x] Premium animated role entrance with reduced-motion behavior and remembered visual preference
- [x] Explicit persistent `TEST BUILD — SYNTHETIC DATA ONLY` indicator outside production
- [x] Responsive therapist and client layouts with accessible navigation
- [x] Synthetic repository with at least three labelled fictional client records and reset action
- [x] Therapist Today, Clients, Client dashboard, Session, Calendar, and Settings routes
- [x] Client Home, Check-in, Progress, History, Appointments, Consents, and Settings routes
- [x] Demo state persistence is local and never presented as synchronized

Exit gate: both demo roles can navigate every primary route and every visible control works or is clearly labelled unavailable.

## Phase 2 — treatment workflow

- [x] Multi-step, save-and-resume first-visit intake with structural validation
- [x] Shared accessible SVG body map and 0–10 flower pain picker
- [x] One-to-three functional goals preserving the client's own wording
- [x] Adaptive returning check-in within the target tap budget
- [x] Fact-based caution rules and visually distinct Focus Map priorities
- [x] Calendar, appointment requests, pending intake, and all three creation paths
- [x] Dark Session Mode with persisted timestamp timer, offline state, Wake Lock, dimmer, and wrap-up
- [x] Finished transition, quote rotation, intervention capture, manual-note fallback, and rebooking
- [x] Configurable, therapist-confirmed Bonus Care Minutes
- [x] Next-day follow-up and notification-provider/outbox abstraction

Exit gate: the synthetic end-to-end flow runs from appointment creation through next-day follow-up.

## Phase 3 — progress and explainability

- [x] Accessible pain, stiffness, ROM, function, response, Recovery Index, and appointment-ribbon views
- [x] Pure `prototype-v1` deterministic pattern engine with evidence, exclusions, versions, and explanations
- [x] Pattern unit coverage for missing, mixed, improving, flat, worsening, method mismatch, boundaries, and confidence
- [x] Therapist approval workflow separating draft and client-visible insight text
- [x] Provider-neutral AI narration adapter, strict output validation, and deterministic template fallback
- [x] Worsening-record Review Progress and Prepare Professional Handoff states

Exit gate: every visible pattern is reproducible from structured evidence and no generated prose determines it.

## Phase 4 — Supabase and security

- [x] Versioned schema migrations for enums, core tables, constraints, indexes, comments, timestamps, and audit automation
- [x] Backend-derived roles and reusable authorization helper functions with pinned search paths
- [x] RLS and deliberate grants on every exposed application table
- [x] Client-safe views and split tables that exclude therapist-private columns
- [x] Consent-aware private storage buckets and policies
- [x] Email login, invitation flow, therapist MFA, fresh-auth challenge, and feature-gated passkey presentation
- [x] Rate-limited username resolver with generic errors; email login remains available without it
- [x] Local-only development auth bootstrap with no committed usable passwords
- [x] Append-only, privacy-safe automatic and function-authored audit events
- [x] SQL authorization and storage tests for cross-client, private-note, consent, escalation, anonymous, and audit boundaries

Exit gate: local Supabase reset and seed succeed, security tests demonstrate both allowed and denied access, and no service key reaches browser assets.

## Phase 5 — photos and professional handoff

- [ ] Consent- and fresh-auth-gated camera/upload workflow with alignment overlays and private storage
- [x] Therapist-reviewed section selection, context edit, and client consent workflow
- [x] Editorial branded PDF with graphs, evidence, confidence, scope disclaimer, and optional photos off by default
- [ ] Private PDF upload and authenticated therapist download
- [ ] Feature-gated opaque handoff token with hash-only storage, expiry, revocation, generic errors, access audit, and QR
- [x] Recipient response tied to the handoff without exposing a storage path

Exit gate: the complete synthetic handoff flow produces a reviewable PDF; token tests cover valid, revoked, and expired links.

## Phase 6 — resilience and quality

- [x] Installable PWA shell, offline page, online state, update prompt, and safe caching exclusions
- [x] Idempotent IndexedDB mutation queue with IDs, timestamps, retries, ownership isolation, and sign-out cleanup
- [x] Visible offline mutation sync state and connected reconciliation integration
- [x] Unit, component, security, accessibility, and end-to-end suites described in `docs/TESTING.md`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`
- [x] `npm run test:a11y`
- [x] Inspect the final build for service-role keys and other protected values

Exit gate: all required checks pass from a clean install. Exact results belong in the delivery report; do not infer them from local development behavior.

## Phase 7 — delivery

- [x] CI workflow covers clean install, lint, type checking, unit tests, build, and Playwright smoke tests
- [x] Pages workflow uses the official artifact/deployment flow after successful validation on `main`
- [x] Repository Pages source is set to **GitHub Actions**
- [x] Successful `main` validation and Pages deployment observed in GitHub Actions
- [x] Published site tested at `https://evoryder8-collab.github.io/AURA/`
- [ ] Supabase redirect allowlist includes local and deployed HashRouter callback URLs
- [ ] Production-readiness review completed before any non-synthetic data is introduced

Exit gate: a reviewer can navigate the published synthetic build and reproduce local setup from the README.

## Deferred by product scope

The following are deliberately excluded: pricing or marketing pages, sales funnels, subscription billing, investor content, commercial onboarding, legal contracts, founder-family continuity, a shared multi-tenant platform, and separate therapist/client frontend applications.
