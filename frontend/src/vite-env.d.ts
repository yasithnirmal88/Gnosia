/// <reference types="vite/client" />

/*
 * Typed access to the env vars used by the frontend. Declared members win over
 * vite's `[key: string]: any` index signature, so reading these is `string |
 * undefined` instead of `any` (keeping the non-any contract across our code).
 */
interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_STUN_URL?: string;
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
}