# AURA Engineering Contract

These instructions apply to the entire repository. They are permanent project constraints, not suggestions.

## Non-negotiable rules

- TypeScript strict mode is mandatory.
- No secret may be committed or included in frontend code.
- All database tables exposed through Supabase must have deliberate grants and Row Level Security.
- Client and therapist authorization is controlled by backend data, never by the role-selection screen.
- Clients can access only their own records.
- Therapist-only observations must remain separate from client-visible information.
- No generative model may determine the clinical/professional pattern.
- The pattern engine must be pure, deterministic, explainable, versioned, and unit-tested.
- Do not use diagnostic, causal, medical-necessity, structural-healing, or guaranteed-outcome language.
- The project uses synthetic data until explicitly approved otherwise.
- Every feature must support keyboard access, touch access, reduced motion, and responsive layouts.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` must pass before completion.
- Visible placeholder controls are prohibited. Either implement the action, hide it behind a feature flag, or label it clearly as unavailable in the test environment.

## Working conventions

- Use npm and commit the lockfile.
- Commit work in logical, reviewable increments when repository permissions permit.
- Keep domain calculations independent from React and Supabase. UI code consumes domain outputs; it does not recreate rules.
- Access application data through repository interfaces. Do not scatter direct Supabase calls through page components.
- Keep timestamps in UTC at rest and render them in the configured practice timezone.
- Keep health details, client names, credentials, tokens, raw transcripts, and permanent private-storage paths out of filenames, logs, analytics, and error reports.
- Treat every `VITE_` value as public build output. Service-role keys and provider credentials belong only in protected server or Edge Function environments.
- Never make an application table anonymously readable unless the exposure is documented and limited to deliberately public, non-sensitive data.
- Prefer private storage, authenticated downloads, short-lived signed URLs, non-guessable paths, and explicit consent checks.
- Keep demo fixtures unmistakably fictional. Demo state may be local; it must never imply Supabase synchronization.
- Use semantic language such as _recorded_, _observed_, _pattern_, _consider review_, and _requires professional judgment_.
- Add or update tests with every behavior change, including authorization boundaries and accessible alternatives.
- Preserve visible focus, screen-reader names, error announcements, 44px minimum touch targets, and non-color indicators.
- Do not cache access tokens, private photographs, PDFs, voice notes, or unrestricted authenticated API responses in the service worker.
- Run the smallest relevant checks during development, then the required full validation suite before declaring work complete. Never claim an unrun check passed.

## Definition of done

A change is complete only when its behavior is implemented end-to-end, unavailable external integrations have a documented deterministic fallback, the relevant tests pass, and operational documentation remains accurate. Security-sensitive changes also require deliberate grants, RLS/storage policies, consent handling, and privacy-safe audit behavior.
