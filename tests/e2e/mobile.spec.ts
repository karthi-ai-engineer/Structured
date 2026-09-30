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
