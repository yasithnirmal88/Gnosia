# Gnosia: Intergalactic Deduction Game

Gnosia is a real-time multiplayer social deduction game set on a spaceship.
A shapeshifting virus (the **Gnosia**) has boarded the vessel with the human
crew. Debate, vote, and survive the warp — or eliminate every infiltrator.

- Backend: Spring Boot (Java 17), server-authoritative game state over
  STOMP-over-SockJS WebSockets, in-memory room engine, identity + rate-limit
  hardening, phase timers, AI narrator (LEVI).
- Frontend: React + Vite, WebRTC voice comms (mesh), STOMP client, live
  countdown, per-game analytics.

## Getting Started

### Prerequisites

- Java 17+ (backend)
- Node.js 18+ (frontend)
- Optional: Playwright browsers for E2E (`npx playwright install chromium`)

### 1. Backend (Spring Boot)

```bash
cd backend
./mvnw spring-boot:run
```

- Port: **8080** — WebSocket endpoint at `/game-ws` (raw STOMP also served at `/game-ws-raw`).
- Environment: `RATE_LIMIT_ENABLED=false` (dev), `LOG_LEVEL=DEBUG|INFO|WARN`.

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

- Port: **5173**.
- Connect the frontend to a backend with `VITE_BACKEND_URL` (see `frontend/.env.example`);
  by default the dev client targets `http://localhost:8080/game-ws`.

## How to Play

1. **Create or join a private room** — hosts generate a 6-character room code +
   4-character PIN. Share both with friends; the lobby has a copy-invite button.
2. **Lobby** — the host sees the live crew roster. Crew members signal **READY**.
   The host can start once the minimum crew (default 5) are aboard *and* every
   connected member has signalled ready — or immediately at full capacity.
3. **Discussion** — public chat and voice comms. Find the Gnosia.
4. **Voting** — every living member votes one suspect into Cold Sleep. Votes are
   revealed in the result.
5. **Warp (night)** — hidden roles act: Gnosia pick a kill, the Engineer scans, the
   Doctor autopsies the last cryoslept player, the Guardian Angel protects.
6. **Win conditions** — Humans win when every Gnosia is eliminated. Gnosia win
   when they outnumber the surviving humans after an elimination.

Full phase loop: `LOBBY → INTRO → DISCUSSION → VOTING → RESULT → CRYOSLEEP →
WARP → DISCUSSION → … → GAME_OVER`.

## Roles

| Role | Allegiance | Ability |
|------|-----------|---------|
| **Human** | Crew | No special power — debate and deduction only. |
| **Engineer** | Crew | Scans one player per warp and learns Human vs Gnosia. |
| **Doctor** | Crew | Autopsies the most recently cold-slept player's true identity. |
| **Guardian Angel** | Crew | Protects one player per warp from a Gnosia kill. |
| **Gnosia** | Infected | Communicates via a hidden channel and eliminates one human each warp. |

## Real-time layer

- **STOMP over SockJS** (`@stomp/stompjs`), Spring `SimpMessagingTemplate`.
- Room state broadcasts to `/topic/room/{code}`; private role results to
  `/topic/private/{channelKey}`.
- Client sends messages to `/app/room/{code}/...` (join, chat, vote, scan,
  doctorCheck, protect, kill, start, ready, leave, signal, dm, gnosia-chat).
- WebRTC peer mesh for voice aux: STUN/TURN via `VITE_STUN_URL` /
  `VITE_TURN_URL`. Media is optional — the game is fully playable text-only.

## Testing

```bash
# Backend unit + integration (Spring context, random port)
cd backend
./mvnw test

# Frontend unit tests (Vitest) + typecheck + lint
cd frontend
npm run test
npm run typecheck
npm run lint

# Production build + guard against dev URLs leaking into the bundle
npm run build
npm run check:prod-urls

# E2E — boots the real backend + Vite dev server (11 scenarios, 1 skipped:
# full game-over requires multi-minute phase timers, see e2e/scenarios/game-over.spec.ts)
npx playwright test --config e2e/playwright.config.ts
```

## Deploy

- **Frontend**: Vercel project rooted at `frontend/` (Root Directory is set on the
  Vercel **project dashboard**, not in `vercel.json`). `npm ci` + `npm run build`
  (outputs `frontend/dist`). Point `VITE_BACKEND_URL` at the deployed backend.
  See `CI-CD.md` for the pipeline and `vercel.json` for the build config.
- **Backend**: Spring Boot web service (e.g. Render) on port 8080; set
  `CORS_ALLOWED_ORIGINS` to the frontend origin and `VITE_BACKEND_URL` on the
  frontend to `https://<backend>/game-ws`. Vercel does not proxy WebSockets, so
  the backend must be reachable directly.
- Env var reference: `frontend/.env.example`.

### Deployment checklist

1. Create a private room and read the code + PIN.
2. Join from a second browser with the correct code + PIN (wrong PIN is rejected).
3. Fill the lobby — roster shows names, HOST crown, READY markers, connection status.
4. Non-host members signal ready; the host starts once everyone is ready
   (or at full capacity).
5. Chat in Discussion and Voting; a vote lands each voter's target.
6. Result + Cryosleep announcements render; the eliminated player is frozen.
7. Warp role actions deliver private results to Engineer/Doctor/Guardian Angel/Gnosia.
8. Win screen appears when either side meets its condition.
9. Voice comms connect (audio/firefox permissions).
10. Refresh a player mid-game — state and identity restore on reconnect.
11. Leave Room removes a player and hands the host role to the next connected member.