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
1. **Lobby**: Players join via room code. Need 5+ players to start (Max 15).
2. **Discussion (10 min)**: Public chat to identify suspects.
3. **Voting**: Cast your vote via player grid.
4. **Cryosleep**: Highest voted player is "frozen".
5. **Role Actions**: Special roles perform private scans/protections.
6. **Warp (5 min)**: Only Gonosia move and communicate. They select a target to eliminate.
7. **Result**: Levi AI announces the night's outcome.

## 🎭 Roles
- **Gonosia (3)**: The infected killers. Must hide and eliminate humans.
- **Engineer**: Can scan one player per day to check for infection.
- **Doctor**: Can perform an autopsy on the cryoslept player.
- **Guardian Angel**: Can protect one player (not self) from the nightly attack.
- **Human**: Stay alive and vote out the Gonosia.

## ✨ Features
- **Server-authoritative logic**: All game state managed on backend.
- **STOMP WebSockets**: Real-time sync across all clients.
- **Glassmorphic UI**: Premium space-themed visuals.
- **Responsive Animations**: Smooth transitions between game phases.
