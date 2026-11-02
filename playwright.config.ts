import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', channel: 'msedge', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Edge'] } }, { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 120000 },
});
