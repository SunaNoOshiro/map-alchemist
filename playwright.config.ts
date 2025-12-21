import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
    features: 'test/e2e/features/*.feature',
    steps: 'test/e2e/steps/*.steps.ts',
});

const basePath = process.env.VITE_BASE_PATH || '/';
const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
const previewUrl = `http://localhost:4173${normalizedBasePath}`;

export default defineConfig({
    timeout: 60000,
    testDir,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: process.env.BASE_URL || previewUrl,
        trace: 'on-first-retry',
        viewport: { width: 1280, height: 720 },
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: process.env.BASE_URL ? undefined : {
        command: 'npm run preview',
        url: previewUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
