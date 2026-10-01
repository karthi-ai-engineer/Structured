import { expect, test } from '@playwright/test'

test('phone layout: bottom tabs, add button and a bottom-sheet editor', async ({ page }) => {
  const title = `__test__ Phone ${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Main' }).last()
  await expect(tabs.getByRole('link', { name: 'Inbox' })).toBeVisible()

  await page.getByRole('button', { name: 'New task', exact: true }).last().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // Once its slide-up animation settles, the sheet hugs the bottom edge of the screen.
  const viewport = page.viewportSize()
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox()
      return box && viewport ? Math.abs(box.y + box.height - viewport.height) : Infinity
    })
    .toBeLessThan(1)

  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await page.getByRole('button', { name: `Open ${title}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(title)).toHaveCount(0)

  await tabs.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
})

test('phone: long-press and drag moves a task; a quick swipe does not', async ({ page }) => {
  const title = `__test__ Touch ${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/day/2099-06-02')
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'New task', exact: true }).last().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByLabel('Start').fill('10:00')
  const created = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/tasks') && r.request().method() === 'POST' && r.ok(),
  )
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await created
  const row = page.getByRole('listitem').filter({ hasText: title })
  const pill = row.getByRole('button', { name: `Open ${title}` }).first()
  const box = await pill.boundingBox()
  if (!box) throw new Error('no pill')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const touch = (type: string, clientY: number) =>
    pill.dispatchEvent(type, {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x,
      clientY,
    })

  // A quick swipe (moving before the long press) scrolls: nothing moves.
  await touch('pointerdown', y)
  await touch('pointermove', y + 20)
  await touch('pointermove', y + 45)
  await touch('pointerup', y + 45)
  await expect(row).toContainText(/10:00/)

  // Long press, then drag 45 px: the task moves to 10:45.
  const moved = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/tasks') && r.request().method() === 'PATCH' && r.ok(),
  )
  await touch('pointerdown', y)
  await page.waitForTimeout(500)
  await touch('pointermove', y + 20)
  await touch('pointermove', y + 45)
  await touch('pointerup', y + 45)
  await moved
  await expect(row).toContainText(/10:45/)
  await expect(dialog).toHaveCount(0) // the drag did not also open the editor

  // A touch drag ends without a click: the next tap must still open the task.
  await pill.tap()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Title')).toHaveValue(title)
})
