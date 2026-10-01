import { expect, test } from '@playwright/test'

test('command palette: jump to a screen, open a task, add a task; / searches', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  const palette = page.getByRole('dialog')

  // Ctrl+K, type, Enter: this week.
  await page.keyboard.press('Control+k')
  await expect(palette.getByRole('combobox', { name: 'Command' })).toBeFocused()
  await page.keyboard.type('week')
  await expect(palette.getByRole('option', { name: /Go to this week/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/week\/\d{4}-\d{2}-\d{2}$/)
  await expect(palette).toHaveCount(0)

  // Arrow keys move the highlight; Escape closes.
  await page.keyboard.press('Control+k')
  await page.keyboard.press('ArrowDown')
  await expect(palette.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)

  // "New task" opens the editor.
  await page.keyboard.press('Control+k')
  await page.keyboard.type('new task')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').getByLabel('Title')).toBeVisible()
  // Over the editor, Ctrl+K does nothing (a command would replace it and lose its edits).
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('combobox', { name: 'Command' })).toHaveCount(0)
  await expect(page.getByRole('dialog').getByLabel('Title')).toBeVisible()
  await page.keyboard.press('Escape')

  // "/" jumps to search.
  await page.goto('/')
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.keyboard.press('/')
  await expect(page).toHaveURL(/\/search$/)
  await expect(page.getByLabel('Search tasks')).toBeFocused()
})
