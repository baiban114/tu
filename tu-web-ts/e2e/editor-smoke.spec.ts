import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('loads the editor in mock mode', async ({ page }) => {
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect(page.locator('.ProseMirror h1').first()).toBeVisible()
  await expect(page.locator('[data-block-id]').first()).toBeVisible()
})

test('keeps content floating toolbar below the workspace topbar', async ({ page }) => {
  const nodeView = page.locator('.x6-block-view').first()
  await expect(nodeView).toBeVisible()

  await nodeView.click()
  const toolbar = page.locator('.nodeview-toolbar')
  await expect(toolbar).toBeVisible()

  const topbarZIndex = await page.locator('.workspace-topbar').evaluate((el) => getComputedStyle(el).zIndex)
  const toolbarZIndex = await toolbar.evaluate((el) => getComputedStyle(el).zIndex)

  expect(Number(toolbarZIndex)).toBeLessThan(Number(topbarZIndex))
})
