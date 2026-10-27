import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Every execution writes into its own run folder (<project>/runs/<run-id>/), created by
// `node <harness>/bin/qa-runs.mjs new <slug>`. There is deliberately no default: a
// folder shared by every execution is what overwrote the previous result.
const runDir = process.env['TH_RUN_DIR'];
if (!runDir && !process.argv.includes('--list')) {
  throw new Error(
    'TH_RUN_DIR is not set. Create a run first (node <harness>/bin/qa-runs.mjs new <slug>) and run with TH_RUN_DIR=<that run folder>.'
  );
}
const out = (file: string) => path.join(runDir ?? '.', file);

export default defineConfig({
  testDir: './tests',
  outputDir: out('evidence'),
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : 4,
  reporter: [
    ['json', { outputFile: out('results.json') }],
    ['junit', { outputFile: out('results.xml') }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
