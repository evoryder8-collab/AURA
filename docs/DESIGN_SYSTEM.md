# AURA design system — "Dusk"

AURA was redesigned from scratch in November 2026. This is the contract every screen follows.

## Character

A private wellness retreat at dusk: deep blue-green ink, light reflected from water (aqua), warm lantern light for the one action that matters (gold). Surfaces are thin, crisp frosted glass. Signature moments (entrance, identity reveal, Session Mode) are cinematic; everyday screens are quiet — fewer glows, generous spacing, one primary action per view.

## Tokens (`src/styles/aura.css`)

- Ink backgrounds `--ink-950 … --ink-600`; text `--text`, `--text-soft`, `--text-dim`, `--text-faint`.
- Lines `--line`, `--line-strong`; glass `--glass`, `--glass-strong`, `--glass-hi`.
- Accents: `--aqua` (water, positive, focus of information), `--lantern` (primary action, focus ring), `--rose` (concern, errors).
- Pain scale `--pain-0`, `--pain-low` (1–3), `--pain-mid` (4–6), `--pain-high` (7–8), `--pain-max` (9–10). A score is always printed as a number; colour is never the only cue. Use `PainChip` / `painColor()`.
- Radii `--r-xs … --r-xl`, `--r-pill`; spacing `--s-1 … --s-12`; motion `--ease`, `--t-fast/med/slow`.
- System font only (`--font`, `--font-display`); numbers use `.num` (tabular).

## Primitives

- `components/design-system`: `Button` (primary = lantern gold, secondary = glass, ghost, danger; sizes sm/md/lg; `fullWidth`), `Card` (glass panel; tones default/soft/gold/concern), `Field`/`Input`/`Select`/`Textarea`, `Modal` (bottom sheet on phones, centred dialog ≥760px), `Badge`, `PageHeader`, `Spinner`.
- `components/ui`: `Portrait` (arched head-and-shoulders window with monogram fallback; `assetUrl()` resolves files in `public/`), `PainChip`, `painColor`, `painWord`, `Segmented` (pressed-state button group), `ScoreScale` (0–10 radio group, arrow keys, zero as easy as any number).
- Layout classes: `.page` (centred column with safe-area and tab-bar padding), `.stack`, `.row`, `.row--between`, `.row--wrap`, `.grid-2`, `.list`, `.empty`, `.eyebrow`, `.title-xl/.title-lg/.title-md`, `.lead`, `.muted`, `.small`, `.back-link`, `.divider`, `.visually-hidden`.
- Feature styles live in a CSS file beside the feature and use the tokens; never hard-code a new palette.

## Shells

- Client: bottom bar (Home, Progress, centre **Log how I feel**, Visits, Me); side rail with the same items ≥1000px.
- Therapist: bottom bar on phones (Today, Clients, Calendar, Settings), side rail with portrait ≥1000px. Session Mode and arrival intake are full-screen routes outside the shell.

## Rules

- Plain words a client would say ("Log how I feel", "Visits", "Extra care"). No coined feature names.
- Recorded, observed, pattern, consider review, requires professional judgment. Never diagnostic, causal, curative or guaranteed-outcome language. Massage is never said to have caused a change.
- Every figure on a screen comes from one shared calculation (`src/domain/care`, `src/data/demo/selectors.ts`), so two numbers can never disagree.
- Copy frames gaps as information, never as failure. A missed day is simply a gap.
- 44px minimum touch targets, visible focus (`:focus-visible` lantern ring), screen-reader names on every control, errors announced (`role="alert"`), non-colour indicators (numbers, shapes, labels), `prefers-reduced-motion` respected (motion settles to a still frame).
- Layouts are checked at 320px, 390px, tablet landscape (1180×820) and laptop (1440×900). No horizontal scroll; no text scaled down to fit.
- Avoid template tells: no accent bars beside headings, no concentric halo rings, no outlines traced around highlighted areas, no repeated labels (a headline and a chip saying the same thing).
- Demo data is fictional and stays in this browser (IndexedDB); never imply it is synced. Connected mode keeps clinical screens hidden until they have protected adapters.
