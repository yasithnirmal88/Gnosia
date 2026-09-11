import { test, expect } from '@playwright/test'
import { createRoom, fillBots } from '../helpers'

/**
 * Full crew: a 15-player room launched from the UI, filled by dev bots up to
 * max capacity, then commenced into INTRO. Verifies real STOMP fan-out to a
 * browser client and the phase transition to INTRO ("LEVI COMMUNICATING...").
 */
test('15-player room fills to capacity and commences into INTRO', async ({ page }) => {
  await createRoom(page, 15)

  // Bot roster joins asynchronously from the real frontend code path.
  await fillBots(page)

  await page.getByText('COMMENCE').click()

  // INTRO phase badge renders once the server broadcasts the new phase.
  await page.getByText('LEVI COMMUNICATING...').waitFor({ timeout: 30_000 })

  // Crew readout reflects the full 15-player roster.
  await expect(page.getByText(/CREW: 15/)).toBeVisible()
}, { tag: '@e2e' })

test('host start is gated until the crew is ready', async ({ page }) => {
  await createRoom(page, 15)

  // Default game size is 5; a fresh 15-max lobby is not yet full.
  await expect(page.getByText(/WAITING FOR CREW \(1\/15\)/)).toBeVisible()

  // The departure button exists in the host's roster panel but is not
  // actionable until the vessel is full (or min crew is boarded and ready).
  await expect(page.getByText('COMMENCE')).toBeDisabled()

  await fillBots(page)
  await expect(page.getByText(/CREW: 15/)).toBeVisible()
  await expect(page.getByText('COMMENCE')).toBeEnabled()
}, { tag: '@e2e' })