// Central endpoint resolution for the browser client.
//
// Dev: Vite serves on :5173 while the Spring backend listens on :8080, so the
// fallback below points at the local backend. `import.meta.env.DEV` is replaced
// at build time; in a production bundle the dead branch is eliminated and the
// localhost literal never ships, so the served origin (same host as the API) is
// used instead.
const DEV_BACKEND_URL: string = 'http://localhost:8080/game-ws';

export function backendUrl(): string {
  const configured = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (configured) return configured;
  if (import.meta.env.DEV) return DEV_BACKEND_URL;
  return `${window.location.origin}/game-ws`;
}