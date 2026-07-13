# GitHub Pages deployment

## Deployment shape

The current repository name is `AURA`, so its default project-site URL and Vite base are:

```text
https://<owner>.github.io/AURA/
VITE_BASE_PATH=/AURA/
```

Repository names and Pages paths are case-sensitive. The original product brief used `/Aura/` as a generic example; this repository is named `AURA`, so `/AURA/` is correct.

For a future custom domain hosted at the origin root:

```text
https://<custom-domain>/
VITE_BASE_PATH=/
```

The application uses HashRouter. An in-app route appears after the hash, for example `https://<owner>.github.io/AURA/#/therapist/today`, so route refresh does not depend on a Pages rewrite. The workflow derives the account from the repository and does not hard-code it.

## Workflows

`.github/workflows/ci.yml` runs validation on pull requests and pushes to `main`:

1. clean npm install;
2. lint;
3. strict type checking;
4. unit/component tests;
5. production demo build;
6. Playwright Chromium smoke tests.

`.github/workflows/deploy-pages.yml` listens for a successful push-triggered **CI** run on `main`, checks out the exact validated commit, rebuilds with public deployment variables, configures Pages, uploads `dist`, and deploys through the official GitHub Pages actions. Pull-request and manually dispatched runs cannot enter this privileged deployment path. Deployment permissions are limited to `pages: write` and `id-token: write`; source checkout remains read-only.

The deployment rebuild is intentional. It prevents a general CI artifact from silently carrying a different public environment into Pages.

## One-time repository setting

An administrator must select the Pages publishing source once:

1. open **Repository → Settings → Pages**;
2. under **Build and deployment → Source**, select **GitHub Actions**;
3. save if prompted.

No branch directory such as `docs/` or `gh-pages` should be selected. The workflow deploys an Actions artifact. If Pages is not already enabled and repository/API permissions do not allow automated configuration, this is the only required repository setting for the default demo deployment.

Also confirm that Actions are enabled and the repository permits GitHub-authored actions. The workflow uses only official `actions/*` actions plus repository npm commands; each action is pinned to a reviewed commit SHA with its release major shown in a comment.

## Public build variables

The Pages build reads GitHub **Variables** with safe demo defaults. Configure them at **Settings → Secrets and variables → Actions → Variables**.

| Name                                | Default behavior | Pages repository value                           |
| ----------------------------------- | ---------------- | ------------------------------------------------ |
| `VITE_APP_ENV`                      | `test`           | `test` until production review                   |
| `VITE_DEMO_MODE`                    | `true`           | `true` for public synthetic review               |
| `VITE_BASE_PATH`                    | `/AURA/`         | `/AURA/`                                         |
| `VITE_SUPABASE_URL`                 | empty            | optional connected project URL                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY`     | empty            | optional connected publishable key               |
| `VITE_ENABLE_PASSKEYS`              | `false`          | enable only when configured/tested               |
| `VITE_ENABLE_AI_NARRATION`          | `false`          | enable only when function/provider is configured |
| `VITE_ENABLE_TRANSCRIPTION`         | `false`          | enable only when function/provider is configured |
| `VITE_ENABLE_SECURE_HANDOFF_LINKS`  | `false`          | enable only when functions are deployed          |
| `VITE_ENABLE_BROWSER_NOTIFICATIONS` | `false`          | enable only when implemented/configured          |

Every `VITE_` value is public in the JavaScript bundle. Use Variables rather than Secrets to make that public nature explicit. Never add a service-role key, AI/transcription key, token pepper, messaging credential, password, or deploy token to the Vite environment.

The credential-free defaults deliberately produce a usable synthetic build and persistent `TEST BUILD — SYNTHETIC DATA ONLY` presentation.

## First deployment

After selecting the source:

1. push or merge the implementation to `main`;
2. open the **Actions** tab and watch **CI**;
3. after CI succeeds, watch **Deploy GitHub Pages**;
4. open the URL reported by the `github-pages` deployment environment;
5. navigate both synthetic roles and refresh a nested hash route;
6. verify assets, PWA behavior, offline page, and the test-build indicator.

Do not claim deployment succeeded until the deploy job has a successful conclusion and the published URL has been opened.

## Change to a custom domain

1. Configure and verify the domain in **Settings → Pages → Custom domain**. A repository `CNAME` file alone does not configure the Pages setting.
2. Follow GitHub's displayed DNS instructions and enable HTTPS after certificate provisioning.
3. Set repository variable `VITE_BASE_PATH` to `/`.
4. Update `APP_ORIGIN` to the exact browser origin and `APP_BASE_URL` to the full public app URL (including `/AURA/`) for protected Edge Functions.
5. Add the custom origin and `/#/auth/callback` to the Supabase Auth redirect allowlist.
6. Update PWA start/scope paths and any absolute metadata if the application configuration does not derive them from the Vite base.
7. Re-run CI, deploy from `main`, and test auth, callback, refresh, assets, installability, and offline behavior on the new origin.
8. Remove obsolete redirect origins only after the transition is verified.

