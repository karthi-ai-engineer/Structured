import { expect, test, type Page } from '@playwright/test'

const uid = () => Math.random().toString(36).slice(2, 8)

/** Resolves once the database has confirmed a task write whose body contains `text`. */
function saved(page: Page, text: string) {
  return page.waitForResponse(
    (r) =>
      r.url().includes('/rest/v1/tasks') &&
      r.request().method() !== 'GET' &&
      (r.request().postData() ?? '').includes(text) &&
      r.ok(),
  )
}

/** The app's "now" (in the user's time zone, read from Settings) for a fake instant. */
async function localNow(page: Page, instant: Date): Promise<{ date: string; time: string }> {
  await page.goto('/settings')
  const tz = await page.locator('#set-tz').inputValue()
  return page.evaluate(
    ([iso, zone]) => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(new Date(iso))
          .map((p) => [p.type, p.value]),
      )
      return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}`,
      }
    },
    [instant.toISOString(), tz] as const,
  )
}

function plusMinutes(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

test('energy, an alert at the start, and a focus session with intervals', async ({ page }) => {
  // A fake clock: alerts and the focus timer run on it. 03:00 UTC is mid-day in Asia and
  // early morning in Europe, never close to midnight in common zones.
  const instant = new Date('2099-08-03T03:00:00Z')
  await page.clock.install({ time: instant })
  const now = await localNow(page, instant)
  const title = `__test__ Focus ${uid()}`
  const start = plusMinutes(now.time, 2)

  await page.goto(`/day/${now.date}`)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'New task' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByLabel('Start').fill(start)
  await dialog.getByRole('button', { name: '1h', exact: true }).click()
  // Energy: draining (2 points × 2 half hours).
  await dialog.getByRole('button', { name: 'Energy: Draining' }).click()
  // Alerts: exactly "At start".
  const alerts = dialog
    .getByRole('group', { name: /Alerts/ })
    .or(dialog.locator('fieldset', { hasText: 'Alerts' }))
  for (const chip of await alerts.getByRole('button', { pressed: true }).all()) {
    if ((await chip.textContent()) !== 'At start') await chip.click()
  }
  const atStart = alerts.getByRole('button', { name: 'At start' })
  if ((await atStart.getAttribute('aria-pressed')) !== 'true') await atStart.click()
  const created = saved(page, title)
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await created

  // The day's energy includes the task's 4 points.
  await expect(page.getByRole('status', { name: /^Energy \d+ of \d+/ })).toBeVisible()
  const energy = await page.getByRole('status', { name: /^Energy/ }).getAttribute('aria-label')
  expect(Number(/Energy (\d+)/.exec(energy ?? '')?.[1])).toBeGreaterThanOrEqual(4)

  // Two and a half minutes later the alert fires (in the app: no notification permission here).
  await page.clock.fastForward('02:30')
  await expect(page.getByText(`"${title}" starts now`)).toBeVisible()

  // The task is running now: focus on it.
  await page.getByRole('link', { name: `Focus on ${title}` }).click()
  const focus = page.getByRole('dialog', { name: `Focus: ${title}` })
  await expect(focus).toBeVisible()
  await expect(focus.getByRole('timer')).toHaveText(/^2\d:\d\d$/) // about 25 minutes left
  await expect(focus).toContainText('Interval 1 of 2')

  // Pause stops the clock; resume continues it.
  await focus.getByRole('button', { name: 'Pause' }).click()
  const paused = await focus.getByRole('timer').textContent()
  await page.clock.fastForward('01:00')
  await expect(focus.getByRole('timer')).toHaveText(paused ?? '')
  await focus.getByRole('button', { name: 'Resume' }).click()

  // After the first interval comes the break; skip it.
  await page.clock.fastForward('26:00')
  await expect(focus).toContainText('Break')
  await focus.getByRole('button', { name: 'Skip break' }).click()
  await expect(focus).toContainText('Interval 2 of 2')

  // Mark done ends focus and completes the task.
  const done = saved(page, 'completed_at')
  await focus.getByRole('button', { name: 'Mark done' }).click()
  await done
  await expect(focus).toHaveCount(0)
})
