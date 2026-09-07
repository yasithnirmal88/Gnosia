import '@testing-library/jest-dom/vitest'

// ─── jsdom media stubs ─────────────────────────────────────────────────────────
// jsdom does not implement HTMLMediaElement playback.
if (typeof HTMLMediaElement !== 'undefined') {
  if (!HTMLMediaElement.prototype.play) {
    HTMLMediaElement.prototype.play = () => Promise.resolve()
  }
  if (!HTMLMediaElement.prototype.pause) {
    HTMLMediaElement.prototype.pause = () => {}
  }
  if (!HTMLMediaElement.prototype.load) {
    HTMLMediaElement.prototype.load = () => {}
  }
}

// ─── Browser APIs used by framer-motion / responsive code ────────────────────
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })
  }
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  if (typeof window.IntersectionObserver === 'undefined') {
    window.IntersectionObserver = class IntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    }
  }
}

// ─── crypto.randomUUID (Node < 19 does not ship it) ──────────────────────────
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  try {
    crypto.randomUUID = () => {
      const b = crypto.getRandomValues(new Uint8Array(16))
      b[6] = (b[6] & 0x0f) | 0x40
      b[8] = (b[8] & 0x3f) | 0x80
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
  } catch {
    /* ignore — randomUUID already available */
  }
}

// Audio elements created by components must not hit the real network.
if (typeof window !== 'undefined') {
  const origAudio = window.Audio
  window.Audio = class {
    constructor() {}
    play() { return Promise.resolve() }
    pause() {}
    load() {}
    addEventListener() {}
    removeEventListener() {}
    set volume(v) {}
    get volume() { return 1 }
  }
  if (origAudio) window.origAudio = origAudio
}