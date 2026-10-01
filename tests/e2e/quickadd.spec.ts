import { expect, test, type Page } from '@playwright/test'

// Letters only, so the random part never reads as a time or a duration.
const uid = () =>
  Array.from(
    { length: 6 },
    () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)],
  ).join('')

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

async function openDay(page: Page, date: string) {
  await page.goto(`/day/${date}`)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
}

test('quick add, suggestions, undo, duplicate and search', async ({ page }) => {
  const key = uid()
  const title = `__test__ Gym ${key}`
  const row = () => page.getByRole('listitem').filter({ hasText: title })

  // Quick add in the inbox panel: the syntax schedules it, and "Gym" suggests an orange dumbbell.
  await openDay(page, '2099-09-07')
  const inbox = page.getByRole('complementary').getByLabel('Add to inbox')
  const created = saved(page, title)
  await inbox.fill(`${title} 2099-09-07 7am 1h !high`)
  await inbox.press('Enter')
  await created
  await expect(row()).toContainText(/7:00/)
  await expect(row()).toContainText('(1h)')
  await expect(row().getByLabel('High priority')).toBeVisible()
  await expect(
    row()
      .getByRole('button', { name: `Open ${title}` })
      .first(),
  ).toHaveCSS('background-color', 'rgb(255, 159, 67)')

  // Delete, then undo.
  await row()
    .getByRole('button', { name: `Open ${title}` })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  const deleted = saved(page, 'deleted_at')
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await deleted
  await expect(row()).toHaveCount(0)
  const restored = saved(page, 'deleted_at')
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
  await restored
  await expect(row()).toHaveCount(1)

  // Duplicate to the next day.
  await row()
    .getByRole('button', { name: `Open ${title}` })
    .first()
    .click()
  await dialog.getByRole('button', { name: 'Duplicate' }).click()
  await expect(dialog.getByLabel('Title')).toHaveValue(title)
  await dialog.getByLabel('Date', { exact: true }).fill('2099-09-08')
  const copied = saved(page, '2099-09-08')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await copied
  await openDay(page, '2099-09-08')
  await expect(row()).toHaveCount(1)

  // Search finds both, and opens one.
  await page.goto('/search')
  await page.getByLabel('Search tasks').fill(key)
  const results = page.getByRole('list', { name: 'Results' }).getByRole('button')
  await expect(results).toHaveCount(2)
  await results.first().click()
  await expect(dialog.getByLabel('Title')).toHaveValue(title)
})
