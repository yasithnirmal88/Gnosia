# Gnosia — CI/CD

Production pipeline for the `main` branch and every pull request, plus the
recommended branch-protection setup. The checks live in
`.github/workflows/ci.yml` (pull requests) and `.github/workflows/deploy.yml`
(publish + deploy on push to `main`).

---

## Quality gates (required on every PR)

```
PR
 │
 ├─ 0. secrets      → gitleaks scan (committed credentials), no tracked .env / logs
 ├─ 1. backend      → compile → unit+integration tests → OWASP dependency scan
 │                    (fails on CVSS >= 9) → package (jar) → Docker image build
 ├─ 2. frontend     → npm ci → lint → typecheck → vitest → npm audit(prod critical)
 │                    → production build → dev-URL leak gate → Docker image build
 ├─ 3. e2e          → real Spring backend + real Chromium (Playwright, 12 tests)
 │
 └─ 4. review       → human approval required (branch protection)
        │
        └─ 5. deploy → on merge to main: CI re-runs, then CD publishes images
```

### Required status checks to enable

In GitHub → Settings → Branches → `main` → Add rule:

| Setting | Value |
| --- | --- |
| Require a pull request before merging | on |
| Require approvals | 1 |
| Require status checks to pass | on |
| Required checks | `secrets`, `backend`, `frontend`, `e2e` |
| Require branches to be up to date | on |
| Do not allow bypassing | on (admins too) |
| Require conversation resolution | on |
| Block force pushes / deletions | on |

The deploy workflow runs only after these checks pass (branch protection blocks
the merge otherwise).

---

## Security gates

### Dependency scanning
- **Java/Maven** — OWASP Dependency-Check (`org.owasp:dependency-check-maven`,
  configured in `backend/pom.xml`). Fails the pipeline at **CVSS >= 9** by
  default; tighten per-run with `-Ddependency-check.failBuildOnCVSS=7`. Report:
  `backend/target/dependency-check-report.html` (uploaded as artifact).
- **Node/npm** — production dependencies are gated hard:
  `npm audit --omit=dev --audit-level=critical`. The **full** audit (including
  dev tooling) is uploaded as an artifact but does not block, because the
  currently-known dev-only criticals (`vite`/`vitest` < 3.2.6) never execute in
  a deployment: vite's dev server and vitest's UI mode are not exposed. They are
  tracked tech-debt (see Deficit below), not silently ignored.

### Secrets
- `secrets` job: gitleaks over the whole history (requires `fetch-depth: 0`),
  plus hard checks that no `.env*` (besides the committed `.env.example`) and no
  `*.log` / `*.err` / `*.key` artifacts are tracked. `.gitignore` covers
  `frontend/.env*` + `backend/.env*` and all log/err artifacts.
- No credentials are read from the repo: backend CORS/rate-limit values are env
  overrides, the frontend backend URL is a build-time `VITE_BACKEND_URL` arg
  (same-origin fallback by default).
- Server-only secrets (Render dashboard, never committed): none exist yet, but
  if added (e.g. a relay/webhook key) they belong in the platform secret store,
  referenced from `render.yaml` with `sync: false`.
- `VITE_*` values are **baked into the public bundle** — never place a permanent
  shared secret there. TURN credentials in particular must be ephemeral
  (REST-API/time-limited); the guidance lives in `frontend/.env.example`.

### Development URLs in production
- `frontend/scripts/check-dist-dev-urls.mjs` runs after the production build and
  fails the pipeline if the bundle references any localhost/loopback endpoint
  except the reviewed, pinned `@stomp/stompjs` location polyfill constant
  (`host:"localhost",port:80` etc.). The app itself resolves its backend from
  `window.location.origin` in production (`src/config/endpoints.ts`), so the dev
  fallback never ships. The frontend nginx image proxies `/game-ws`,
  `/game-ws-raw`, `/audio`, and `/healthz` (→ actuator health) to the backend.

---

## Artifacts
- Backend: Spring Boot fat jar (`backend/target/game-*.jar`) + multi-stage
  Docker image (`eclipse-temurin:17-jre-jammy`, non-root, HEALTHCHECK against
  `/actuator/health`).
- Frontend: `dist/` (uploaded) + multi-stage Docker image
  (`nginx:1.27-alpine`; runs `check:prod-urls` inside the build stage, ships the
  security-header config in `frontend/default.conf`, HEALTHCHECK against the
  proxied `/healthz`).
- Reports: OWASP HTML report, full npm audit JSON, Playwright artifacts on
  failure — all attached to the run.

## Runtime hardening (prod/staging profiles)

