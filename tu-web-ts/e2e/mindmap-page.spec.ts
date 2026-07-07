import { expect, test } from '@playwright/test'

async function createMindmapFromMenu(page: import('@playwright/test').Page) {
  await page.getByTitle('新建页面').click()
  await page.getByRole('menuitem', { name: '思维导图' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('creates a mindmap page without outer content scroll', async ({ page }) => {
  await createMindmapFromMenu(page)

  const mindmapNode = page.locator('.page-tree .tree-node').filter({ hasText: '未命名思维导图' }).first()
  await expect(mindmapNode).toBeVisible()

  await expect(page.locator('.content-canvas')).toBeVisible()
  await expect(page.locator('.content-canvas')).toHaveCSS('overflow', 'hidden')
  await expect(page.locator('.content-scroll')).toHaveCount(0)

  await expect(page.locator('.canvas-page')).toBeVisible()
  await expect(page.locator('.x6-stage')).toBeVisible()
  await expect(page.locator('.ProseMirror')).toHaveCount(0)
})

test('persists mindmap page title in mock storage', async ({ page }) => {
  await createMindmapFromMenu(page)

  const titleInput = page.locator('.board-canvas-shell__title-input')
  await expect(titleInput).toBeVisible()
  await titleInput.fill('产品路线图')
  await titleInput.blur()

  await expect(page.locator('.page-tree .tree-node').filter({ hasText: '产品路线图' })).toBeVisible()

  const storage = await page.evaluate(() => localStorage.getItem('tu:mock-state'))
  expect(storage).toContain('产品路线图')
  expect(storage).toContain('"pageType":"mindmap"')
})

test('shows dashed edge only while previewing a dragged mindmap node', async ({ page }) => {
  await createMindmapFromMenu(page)

  await expect(page.locator('.x6-stage')).toBeVisible()
  const rootNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: '中心主题' }).first()
  const sourceNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 1' }).first()
  const siblingNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 2' }).first()
  await expect(rootNode).toBeVisible()
  await expect(sourceNode).toBeVisible()
  await expect(siblingNode).toBeVisible()

  const rootBoxBefore = await rootNode.boundingBox()
  const siblingBoxBefore = await siblingNode.boundingBox()
  const sourceBox = await sourceNode.boundingBox()
  const targetBox = await siblingNode.boundingBox()
  expect(rootBoxBefore).not.toBeNull()
  expect(siblingBoxBefore).not.toBeNull()
  expect(sourceBox).not.toBeNull()
  expect(targetBox).not.toBeNull()

  const source = sourceBox!
  const target = targetBox!
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 })

  const previewEdge = page.locator('[data-cell-id="__mindmap-drag-preview-edge__"]')
  await expect(previewEdge).toHaveCount(1)
  await expect(previewEdge.locator('[stroke-dasharray="6 4"]')).toHaveCount(1)

  const rootBoxDuring = await rootNode.boundingBox()
  const siblingBoxDuring = await siblingNode.boundingBox()
  expect(rootBoxDuring).not.toBeNull()
  expect(siblingBoxDuring).not.toBeNull()
  expect(Math.abs(rootBoxDuring!.y - rootBoxBefore!.y)).toBeLessThan(1)
  expect(Math.abs(siblingBoxDuring!.y - siblingBoxBefore!.y)).toBeLessThan(1)

  await page.mouse.up()
  await expect(previewEdge).toHaveCount(0)
})

test('updates dashed preview source port when dragging across mindmap sides', async ({ page }) => {
  await createMindmapFromMenu(page)

  await expect(page.locator('.x6-stage')).toBeVisible()
  const sourceNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 1' }).first()
  const rootNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: '中心主题' }).first()
  await expect(sourceNode).toBeVisible()
  await expect(rootNode).toBeVisible()

  const sourceBox = await sourceNode.boundingBox()
  const rootBox = await rootNode.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(rootBox).not.toBeNull()

  const source = sourceBox!
  const root = rootBox!
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(root.x + root.width * 0.25, root.y + root.height / 2, { steps: 10 })

  const previewEdge = page.locator('[data-cell-id="__mindmap-drag-preview-edge__"]')
  await expect(previewEdge).toHaveCount(1)
  await expect(previewEdge.locator('[data-source-port="port-left"]')).toHaveCount(1)

  await page.mouse.up()
})

test('lays out starter branches to the right of root on create', async ({ page }) => {
  await createMindmapFromMenu(page)

  await expect(page.locator('.x6-stage')).toBeVisible()
  const rootNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: '中心主题' }).first()
  const branch1 = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 1' }).first()
  const branch2 = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 2' }).first()
  await expect(rootNode).toBeVisible()
  await expect(branch1).toBeVisible()
  await expect(branch2).toBeVisible()

  const rootBox = await rootNode.boundingBox()
  const branch1Box = await branch1.boundingBox()
  const branch2Box = await branch2.boundingBox()
  expect(rootBox).not.toBeNull()
  expect(branch1Box).not.toBeNull()
  expect(branch2Box).not.toBeNull()
  expect(branch1Box!.x).toBeGreaterThan(rootBox!.x + rootBox!.width - 4)
  expect(branch2Box!.x).toBeGreaterThan(rootBox!.x + rootBox!.width - 4)
})

function bboxOverlapArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (overlapX <= 0 || overlapY <= 0) return 0
  return overlapX * overlapY
}

