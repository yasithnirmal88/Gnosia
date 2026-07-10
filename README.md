# Gnosia: Intergalactic Deduction Game

Gnosia is a real-time multiplayer social deduction game set on a spaceship. 
Identify the infected (Gnosia) before they eliminate the crew!

## 🚀 Getting Started

### 1. Backend (Spring Boot)
- **Runtime**: Java 17+
- **Commands**:
  ```bash
  cd backend
  ./mvnw spring-boot:run
  ```
- **Port**: 8080 (WebSocket at `/game-ws`)

### 2. Frontend (React + Vite)
- **Runtime**: Node.js 18+
- **Commands**:
  ```bash
  cd frontend
  npm install
  npm run dev -- --port 3000
  ```
- **Port**: 3000

## 🌌 Game Phases
1. **Lobby**: Players join via room code. Need 5 players to start.
2. **Discussion (10 min)**: Public chat to identify suspects.
3. **Voting**: Cast your vote via player grid.
4. **Cryosleep**: Highest voted player is "frozen".
5. **Role Actions**: Special roles perform private scans/protections.
6. **Warp (5 min)**: Only Gnosia move and communicate. They select a target to eliminate.
7. **Result**: Levi AI announces the night's outcome.

## 🎭 Roles
- **Gnosia (1)**: The infected killers. Must hide and eliminate humans.
- **Engineer**: Can scan one player per day to check for infection.
- **Doctor**: Can perform an autopsy on the cryoslept player.
- **Guardian Angel**: Can protect one player (not self) from the nightly attack.
- **Human**: Stay alive and vote out the Gnosia.

## ✨ Features
- **Server-authoritative logic**: All game state managed on backend.
- **STOMP WebSockets**: Real-time sync across all clients.
- **Glassmorphic UI**: Premium space-themed visuals.
- **Responsive Animations**: Smooth transitions between game phases.

## 🚢 Deploy to Render

### Backend (Web Service)
| Setting | Value |
|---------|-------|
| **Runtime** | Java 17 |
| **Build Command** | `cd backend && ./mvnw clean package -DskipTests` |
| **Start Command** | `cd backend && java -jar target/game-0.0.1-SNAPSHOT.jar` |
| **Health Check Path** | `/game-ws` (WebSocket) |
| **Env Vars** | `LOG_LEVEL=INFO`, `CORS_ALLOWED_ORIGINS=https://*.onrender.com` |

### Frontend (Static Site)
| Setting | Value |
|---------|-------|
| **Root Directory** | `frontend` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |
| **Env Vars** | `VITE_BACKEND_URL=https://<your-backend>.onrender.com/game-ws` |

### Frontend Env Var Reference
All env vars are documented in `frontend/.env.example`:
- `VITE_BACKEND_URL` — WebSocket endpoint
- `VITE_STUN_URL` — STUN server (default: Google public STUN)
- `VITE_TURN_URL` — TURN server (optional, for cross-network WebRTC)
- `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` — TURN auth

### ✅ Deployment Checklist
After deploying, test each scenario:

1. **Room creation**: Create a room, get the code
2. **Join**: Join from a second browser with the code
3. **Full lobby**: Fill all player slots (create + join from multiple tabs)
4. **Game start**: Host clicks COMMENCE
5. **Discussion**: Public chat messages appear for all players
6. **Voting**: Each player votes; results appear after timer
7. **Cryosleep**: Voted-out player shown as frozen
8. **Warp**: Gnosia-only chat works; kill vote reaches majority
9. **Engineer scan**: Scan result delivered to Engineer's private channel
10. **Doctor check**: Autopsy result delivered to Doctor's private channel
11. **Guardian Angel protect**: Shield trigger broadcast if protected player is targeted
12. **Game over**: Win screen shown after Gnosia or Human victory
13. **Voice chat**: Audio streams connect between browsers
14. **Reconnect**: Refresh a player's page mid-game — state restores
15. **Wrong phase action**: Send invalid WebSocket message — get `ACTION_REJECTED` error
