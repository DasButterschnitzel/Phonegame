import { defineConfig, devices } from '@playwright/test';

const gpuArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions: { args: gpuArgs },
  },
  projects: [
    { name: 'pixel7', use: { ...devices['Pixel 7'], launchOptions: { args: gpuArgs } } },
    {
      name: 'small-phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        launchOptions: { args: gpuArgs },
      },
      grep: /@smoke/,
    },
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 720 }, launchOptions: { args: gpuArgs } },
      grep: /@smoke/,
    },
  ],
  webServer: {
    command: 'npm run build:e2e && npx vite preview --mode e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
