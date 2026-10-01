import { expect, test } from '@playwright/test'

test('installable, and today opens offline with the data seen last', async ({ page, context }) => {
  // The manifest is linked and lists the icons an install needs.
  await page.goto('/')
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    return link ? ((await (await fetch(link.href)).json()) as { icons: { sizes: string }[] }) : null
  })
  expect(manifest?.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  )

  // The service worker takes control; a load then fills its caches.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  const heading = await page.getByRole('heading', { level: 1 }).textContent()
  const online = await page
    .getByRole('list', { name: 'Timeline' })
    .getByRole('listitem')
    .allTextContents()

  // Offline: the same page, with the same tasks, from the caches.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading ?? '')
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  const offline = await page
    .getByRole('list', { name: 'Timeline' })
    .getByRole('listitem')
    .allTextContents()
  // Free-time rows depend on the clock; the task rows must be identical.
  const taskRows = (rows: string[]) => rows.filter((r) => !r.includes('free'))
  expect(taskRows(online).length).toBeGreaterThan(0)
  expect(taskRows(offline)).toEqual(taskRows(online))
  await context.setOffline(false)
})
