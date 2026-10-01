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

async function loaded(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
}

async function addTask(page: Page, title: string, date: string, start: string) {
  await page.getByRole('button', { name: 'New task' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByLabel('Date').fill(date)
  await dialog.getByLabel('Start').fill(start)
  const created = saved(page, title)
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await created
}

test('week and month views show the plan and lead back to a day', async ({ page }) => {
  const title = `__test__ Week ${uid()}`
  await page.goto('/day/2099-07-15')
  await loaded(page)
  await addTask(page, title, '2099-07-15', '14:00')

  // Day → Week through the view switch.
  await page
    .getByRole('navigation', { name: 'Calendar view' })
    .getByRole('link', { name: 'Week' })
    .click()
  await expect(page).toHaveURL(/\/week\/2099-07-15$/)
  await loaded(page)
  const day = page.getByRole('listitem', { name: /15 July/ })
  await expect(day).toContainText(title)
  // Complete it from the week.
  const done = saved(page, 'completed_at')
  await day.getByRole('checkbox', { name: `Mark done: ${title}` }).click()
  await done
  await expect(day.getByRole('checkbox', { name: `Mark not done: ${title}` })).toBeVisible()
  // Next week no longer shows it.
  await page.getByRole('button', { name: 'Next week' }).click()
  await loaded(page)
  await expect(page.getByText(title)).toHaveCount(0)

  // Month: the day cell lists it and opens the day.
  await page.goto('/month/2099-07')
  await loaded(page)
  const cell = page.getByRole('link', { name: /15 July/ })
  await expect(cell).toContainText(title)
  await cell.click()
  await expect(page).toHaveURL(/\/day\/2099-07-15$/)
  await expect(page.getByRole('button', { name: `Open ${title}` }).first()).toBeVisible()
})

test('replan: an unfinished task from yesterday moves to today', async ({ page }) => {
  const title = `__test__ Late ${uid()}`
  await page.goto('/')
  await loaded(page)
  const today = await page.evaluate(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  })
  const yesterday = await page.evaluate((d) => {
    const dt = new Date(`${d}T12:00:00`)
    dt.setDate(dt.getDate() - 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  }, today)
  await addTask(page, title, yesterday, '09:00')

  // Today shows the banner; the Replan screen lists the task.
  await page.goto('/')
  await loaded(page)
  await page.getByRole('link', { name: /unfinished task/ }).click()
  await expect(page).toHaveURL(/\/replan$/)
  await loaded(page)
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toBeVisible()

  const moved = saved(page, '"date"')
  await row.getByRole('button', { name: 'Today' }).click()
  await moved
  await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0)
  await page.goto('/')
  await loaded(page)
  await expect(page.getByRole('button', { name: `Open ${title}` }).first()).toBeVisible()
})
