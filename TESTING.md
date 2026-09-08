# Gnosia — Testing Strategy

The Gnosia codebase is covered by a four-layer test strategy. Everything is runnable
locally (Windows PowerShell is the reference shell) and is CI-able via GitHub Actions.

| Layer | Tech | Location | Status |
| --- | --- | --- | --- |
| Backend unit + integration | JUnit 5 + Spring `@SpringBootTest` over raw STOMP | `backend/src/test/java/com/gonosia/game/` | 158 tests, green |
| Frontend unit/component | Vitest + React Testing Library (jsdom) | `frontend/src/**/*.test.{js,jsx,ts}` | 64 tests, green |
| End-to-end | Playwright 1.63 + Chromium | `frontend/e2e/` | 11 pass, 1 documented skip |
| Load | k6 (WebSocket API) | `load/k6/` | delivered, run elsewhere |

---

## Prerequisites

- Java 17 + Maven (`backend\mvnw.cmd`)
- Node 18+ (`frontend`)
- One-time: `npx playwright install chromium` (only for E2E)
- `k6` binary on PATH (only for load) — https://grafana.com/docs/k6/latest/set-up/install-k6/

---

## 1. Backend (JUnit + Spring Boot Integration)

WebSocket behavior is tested against a real embedded server using a hand-rolled raw
STOMP client harness (`backend/src/test/java/com/gonosia/game/support/Stomp.java`)
driving the `/game-ws-raw` WebSocket endpoint. SockJS (`/game-ws`) is not covered at
this level; it is a transport shim over the same broker.

Suite highlights:

- `GameLogicServiceTest` (13) — service-level phase/outcome logic
- `GameIntegrationTest` (26) — happy-path room lifecycle over STOMP
- `LargeGameIntegrationTest` (2) — full **15-player** game: setup, discussion, voting,
  warp-speed travel, night actions, and a win for each faction (human/gnosia). This is
  the canonical proof that the whole loop terminates in the shipped configuration.
- `MultiRoomIntegrationTest` (2) — two rooms advanced concurrently to prove no state
  bleed between `Room`/`GameState` instances
- `WebSocketAuthIntegrationTest` (15), `WebSocketCommunicationSecurityTest` (24),
  `GameActionAuthorizationTest` (54) — identity, PIN, and role authorization
- `RateLimitIntegrationTest` (10), `RoomLifecycleIntegrationTest` (5),
  `TimerBroadcastIntegrationTest` (7)

Run (from `backend/`):

```powershell
.\mvnw.cmd -o test
# full suite: 158 test, 0 failures
.\mvnw.cmd -o "-Dtest=LargeGameIntegrationTest" test
```

> Single `-Dtest` values must be quoted (`"-Dtest=A,B"`), or PowerShell splits them.

---

## 2. Frontend (Vitest)

Component and hook tests run in jsdom with the STOMP client mocked, isolating UI
logic from the broker. `vite.config.js` `test.exclude` masks the Playwright `e2e/`
directory so `*.spec.ts` files there are never collected by vitest.

High-value suites:

- `src/hooks/useGame.test.jsx` — hooks state machine incl. room creation without an
  established room code and reconnect recovery
- `src/ws/messageRouter.test.ts` — routes real backend wire frames; guards the JSON
  contract (explicit `null` roles/winner/analytics)
- `src/components/CreateRoom.test.jsx`, `LandingPage`, `VotingResults`,
  `ActionPanel` — UI defaults, inputs, callbacks

Run (from `frontend/`):

```powershell
npx vitest run
# 7 files, 64 tests, green
npm run build   # tsc --noEmit && vite build — the type-check gate
```

---

## 3. End-to-End (Playwright)

`frontend/e2e/playwright.config.ts` boots **both** servers itself (`webServer[]`):
the Spring backend via `mvnw.cmd -o -q -DskipTests spring-boot:run` (cwd = `backend`,
`RATE_LIMIT_ENABLED=false`, `LOG_LEVEL=WARN`) and the Vite dev server. The config is
ESM (`frontend/package.json` → `"type": "module"`), so paths resolve via
`fileURLToPath(import.meta.url)`, and backend must be launched with `cwd = backend`
because `mvnw.cmd` resolves `.mvn/wrapper` relative to the CWD.

