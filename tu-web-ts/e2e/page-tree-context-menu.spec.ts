import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
  })
  await page.goto('/')
  await expect(page.locator('.page-tree')).toBeVisible()
})

test('closes page tree context menu when left-clicking another page', async ({ page }) => {
  const firstPage = page.locator('.page-tree .tree-node').filter({ hasText: '快速入门' }).first()
  const secondPage = page.locator('.page-tree .tree-node').filter({ hasText: '基础概念' }).first()
  await expect(firstPage).toBeVisible()
  await expect(secondPage).toBeVisible()

  await firstPage.click({ button: 'right' })
  const menu = page.locator('[data-page-tree-context-menu]')
  await expect(menu).toBeVisible()
  await expect(menu.getByText('重命名')).toBeVisible()

  await secondPage.click()
  await expect(menu).toHaveCount(0)
})
