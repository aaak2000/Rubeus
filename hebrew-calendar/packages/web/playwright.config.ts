import { defineConfig, devices } from '@playwright/test';

const WEB = 'http://127.0.0.1:5173';
const API_PORT = 3001;

// Allows running against a Chromium already present on the machine (set
// CHROMIUM_PATH); CI installs its own browser and leaves this unset.
const executablePath = process.env.CHROMIUM_PATH || undefined;

/**
 * End-to-end configuration.
 *
 * Both servers are started by Playwright so a single `pnpm test:e2e` reproduces
 * CI locally. The API runs from its compiled output, which is what ships.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 }, launchOptions: { executablePath } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath } } },
  ],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: 'test',
        // Each spec registers its own account; the production brute-force
        // limit would reject the later ones.
        AUTH_RATE_LIMIT: '1000',
      },
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 5173',
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
