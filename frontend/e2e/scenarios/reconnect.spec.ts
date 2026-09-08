import { test, expect } from '@playwright/test'
import { createRoom, joinRoom } from '../helpers'

/**
 * Reconnect recovery: a joined client that reloads the page re-enters the same
 * room with the same PIN and lands back in the LOBBY with its player slot
 * intact (server-side identity reuse on the reconnect grace window).
 */
test('reload + rejoin restores the same room state', async ({ page }) => {
  const { code, pin } = await createRoom(page, 5)

  // Simulate a dropped connection (full page reload tears down the STOMP
  // socket; the browser localStorage keeps the room code).
  await page.reload()
  await page.getByText(/ENTER THE SHIP/).click()

  const inputs = page.locator('form input.pin-input')
  await inputs.nth(0).fill(code)
  await inputs.nth(1).fill(pin)
  await page.getByRole('button', { name: 'Enter Ship' }).click()

  await page.getByText(/WAITING FOR CREW \(1\/5\)/).waitFor({ timeout: 20_000 })
  await expect(page.getByText(/VESSEL: NOVA-/)).toBeVisible()
}, { tag: '@e2e' })

test('joining a live room from a second browser sees the existing crew', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  const { code, pin } = await createRoom(pageA, 5)

  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await joinRoom(pageB, code, pin)

  // Host's lobby now shows 2 players.
  await pageA.getByText(/WAITING FOR CREW \(2\/5\)/).waitFor({ timeout: 20_000 })
  // Joiner's own view agrees.
  await pageB.getByText(/WAITING FOR CREW \(2\/5\)/).waitFor({ timeout: 20_000 })

  await ctxA.close()
  await ctxB.close()
}, { tag: '@e2e' })