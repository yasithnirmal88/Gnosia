import { test } from '@playwright/test'

/**
 * GAME_OVER end-to-end: the full 15-player cycle through DISCUSSION/VOTING/
 * CRYOSLEEP/WARP/... to a concrete winner is exercised at backend scope by
 * `LargeGameIntegrationTest` (two scenarios, human + gnosia wins) because
 * production phase timers are measured in minutes (GameConfig: DISCUSSION
 * 180-300s, VOTING 60s, WARP 90s), which is infeasible for a wall-clock
 * browser test.
 *
 * To run this scenario against a shortened-timer backend, launch the backend
 * with a dev-only timer override (e.g. a -Dspring-boot.run.jvmArguments flag
 * that shortens GameConfig durations) and re-enable the body below:
 *
 *   test('crews reach GAME_OVER and see the winning overlay', async ({ page }) => {
 *     const { code, pin } = await createRoom(page, 5)
 *     await fillBots(page)
 *     await page.getByText('COMMENCE').click()
 *     // Drive voting per round via the UI (vote payloads through STOMP),
 *     // then assert on `.game-over-overlay` + `.victory-title` text.
 *   })
 */
test('GAME_OVER overlay (requires shortened backend timers)', () => {
  test.skip(
    true,
    'Driving a full game through production 180-300s phase timers is impractical; ' +
      'covered at backend scale by LargeGameIntegrationTest. See the comment above ' +
      'for the shortened-timer launch instructions.',
  )
})