import { expect, test, type Page } from '@playwright/test'

const uid = () => Math.random().toString(36).slice(2, 8)

async function openNewTask(page: Page) {
  await page.getByRole('button', { name: 'New task' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/** Resolves once the database has confirmed a task write (the UI updates before that). */
function saved(page: Page, column: string) {
  return page.waitForResponse(
    (r) =>
      r.url().includes('/rest/v1/tasks') &&
      r.request().method() !== 'GET' &&
      (r.request().postData() ?? '').includes(column) &&
      r.ok(),
  )
}

/** Reloads and waits until the day's tasks have loaded (not just the skeleton). */
async function reloadLoaded(page: Page) {
  await page.reload()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
}

async function deleteTask(page: Page, title: string) {
  await page.getByRole('button', { name: `Open ${title}` }).click()
  const done = saved(page, 'deleted_at')
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(title)).toHaveCount(0)
  await done
  await page.waitForLoadState('networkidle')
}

test.describe('planner', () => {
  test('create, edit, complete and delete a timed task', async ({ page }) => {
    const title = `__test__ Deep work ${uid()}`
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await openNewTask(page)
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Title').fill(title)
    await dialog.getByLabel('Start').fill('09:30')
    await dialog.getByRole('button', { name: '45m' }).click()
    await dialog.getByRole('button', { name: 'Color blue' }).click()
    await dialog.getByLabel('New subtask').fill('Outline')
    await dialog.getByLabel('New subtask').press('Enter')
    const created = saved(page, title)
    await dialog.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // On the timeline with its time range and subtask count; survives a reload (saved).
    const row = page.getByRole('listitem').filter({ hasText: title })
    await expect(row).toContainText('09:30 – 10:15 (45m)')
    await expect(row).toContainText('0/1 subtasks')
    await created
    await page.waitForLoadState('networkidle')
    await reloadLoaded(page)
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()

    // Edit: move to 11:00.
    await page.getByRole('button', { name: `Open ${title}` }).click()
    await page.getByRole('dialog').getByLabel('Start').fill('11:00')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText(
      '11:00 – 11:45',
    )

    // Complete, then undo.
    const check = page.getByRole('checkbox', { name: `Mark done: ${title}` })
    await check.click()
    await expect(page.getByRole('checkbox', { name: `Mark not done: ${title}` })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.getByRole('checkbox', { name: `Mark not done: ${title}` }).click()
    await expect(page.getByRole('checkbox', { name: `Mark done: ${title}` })).toBeVisible()

    await deleteTask(page, title)
    await reloadLoaded(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(title)).toHaveCount(0)
  })

  test('inbox quick add, then schedule for today', async ({ page }) => {
    const title = `__test__ Idea ${uid()}`
    await page.goto('/inbox')
    await page.getByLabel('Add to inbox').first().fill(title)
    await page.getByLabel('Add to inbox').first().press('Enter')
    const inbox = page.getByRole('list', { name: 'Inbox' }).first()
    await expect(inbox.getByText(title)).toBeVisible()

    await page
      .getByRole('button', { name: `Schedule for today: ${title}` })
      .first()
      .click()
    await expect(inbox.getByText(title)).toHaveCount(0)

    await page.getByRole('link', { name: 'Timeline' }).first().click()
    await expect(page.getByRole('button', { name: `Open ${title}` })).toBeVisible()
    await deleteTask(page, title)
  })

  test('all-day task sits in the all-day row', async ({ page }) => {
    const title = `__test__ Birthday ${uid()}`
    await page.goto('/')
    await openNewTask(page)
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Title').fill(title)
    await dialog.getByRole('switch', { name: 'All day' }).click()
    await dialog.getByRole('button', { name: 'Add task' }).click()
    const row = page.getByRole('region', { name: 'All-day tasks' })
    await expect(row.getByText(title)).toBeVisible()
    await row.getByText(title).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText(title)).toHaveCount(0)
  })

  test('editor edge cases from code review', async ({ page }) => {
    const title = `__test__ Edge ${uid()}`
    await page.goto('/day/2026-10-05')
    await openNewTask(page)
    const d = page.getByRole('dialog')
    await d.getByLabel('Title').fill(title)

    // Clearing the date field mid-edit keeps the task scheduled on its date.
    await d.getByLabel('Date').fill('')
    await expect(d.getByRole('switch', { name: 'Scheduled' })).toBeChecked()
    await expect(d.getByLabel('Date')).toHaveValue('2026-10-05')

    // A cleared start time blocks saving: no timed task without a time.
    await d.getByLabel('Start').fill('')
    await expect(d.getByText('Pick a start time or turn on All day')).toBeVisible()
    await expect(d.getByRole('button', { name: 'Add task' })).toBeDisabled()
    await d.getByLabel('Start').fill('10:00')

    // An emptied custom duration blocks saving instead of becoming 0 minutes.
    await d.getByLabel('Custom duration in minutes').fill('')
    await expect(d.getByRole('button', { name: 'Add task' })).toBeDisabled()
    await d.getByLabel('Custom duration in minutes').fill('50')
    const created = saved(page, title)
    await d.getByRole('button', { name: 'Add task' }).click()
    await created
    await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText(
      '10:00 – 10:50 (50m)',
    )

    // Completed, then unscheduled: it reopens in the inbox instead of vanishing.
    const done = saved(page, 'completed_at')
    await page.getByRole('checkbox', { name: `Mark done: ${title}` }).click()
    await done
    await page.getByRole('button', { name: `Open ${title}` }).click()
    await page.getByRole('dialog').getByRole('switch', { name: 'Scheduled' }).click()
    const moved = saved(page, 'date')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await moved
    await page.goto('/inbox')
    const inbox = page.getByRole('list', { name: 'Inbox' })
    await expect(inbox.getByText(title)).toBeVisible()

    // The row's title button comes before its 'Schedule for today' and check buttons.
    await inbox.getByRole('button', { name: title }).first().click()
    const gone = saved(page, 'deleted_at')
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await gone
  })

  test('week strip and keyboard navigation', async ({ page }) => {
    await page.goto('/day/2026-10-01')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('October 2026')
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/day\/2026-10-02$/)
    await page.getByRole('button', { name: 'Next week' }).click()
    await expect(page).toHaveURL(/\/day\/2026-10-09$/)
    await page.getByRole('button', { name: 'Today' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('an edit in one window appears in another without reloading (realtime)', async ({
    context,
  }) => {
    const title = `__test__ Sync ${uid()}`
    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto('/')
    await b.goto('/')
    await expect(a.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(b.getByRole('heading', { level: 1 })).toBeVisible()
    // Let window A's realtime channel finish subscribing.
    await a.waitForTimeout(1_500)

    await openNewTask(b)
    await b.getByRole('dialog').getByLabel('Title').fill(title)
    await b.getByRole('dialog').getByRole('button', { name: 'Add task' }).click()

    await expect(a.getByRole('button', { name: `Open ${title}` })).toBeVisible({ timeout: 5_000 })

    await deleteTask(b, title)
    await expect(a.getByText(title)).toHaveCount(0, { timeout: 5_000 })
    await a.close()
    await b.close()
  })

  test('settings: 12-hour clock and dark theme apply instantly', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('radio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('radio', { name: 'System' }).click()

    await page.getByRole('radio', { name: '12h' }).click()
    await page.goto('/')
    await openNewTask(page)
    const title = `__test__ Clock ${uid()}`
    await page.getByRole('dialog').getByLabel('Title').fill(title)
    await page.getByRole('dialog').getByLabel('Start').fill('14:30')
    await page.getByRole('dialog').getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText('2:30 PM')
    await deleteTask(page, title)

    await page.goto('/settings')
    await page.getByRole('radio', { name: '24h' }).click()
    await expect(page.getByRole('radio', { name: '24h' })).toHaveAttribute('aria-checked', 'true')

    // Option groups work with the arrow keys (one tab stop, roving focus).
    await page.getByRole('radio', { name: '24h' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: '12h' })).toBeFocused()
    await expect(page.getByRole('radio', { name: '12h' })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('radio', { name: '24h' })).toHaveAttribute('aria-checked', 'true')
  })

  test('settings: day hours save once, on blur', async ({ page }) => {
    await page.goto('/settings')
    const start = page.getByLabel('Day starts')
    const original = await start.inputValue()
    const writes: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/settings') && r.method() === 'PATCH')
        writes.push(r.postData() ?? '')
    })

    await start.fill('06:45')
    expect(writes).toHaveLength(0) // nothing saved while typing
    const savedStart = page.waitForResponse(
      (r) => r.url().includes('/rest/v1/settings') && r.request().method() === 'PATCH',
    )
    await start.press('Enter')
    await savedStart
    expect(writes).toHaveLength(1)
    await reloadLoaded(page)
    await expect(page.getByLabel('Day starts')).toHaveValue('06:45')

    // Restore the owner's value.
    const restored = page.waitForResponse(
      (r) => r.url().includes('/rest/v1/settings') && r.request().method() === 'PATCH',
    )
    await page.getByLabel('Day starts').fill(original)
    await page.getByLabel('Day starts').press('Enter')
    await restored
  })
})