Scenarios (`frontend/e2e/scenarios/`):

| Spec | Tests | Covers |
| --- | --- | --- |
| `15-player.game.spec.ts` | 2 | full 15-player lobby through phase broadcasts |
| `multi-room.spec.ts` | 2 | two independent rooms in one browser |
| `reconnect.spec.ts` | 2 | tab reload recovers identity + room state |
| `impersonation.spec.ts` | 3 | wrong PIN rejected; spoofed senderId refused |
| `long-running.spec.ts` | 2 | idle timing-out tabs + reconnect storms |
| `game-over.spec.ts` | 0 (skip) | documented only, see Gap §6 |

Run (from `frontend/`):

```powershell
npm run test:e2e          # headed: npm run test:e2e:headed
# 11 passed, 1 skipped (game-over), ~60s
```

The `game-over` spec is `test.skip`'d with instructions to temporarily shorten
`GameConfig` timers; the flow itself is proven by `LargeGameIntegrationTest`.

---

## 4. Load (k6)

Scripts call the raw STOMP endpoint (`/game-ws-raw`) directly. The server replies
`heart-beat:0,0`, so no heartbeats are required. Rooms use `load-*` identities with
non-colliding channel keys; shared 15-player rooms are formed deterministically
(`groupRoomCode(vu, groupSize)` / `isLeader`) with join-with-retry so VUs converge.

Profiles (`load/k6/scenarios/`):

| Script | What it drives | Key thresholds |
| --- | --- | --- |
| `connections.js` | unique-room create churn (handshake+lifecycle) | p95 create < 1500ms |
| `room-count.js` | hold many concurrent rooms; measure retention release | rooms_failed == 0 |
| `bandwidth.js` | chat pub/sub throughput in 15-player rooms | p95 echo < 1200ms |
| `latency.js` | echo RTT percentiles (interactive budget) | p50<300 / p95<800 / p99<1500 |
| `footprint-cpu.js` | bursty creates + max-size chat, high arrival rate | p95 create < 2000ms |
| `footprint-memory.js` | sustained long-lived connections + churn baseline | churn_err == 0 |
| `serialization.js` | max-size frames + forced full room-state broadcasts | drops == 0 |

Run (for max throughput, disable rate limiting on the server):

```powershell
# server side
$env:RATE_LIMIT_ENABLED = "false"; .\backend\mvnw.cmd -o -DskipTests spring-boot:run

# client side
k6 run load/k6/scenarios/latency.js
k6 run -e VUS=45 -e DURATION=2m load/k6/scenarios/bandwidth.js
```

`footprint-memory.js` is the sustained baseline paired with **out-of-band** server
RSS monitoring (heap/threads via the Spring Boot actuator). k6 does not sample the
server process.

---

## 5. CI Wiring (GitHub Actions)

`.github/workflows/ci.yml` (at repo root):

```yaml
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - run: ./mvnw -o -B test
        working-directory: backend
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
      - run: npx vitest run
        working-directory: frontend
  e2e:
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
        working-directory: frontend
      - run: npx playwright install --with-deps chromium
        working-directory: frontend
      - run: npm run test:e2e
        working-directory: frontend
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: frontend/test-results/
```

k6 load is intentionally **not** part of CI (needs a real server target); run it
against a staging/deployed instance.

---

## 6. Known Gaps & Warnings

- `GameConfig` timers are hardcoded (DISCUSSION 180–300s, VOTING 60s, WARP 90s), so
  full-game **GAME_OVER** E2E is dropped for wall-clock practicality; the flow is
  covered by `LargeGameIntegrationTest`. To run it E2E, shorten the timers first.
- Playwright identity lives in localStorage (`gnosia_identity_key`): pages in the
  **same browser context share identity**, so a second tab "joining" is treated as a
  reconnect. Multi-player E2E must use separate contexts (`browser.newContext()`).
- E2E runs serially (`workers: 1`, `fullyParallel: false`) because backend and
  dev-server boot share ports and room state is cross-scenario.
- k6 scripts are parse-validated but not yet executed — install k6 and run the
  profiles against a real server before trusting the thresholds.
- `UseGame`'s create flow publishes when connected even with a stale room code; the
  guard was intentionally relaxed in `useGame.ts` and is regression-tested.