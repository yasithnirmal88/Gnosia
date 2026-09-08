import { defineConfig } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(here, '..')
const backendDir = path.resolve(here, '../..', 'backend')

function mavenCommand(): string[] {
  const flags = ['-q', '-DskipTests', 'spring-boot:run']
  if (process.env.MAVEN_OFFLINE === '1') flags.unshift('-o')
  const local = path.join(backendDir, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw')
  if (fs.existsSync(local)) return [local, ...flags]
  return ['mvn', ...flags]
}

/**
 * End-to-end suite: real backend (Spring Boot, :8080) + real frontend
 * (Vite dev server, :5173). Scenario specs live in ./e2e/scenarios.
 *
 * The backend is launched with rate limiting disabled so UI-driven actions
 * (create, join, vote, reconnect) are not throttled mid-test.
 */
export default defineConfig({
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      command: mavenCommand().join(' '),
      cwd: backendDir,
      url: 'http://localhost:8080/game-ws/info',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        RATE_LIMIT_ENABLED: 'false',
        LOG_LEVEL: 'WARN',
      },
    },
    {
      command: 'npm run dev',
      cwd: frontendDir,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})