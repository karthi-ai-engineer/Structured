import { expect, test, type Page } from '@playwright/test'

// Far-future days, so the test never mixes with real plans. 2099-05-04 is a Monday.
const DAY1 = '2099-05-04'
const DAY2 = '2099-05-05'
const DAY3 = '2099-05-06'

/** Resolves once the database has confirmed a task write whose body contains `text`. */
function saved(page: Page, text: string) {
  return page.waitForResponse(
    (r) =>
      /\/rest\/v1\/(tasks|rpc\/)/.test(r.url()) &&
      r.request().method() !== 'GET' &&
      (r.request().postData() ?? '').includes(text) &&
      r.ok(),
  )
}

async function openDay(page: Page, date: string) {
  await page.goto(`/day/${date}`)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
}

test('repeating task: create, complete one day, edit one day, delete all', async ({ page }) => {
  const title = `__test__ Daily ${Math.random().toString(36).slice(2, 8)}`
  const row = (name = title) => page.getByRole('button', { name: `Open ${name}` }).first()

  // Create: every day at 08:00, starting on DAY1.
  await openDay(page, DAY1)
  await page.getByRole('button', { name: 'New task' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByLabel('Start').fill('08:00')
  await dialog.getByLabel('Repeat').selectOption('daily')
  await expect(dialog.getByRole('paragraph').filter({ hasText: /^Every day$/ })).toBeVisible()
  // A repeating task stays scheduled.
  await expect(dialog.getByLabel('Scheduled')).toBeDisabled()
  const created = saved(page, 'FREQ=DAILY')
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await created
  await expect(row()).toBeVisible()

  // It shows on the next days too, marked as repeating.
  await openDay(page, DAY2)
  await expect(row()).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: title }).getByLabel('Repeats'),
  ).toBeVisible()

  // Complete only DAY2's occurrence: it survives a reload, DAY3's stays open.
  const completed = saved(page, 'occurrence_date')
  await page.getByRole('checkbox', { name: `Mark done: ${title}` }).click()
  await completed
  await openDay(page, DAY2)
  await expect(page.getByRole('checkbox', { name: `Mark not done: ${title}` })).toBeVisible()
  await openDay(page, DAY3)
  await expect(page.getByRole('checkbox', { name: `Mark done: ${title}` })).toBeVisible()

  // Edit only DAY3's occurrence: it moves to 09:15, DAY1 keeps 08:00.
  await row().click()
  await dialog.getByLabel('Start').fill('09:15')
  await dialog.getByRole('button', { name: 'Save' }).click()
  const scopes = dialog.getByRole('group', { name: 'Save the repeating task' })
  await expect(scopes.getByRole('button')).toHaveText([
    'This task only',
    'This and future tasks',
    'All tasks',
    'Cancel',
  ])
  const edited = saved(page, '09:15')
  await scopes.getByRole('button', { name: 'This task only' }).click()
  await edited
  await openDay(page, DAY3)
  await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText(/9:15/) // 12 h or 24 h, per settings
  await openDay(page, DAY1)
  await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText(/8:00/)

  // Delete all: gone from every day, including the completed and the edited occurrence.
  await row().click()
  await dialog.getByRole('button', { name: 'Delete' }).click()
  const removed = saved(page, 'deleted_at')
  await dialog
    .getByRole('group', { name: 'Delete the repeating task' })
    .getByRole('button', { name: 'All tasks' })
    .click()
  await removed
  await expect(row()).toHaveCount(0)
  for (const date of [DAY2, DAY3]) {
    await openDay(page, date)
    await expect(page.getByText(title)).toHaveCount(0)
  }
})
