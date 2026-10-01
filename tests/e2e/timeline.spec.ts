import { expect, test, type Locator, type Page } from '@playwright/test'

const DAY = '2099-06-01' // far future: never mixes with real plans
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

/** A mouse drag straight down (or up, for a negative distance). */
async function dragBy(page: Page, target: Locator, dy: number) {
  const box = await target.boundingBox()
  if (!box) throw new Error('nothing to drag')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + Math.sign(dy) * 8, { steps: 2 })
  await page.mouse.move(x, y + dy, { steps: 12 })
  await page.mouse.up()
}

test('free time, overlaps, drag to move and resize, inbox to timeline', async ({ page }) => {
  const a = `__test__ A ${uid()}`
  const b = `__test__ B ${uid()}`
  const c = `__test__ C ${uid()}`
  const row = (title: string) => page.getByRole('listitem').filter({ hasText: title })
  const dialog = page.getByRole('dialog')

  await page.goto(`/day/${DAY}`)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)

  // A at 10:00 for an hour.
  await page.getByRole('button', { name: 'New task' }).first().click()
  await dialog.getByLabel('Title').fill(a)
  await dialog.getByLabel('Start').fill('10:00')
  await dialog.getByRole('button', { name: '1h', exact: true }).click()
  const createdA = saved(page, a)
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await createdA

  // The free time after A opens the editor at 11:00.
  await page.getByRole('button', { name: /^Add a task at 11:00/ }).click()
  await expect(dialog.getByLabel('Start')).toHaveValue('11:00')
  await dialog.getByLabel('Title').fill(b)
  await dialog.getByRole('button', { name: '30m', exact: true }).click()
  // Moved into A, the editor warns (without blocking).
  await dialog.getByLabel('Start').fill('10:30')
  await expect(dialog.getByRole('list', { name: 'Warnings' })).toContainText(`Overlaps "${a}"`)
  const createdB = saved(page, b)
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await createdB
  await expect(row(a).getByLabel('Overlaps another task')).toBeVisible()
  await expect(row(b).getByLabel('Overlaps another task')).toBeVisible()

  // Drag B down an hour: 11:30, no longer overlapping.
  const moved = saved(page, 'start_time')
  await dragBy(
    page,
    row(b)
      .getByRole('button', { name: `Open ${b}` })
      .first(),
    60,
  )
  await moved
  await expect(row(b)).toContainText(/11:30/)
  await expect(page.getByLabel('Overlaps another task')).toHaveCount(0)

  // Drag A's bottom edge down 30 minutes: 1h 30m, ending exactly when B starts.
  const resized = saved(page, 'duration_min')
  await dragBy(page, row(a).getByTitle('Drag to change the duration'), 30)
  await resized
  await expect(row(a)).toContainText('(1h 30m)')
  await expect(page.getByLabel('Overlaps another task')).toHaveCount(0)

  // After drags, a plain click still opens the task.
  await row(b)
    .getByRole('button', { name: `Open ${b}` })
    .first()
    .click()
  await expect(dialog.getByLabel('Title')).toHaveValue(b)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // Desktop: drag an inbox task onto the free time after B.
  const inbox = page.getByRole('complementary').getByLabel('Add to inbox')
  const createdC = saved(page, c)
  await inbox.fill(c)
  await inbox.press('Enter')
  await createdC
  const scheduled = saved(page, '"date"')
  await page
    .getByRole('complementary')
    .getByRole('listitem')
    .filter({ hasText: c })
    .dragTo(page.getByRole('button', { name: /^Add a task at 12:00/ }))
  await scheduled
  await expect(row(c)).toContainText(/12:00/)

  // Everything survives a reload.
  await page.reload()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await expect(row(a)).toContainText('(1h 30m)')
  await expect(row(b)).toContainText(/11:30/)
  await expect(row(c)).toContainText(/12:00/)
})
