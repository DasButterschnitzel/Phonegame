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
  testIgnore: [/pwa\.spec\.ts/, /android\.spec\.ts/],
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
    {
      // Production web flavor (PWA) served separately.
      name: 'pwa',
      testIgnore: [],
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4174', launchOptions: { args: gpuArgs } },
    },
    {
      // Release native flavor inside a simulated Android Capacitor shell (e2e/android-shell.ts).
      name: 'android',
      testIgnore: [],
      testMatch: /android\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4175', launchOptions: { args: gpuArgs } },
    },
  ],
  webServer: [
    {
      command: 'npm run build:e2e && npx vite preview --mode e2e --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run build:web && npx vite preview --mode web --port 4174 --strictPort --outDir dist/web',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run build:native && npx vite preview --mode native --port 4175 --strictPort --outDir dist/native',
      url: 'http://localhost:4175',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
