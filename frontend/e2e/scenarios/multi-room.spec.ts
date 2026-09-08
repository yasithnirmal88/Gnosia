import { test, expect } from '@playwright/test'
import { createRoom, fillBots } from '../helpers'

/**
 * Room isolation across two independent browser contexts: two rooms coexist,
 * and starting one does not disturb the other's lobby or state.
 */
test('two rooms operate in isolation', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  const roomA = await createRoom(pageA, 5)
  const roomB = await createRoom(pageB, 5)

  expect(roomA.code).not.toBe(roomB.code)

  // Each lobby shows only its own crew.
  await expect(pageA.getByText(new RegExp(`WAITING FOR CREW \\(1/5\\)`))).toBeVisible()
  await expect(pageB.getByText(new RegExp(`WAITING FOR CREW \\(1/5\\)`))).toBeVisible()

  // Launch room A at full capacity; room B must stay untouched.
  await fillBots(pageA)
  await pageA.getByText('COMMENCE').click()
  await pageA.getByText('LEVI COMMUNICATING...').waitFor({ timeout: 30_000 })

  await expect(pageB.getByText(/WAITING FOR CREW \(1\/5\)/)).toBeVisible()
  await expect(pageB.getByText('LEVI COMMUNICATING...')).toHaveCount(0)

  await ctxA.close()
  await ctxB.close()
}, { tag: '@e2e' })

test('a removed room takes no other room down with it', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  await createRoom(pageA, 5)
  await createRoom(pageB, 5)

  // Reload closes the browser STOMP socket; the abandoned room A becomes
  // eligible for cleanup while room B continues normally.
  await pageA.reload()
  await expect(pageB.getByText(/WAITING FOR CREW \(1\/5\)/)).toBeVisible()

  await ctxA.close()
  await ctxB.close()
}, { tag: '@e2e' })