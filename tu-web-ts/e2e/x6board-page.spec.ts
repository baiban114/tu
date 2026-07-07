import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('creates an x6board page without outer content scroll', async ({ page }) => {
  await page.getByTitle('新建页面').click()
  await page.getByRole('menuitem', { name: '画板' }).click()

  await expect(page.locator('.canvas-page')).toBeVisible()
  await expect(page.locator('.content-canvas')).toBeVisible()
  await expect(page.locator('.content-canvas')).toHaveCSS('overflow', 'hidden')
  await expect(page.locator('.content-scroll')).toHaveCount(0)
  await expect(page.locator('.x6-stage')).toBeVisible()
  await expect(page.locator('.ProseMirror')).toHaveCount(0)
})

test('ctrl-click multi-select highlights every selected node like rubberband', async ({ page }) => {
  await page.getByTitle('新建页面').click()
  await page.getByRole('menuitem', { name: '画板' }).click()

  await expect(page.locator('.x6-stage')).toBeVisible()

  const startNode = page.locator('.x6-node[data-cell-id="x6-start-node"]')
  const processNode = page.locator('.x6-node[data-cell-id="x6-process-node"]')
  const decisionNode = page.locator('.x6-node[data-cell-id="x6-decision-node"]')

  await expect(startNode).toBeVisible()
  await expect(processNode).toBeVisible()
  await expect(decisionNode).toBeVisible()

  // Build the multi-selection incrementally with ctrl+click — the path that
  // previously left only the last-clicked node visually selected.
  await startNode.click()
  await processNode.click({ modifiers: ['Control'] })
  await decisionNode.click({ modifiers: ['Control'] })

  // Every ctrl-clicked node must carry the selected class, not just the last one.
  await expect(startNode).toHaveClass(/x6-node-selected/)
  await expect(processNode).toHaveClass(/x6-node-selected/)
  await expect(decisionNode).toHaveClass(/x6-node-selected/)

  await expect(page.locator('.toolbar-summary').filter({ hasText: '已选中' })).toHaveText('已选中 3 个对象')
})
