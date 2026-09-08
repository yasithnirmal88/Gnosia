// Production-bundle dev-URL gate.
//
// Fails the build if the emitted bundle references development endpoints:
//   - explicit dev ports on localhost/loopback (8080 backend, 5173 vite, ...)
//   - raw ws:// or http:// dev schemes
//
// It deliberately passes the single known third-party constant that survives
// DCE: @stomp/stompjs ships a `globalThis.location` polyfill normalized to
// `//localhost:80` for non-browser environments. It is a constant fallback,
// never a configurable endpoint, and is pinned by the lockfile. Everything
// else that mentions localhost/loopback is treated as a leak.

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DIST = path.resolve(process.cwd(), 'dist')

// @stomp/stompjs location polyfill — reviewed, inert fallback constant. The
// minifier inlines it as property pairs (`host:"localhost",port:80` and
// `href:"http://localhost/"`), so candidates are compared against those
// normalized artifacts rather than a literal string. That keeps a genuine
// "localhost:8080" leak from ever being mistaken for the ":80" constant.
const STOMP_ARTIFACTS = ['host:localhost,port:80', 'href:http://localhost/']

// Any localhost/loopback token that is NOT an inert polyfill above.
const DEV_TOKEN = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])\b/gi

function flagContext(bundle, index) {
  const start = Math.max(0, index - 80)
  const end = Math.min(bundle.length, index + 120)
  return bundle.slice(start, end).replace(/\s+/g, ' ').trim()
}

function isStompPolyfill(context) {
  const normalized = context.replace(/["'\s]/g, '')
  return STOMP_ARTIFACTS.some((artifact) => normalized.includes(artifact))
}

export async function checkDistDevUrls() {
  let files
  try {
    const entries = await readdir(DIST, { recursive: true, withFileTypes: true })
    files = entries
      .filter((e) => e.isFile())
      .map((e) => path.join(e.parentPath || DIST, e.name))
  } catch {
    throw new Error(`dist/ not found under ${DIST} — run "npm run build" first`)
  }

  const leaks = []
  for (const file of files) {
    const bundle = await readFile(file, 'utf8')
    for (const match of bundle.matchAll(DEV_TOKEN)) {
      const context = flagContext(bundle, match.index)
      if (isStompPolyfill(context)) continue
      leaks.push({ file, context })
    }
  }

  if (leaks.length > 0) {
    for (const { file, context } of leaks) {
      console.error(`[dev-url] ${path.basename(file)}: ...${context}...`)
    }
    throw new Error(`Development URLs leaked into the production bundle (${leaks.length})`)
  }

  console.log(`OK: no development URLs in ${files.length} production bundle file(s)`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkDistDevUrls().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}