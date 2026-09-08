import { test, expect } from '@playwright/test'
import { createRoom, joinRoom } from '../helpers'

/**
 * Authentication hardening: the server must reject a wrong PIN (authenticated
 * identity binding) and an unknown vessel code, and the client must surface
 * the rejection in the JOIN form instead of silently proceeding.
 */
test('wrong PIN is rejected with an auth error', async ({ page }) => {
  const { code } = await createRoom(page, 5)

  const badPin = '0000'
  await joinRoom(page, code, badPin)

  await page.getByText(/AUTH ERROR/).waitFor({ timeout: 20_000 })
  // Stay on the join form: no transition to a game screen.
  await expect(page.getByRole('button', { name: 'Enter Ship' })).toBeVisible()
})

test('unknown room code is rejected', async ({ page }) => {
  await page.goto('/')
  await page.getByText(/ENTER THE SHIP/).click()

  const inputs = page.locator('form input.pin-input')
  await inputs.nth(0).fill('ZZZZZZ')
  await inputs.nth(1).fill('1234')
  await page.getByRole('button', { name: 'Enter Ship' }).click()

  await page.getByText(/AUTH ERROR/).waitFor({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Enter Ship' })).toBeVisible()
}, { tag: '@e2e' })

test('a legitimate pin from one room cannot enter a different room', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  const { pin: pinA } = await createRoom(pageA, 5)

  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  const { code: codeB } = await createRoom(pageB, 5)

  // B's pin used against B's code where the pin belongs to A — rejected.
  await joinRoom(pageB, codeB, pinA)
  await pageB.getByText(/AUTH ERROR/).waitFor({ timeout: 20_000 })

  // Meanwhile the legitimate room A session is unaffected by the rejected attempt.
  await pageA.getByText(/WAITING FOR CREW/).waitFor({ timeout: 20_000 })

  await ctxA.close()
  await ctxB.close()
}, { tag: '@e2e' })