import { Page, Locator } from '@playwright/test'

export type CreatedRoom = { code: string; pin: string }

const roomCodeRegex = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/

/** Wait for the LOBBY header ("WAITING FOR CREW (n/m)/COMMENCE"). */
export async function waitForLobby(page: Page): Promise<void> {
  await page
    .getByText(/WAITING FOR CREW|COMMENCE/)
    .first()
    .waitFor({ timeout: 20_000 })
}

/** Create a room with the given max players via the CREATE PRIVATE ROOM flow. */
export async function createRoom(page: Page, participants = 5): Promise<CreatedRoom> {
  await page.goto('/')
  await page.getByText('// CREATE PRIVATE ROOM').click()
  await page.getByText('CREATE A ROOM').waitFor()

  if (participants !== 5) {
    await setSlider(page.locator('input[type="range"]'), participants)
    await page.getByText(String(participants)).first().waitFor()
  }

  const chars = await page.locator('.code-char').allTextContents()
  const code = chars.join('')
  if (!roomCodeRegex.test(code)) throw new Error(`unexpected room code serialized: ${code}`)

  const pin = await page.locator('.pin-input').inputValue()

  await page.locator('.btn-save').click()
  await waitForLobby(page)
  return { code, pin }
}

/** Join an existing room from the JOIN form. */
export async function joinRoom(page: Page, code: string, pin: string): Promise<void> {
  await page.goto('/')
  await page.getByText(/ENTER THE SHIP/).click()

  const inputs = page.locator('form input.pin-input')
  await inputs.nth(0).fill(code)
  await inputs.nth(1).fill(pin)
  await page.getByRole('button', { name: 'Enter Ship' }).click()
}

/** Fill the lobby with dev bots up to max capacity. */
export async function fillBots(page: Page): Promise<void> {
  await page.getByText(/FILL BOTS/).click()
  // Bots join asynchronously; the COMMENCE button appears at full capacity.
  await page.getByText('COMMENCE').waitFor({ timeout: 20_000 })
}

/** Drive a React controlled <input type="range"> to a value. */
async function setSlider(slider: Locator, value: number): Promise<void> {
  await slider.evaluate((el, v) => {
    const proto = (el as HTMLInputElement).form
      ? HTMLInputElement.prototype
      : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
    setter.call(el, String(v))
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}