import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  timeout: process.env.CI ? 90_000 : 30_000,
  // Lazily loaded screens (Session Mode, the PDF) can take a few seconds on a busy runner.
  expect: { timeout: 10_000 },
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI tests the production bundle it just built; locally the dev server keeps feedback fast.
    command: process.env.CI
      ? 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort'
      : 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/AURA/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_APP_ENV: 'test',
      VITE_DEMO_MODE: 'true',
      VITE_BASE_PATH: '/AURA/',
    },
  },
})