Do not include a tracked `CNAME` until the real domain is known. With no `CNAME`, the default repository URL remains valid.

## Connected Supabase deployment

GitHub Pages can host the browser application but cannot host Supabase functions or protect secrets. Before changing `VITE_DEMO_MODE` to false:

- deploy migrations, grants, RLS, storage policies, seeds/approved bootstrap, and required Edge Functions;
- set the public Supabase URL and publishable key as repository Variables;
- configure exact Pages/custom-domain redirects in Supabase Auth;
- set server-only function secrets in Supabase, never GitHub Pages build variables;
- run the authorization and storage tests;
- keep the synthetic indicator unless `VITE_APP_ENV=production` has been explicitly approved.

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

## Troubleshooting

### The site returns 404

- Confirm the Pages source is **GitHub Actions**.
- Confirm the deploy job succeeded and the Pages environment reports a URL.
- Confirm the path uses uppercase `/AURA/`.
- Confirm `dist/index.html` was uploaded, not the repository root.

### HTML loads but assets 404

- Confirm `VITE_BASE_PATH=/AURA/` for repository Pages.
- Confirm Vite's `base` uses the parsed environment value and has both leading and trailing slashes.
- Inspect generated asset URLs in `dist/index.html`.
- Rebuild; build-time Vite variables cannot be changed after upload.

### A nested route fails on refresh

- The URL should contain `#/...`.
- Confirm the router is `HashRouter`, not `BrowserRouter`.
- Confirm callback/link generation preserves the Vite base before the hash.

### Deploy never starts after CI

- Confirm CI ran on the `main` branch and concluded successfully.
- Confirm `deploy-pages.yml` exists on the default branch; GitHub only triggers `workflow_run` workflows defined there.
- Confirm the triggering workflow's name remains exactly `CI`, or update the deployment trigger when renaming it.
- Check repository Actions policy and workflow permissions.

### Deploy reports Pages permission/environment errors

- Select GitHub Actions as the Pages source.
- Confirm the deploy job has `pages: write` and `id-token: write`.
- Confirm the environment is named `github-pages` and its branch protection permits `main`.
- An organization policy may require an owner to enable Pages or approve the environment.

### Authentication returns to the wrong location

- Confirm the built base matches the active domain form.
- Confirm the callback is derived as `<origin><base>#/auth/callback`.
- Update Supabase Site URL and redirect allowlist for the exact published origin.

## Rollback

Fix-forward by reverting the offending commit on `main` through normal review; successful CI will trigger a deployment of that known state. GitHub also retains deployment history, but rebuilding a reviewed commit keeps source, lockfile, and public configuration reproducible. Never roll back database migrations by deleting migration files; use an explicit corrective migration and assess compatibility with the deployed frontend.
