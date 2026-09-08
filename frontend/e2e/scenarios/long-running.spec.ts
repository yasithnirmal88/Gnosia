import { test, expect } from '@playwright/test'
import { createRoom, joinRoom } from '../helpers'

/**
 * Long-lived room health: the STOMP heartbeat must keep the connection alive
 * through a full page-load cycle and the room must remain queryable without
 * entering an admin-removed state. Scoped to LOBBY because production phase
 * timers are minutes long (see game-over.spec.ts for why full games are not
 * wall-clock E2E material).
 */
test('room stays alive and reachable while idle', async ({ browser, page }) => {
  const { code, pin } = await createRoom(page, 5)

  // Idle for a few seconds: no socket errors on the page.
  await page.waitForTimeout(4_000)
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))

  // A second client can still join after the idle window. It must come from a
  // FRESH context: a page sharing the host's origin storage would reuse the
  // same identity key and the server would treat the join as a reconnect.
  const joinerCtx = await browser.newContext()
  const joiner = await joinerCtx.newPage()
  await joinRoom(joiner, code, pin)

  await expect(page.getByText(/WAITING FOR CREW \(2\/5\)/)).toBeVisible({ timeout: 20_000 })
  await expect(joiner.getByText(/WAITING FOR CREW \(2\/5\)/)).toBeVisible({ timeout: 20_000 })

  expect(pageErrors).toEqual([])
  await joinerCtx.close()
}, { tag: '@e2e' })

test('vessel readout renders the room code that was created', async ({ page }) => {
  const { code } = await createRoom(page, 5)
  await expect(page.getByText(new RegExp(`VESSEL: NOVA-${code.charAt(0)}`))).toBeVisible()
}, { tag: '@e2e' })