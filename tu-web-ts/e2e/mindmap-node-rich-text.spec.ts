import { expect, test } from '@playwright/test'

async function openMindmapPage(page: import('@playwright/test').Page) {
  await page.getByTitle('新建页面').click()
  await page.getByRole('menuitem', { name: '思维导图' }).click()
  await expect(page.locator('.canvas-page')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('persists mindmap node rich text mode', async ({ page }) => {
  await openMindmapPage(page)

  await page.locator('.x6-graph text').filter({ hasText: '中心主题' }).first().click()
  const modeSelect = page.locator('.x6-inspector .field select')
  await expect(modeSelect).toBeVisible()
  await modeSelect.selectOption('rich')
  await expect(modeSelect).toHaveValue('rich')
  await page.waitForTimeout(1000)

  const storage = await page.evaluate(() => localStorage.getItem('tu:mock-state'))
  expect(storage).toContain('"textMode":"rich"')
})