test('adds sibling with Enter after click without overlapping anchor', async ({ page }) => {
  await createMindmapFromMenu(page)

  await expect(page.locator('.x6-stage')).toBeVisible()
  const branch1 = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 1' }).first()
  await expect(branch1).toBeVisible()

  await branch1.click()
  await page.keyboard.press('Enter')

  const newSibling = page.locator('.x6-node[data-cell-id]').filter({ hasText: '同级分支' }).first()
  await expect(newSibling).toBeVisible()

  const anchorBox = await branch1.boundingBox()
  const siblingBox = await newSibling.boundingBox()
  expect(anchorBox).not.toBeNull()
  expect(siblingBox).not.toBeNull()

  const overlap = bboxOverlapArea(anchorBox!, siblingBox!)
  const minArea = Math.min(anchorBox!.width * anchorBox!.height, siblingBox!.width * siblingBox!.height)
  expect(overlap).toBeLessThan(minArea * 0.1)
  expect(Math.abs(siblingBox!.y - anchorBox!.y)).toBeGreaterThan(anchorBox!.height * 0.25)

  await page.keyboard.press('Enter')
  const secondSibling = page.locator('.x6-node[data-cell-id]').filter({ hasText: '同级分支' }).nth(1)
  await expect(secondSibling).toBeVisible()

  const anchorBoxAfter = await branch1.boundingBox()
  const secondBox = await secondSibling.boundingBox()
  expect(anchorBoxAfter).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(bboxOverlapArea(anchorBoxAfter!, secondBox!)).toBeLessThan(
    Math.min(anchorBoxAfter!.width * anchorBoxAfter!.height, secondBox!.width * secondBox!.height) * 0.1,
  )
})

test('does not delete root when only center topic is selected', async ({ page }) => {
  await createMindmapFromMenu(page)

  await expect(page.locator('.x6-stage')).toBeVisible()
  const rootNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: '中心主题' }).first()
  const branch1 = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 1' }).first()
  const branch2 = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 2' }).first()
  await expect(rootNode).toBeVisible()
  await expect(branch1).toBeVisible()
  await expect(branch2).toBeVisible()

  await rootNode.click()
  await page.keyboard.press('Delete')

  await expect(rootNode).toBeVisible()
  await expect(branch1).toBeVisible()
  await expect(branch2).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id]')).toHaveCount(3)
})

test('deletes a selected branch with Delete key', async ({ page }) => {
  await createMindmapFromMenu(page)

  await expect(page.locator('.x6-stage')).toBeVisible()
  const branch1 = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 1' }).first()
  const branch2 = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 2' }).first()
  await expect(branch1).toBeVisible()
  await expect(branch2).toBeVisible()

  await branch1.click()
  await page.keyboard.press('Delete')

  await expect(branch1).toHaveCount(0)
  await expect(branch2).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id]')).toHaveCount(2)

  await page.waitForTimeout(700)
  await expect(page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 1' })).toHaveCount(0)
})

test('deletes multiple selected branches at once', async ({ page }) => {
  await createMindmapFromMenu(page)

  await expect(page.locator('.x6-stage')).toBeVisible()
  const rootNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: '中心主题' }).first()
  const branch1 = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 1' }).first()
  const branch2 = page.locator('.x6-node[data-cell-id]').filter({ hasText: '分支 2' }).first()
  await expect(rootNode).toBeVisible()
  await expect(branch1).toBeVisible()
  await expect(branch2).toBeVisible()

  await branch1.click()
  await page.keyboard.down('Control')
  await branch2.click()
  await page.keyboard.up('Control')
  await expect(page.locator('.x6-node-selected')).toHaveCount(2)
  await expect(page.locator('.x6-widget-selection-inner')).toBeHidden()
  await expect(page.locator('.x6-widget-selection-box')).toHaveCount(0)
  await expect(page.locator('.x6-widget-transform')).toHaveCount(0)
  await expect(page.locator('.tu-selection-frame')).toHaveCount(0)
  await expect(branch1.locator('rect').first()).toHaveCSS('stroke-width', '2.4px')
  await expect(branch2.locator('rect').first()).toHaveCSS('stroke-width', '2.4px')

  await page.getByRole('button', { name: '删除' }).click()

  await expect(branch1).toHaveCount(0)
  await expect(branch2).toHaveCount(0)
  await expect(rootNode).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id]')).toHaveCount(1)
})

test('clears selected child outline after collapse settlement', async ({ page }) => {
  await createMindmapFromMenu(page)

  await expect(page.locator('.x6-stage')).toBeVisible()
  const mindmapNodes = page.locator('.x6-node[data-cell-id]')
  await expect(mindmapNodes).toHaveCount(3)
  const rootNode = mindmapNodes.nth(0)
  const childNode = mindmapNodes.nth(1)
  await expect(rootNode).toBeVisible()
  await expect(childNode).toBeVisible()

  await childNode.click()
  await expect(childNode).toHaveClass(/x6-node-selected/)

  const rootBox = await rootNode.boundingBox()
  expect(rootBox).not.toBeNull()
  await page.mouse.move(rootBox!.x + rootBox!.width / 2, rootBox!.y + rootBox!.height / 2)

  const collapseButton = page.locator('.mindmap-collapse-btn').first()
  await expect(collapseButton).toBeVisible()
  await collapseButton.click()

  await expect(childNode).not.toBeVisible()
  await expect(page.locator('.x6-node-selected')).toHaveCount(0)
  await expect(page.locator('.x6-widget-selection-inner')).toBeHidden()
  await expect(page.locator('.x6-widget-selection-box')).toHaveCount(0)
  await expect(page.locator('.tu-selection-frame')).toHaveCount(0)
})

test('creates a document page from the same menu', async ({ page }) => {
  await page.getByTitle('新建页面').click()
  await page.getByRole('menuitem', { name: '文档' }).click()

  await expect(page.locator('.page-tree .tree-node').filter({ hasText: '新页面' }).first()).toBeVisible()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect(page.locator('.canvas-page')).toHaveCount(0)
})