### Browser origins — explicit allow-list, fail-fast
- WebSocket/SockJS handshakes only accept origins from `CORS_ALLOWED_ORIGINS`
  (exact-origin matching, comma-separated). **Wildcards are rejected in every
  profile** and `prod`/`staging` **refuse to boot with an empty list**
  (`AppSecurityConfiguration` → `AllowedOrigins`). Verified at runtime: an
  unexpected origin gets HTTP 403 at the handshake (`WebSocketOriginPolicyTest`).
- The old dev defaults (`http://localhost:*`, `https://*.onrender.com`) are gone;
  per-profile files: `application-dev.properties` (localhost:5173/8080 exact),
  `application-staging.properties`, `application-prod.properties`.

### Transport & headers
- Frontend (nginx + Vercel/Render static headers): CSP (inline styles, Google
  Fonts, `connect-src https/wss/ws`), HSTS, `nosniff`, `Referrer-Policy
  strict-origin-when-cross-origin`, `X-Frame-Options`/`frame-ancestors 'self'`,
  `Permissions-Policy` scoped to camera/mic/gamepad. WebRTC TURN offers a
  `turns:` (TLS) twin for `:443` and never the unencrypted `:80` relay variant.
- Backend (`SecurityHeadersFilter`, prod/staging only): the same header family
  with a minimal JSON/WS CSP.
- WebSocket transport: SockJS on a secure origin upgrades to `wss` automatically;
  the bundle's CSP only admits `https:/wss:/ws:` for connectivity.

### Observability
- `/actuator/health` (detail always hidden) — Docker HEALTHCHECK, Render
  `healthCheckPath`, and the nginx `/healthz` proxy all consume it.
- Structured JSON logs in prod/staging via Logstash encoder (`logback-spring.xml`)
  with `service` + `env` fields; request correlation ids (`X-Request-Id` in,
  echoed out, and attached as `requestId` MDC) on every HTTP request.
- Sensitive values are never logged: chat/Gnosia-chat content, scan & doctor
  results, PINs, identity keys, tokens. (This was an audit fix — see commit
  history; e.g. `[GNOSIA-CHAT] ...: {content}` and `[SCAN] Result ...: HUMAN`
  were removed.) Startup logs sanitized deploy config only.

## Deploy
Push to `main` → `ci.yml` re-validates → `deploy.yml` builds and pushes
`ghcr.io/<owner>/<repo>/{backend,frontend}` tagged `latest` + `<sha>` (Buildx +
GHCR cache). An optional webhook deploy job runs only if
`DEPLOY_WEBHOOK_URL` secret is configured.

### Render (`render.yaml` blueprint)
- `gnosia-backend` (Docker): set `SPRING_PROFILES_ACTIVE=prod` and
  `CORS_ALLOWED_ORIGINS` to the browser origin(s), comma-separated. Without an
  explicit list the service exits at startup — that is intentional.
- `gnosia-frontend` (static): `buildCommand npm ci && npm run build`, SPA rewrite
  to `/index.html`, security headers, and `VITE_BACKEND_URL` pointed at the
  backend service URL (`https://<backend>.onrender.com/game-ws`) once deployed.
- Secrets (TURN creds, webhook keys) stay in the Render dashboard secret store.

### Vercel (`vercel.json`)
- Frontend only. `rootDirectory: frontend`, `installCommand npm ci`, SPA
  fallback rewrite, security headers on all responses. Set `VITE_BACKEND_URL`
  (`https://…:443/game-ws`) in the project's environment or leave unset for a
  same-origin setup; Vercel does not proxy WebSockets, so a backend origin must
  be given for any cross-origin connection.

### Production-like local smoke (how this was verified)
`mvn package` → `SPRING_PROFILES_ACTIVE=prod CORS_ALLOWED_ORIGINS=https://…:18080 java -jar …`
was exercised for: `/actuator/health`=UP, all security headers, `X-Request-Id`
echo, JSON log lines with `env=prod`, allowed-origin WS handshake `101`, rogue
origin `403`, and the empty-origins boot rejection.

---

## Known deficits (deliberate, tracked)
- `vite`/`vitest` dev-tooling upgrades to majors that clear the dev-scope npm
  audit are deferred: jumping `vite@4` → `vite@8` / `vitest@0.34` → `vitest@5`
  is a breaking toolchain migration. Production deps are audit-clean, so the
  pipeline stays green and the upgrade can land as its own PR behind the same
  gates.
- Backend has **no** checkstyle/Spotless baseline yet ("if adopted" — it is
  not). Adding one is a formatting-only PR; until then the backend lint gate is
  intentionally omitted rather than silently relaxed.
- k6 load profiles are committed (`load/k6/`) but must be run manually against
  a real server (never run in CI without a deploy target).