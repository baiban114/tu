import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

async function openFreshBoard(page: Page) {
  await page.getByTitle('新建页面').click()
  await page.getByRole('menuitem', { name: '画板' }).click()
  await expect(page.locator('.x6-stage')).toBeVisible()
}

/** Click the stage so it becomes the active board, then make sure nothing is selected. */
async function focusBlankStage(page: Page) {
  const box = await page.locator('.x6-stage').boundingBox()
  if (!box) throw new Error('x6 stage not visible')
  await page.mouse.click(box.x + box.width - 100, box.y + box.height / 2)
  await page.keyboard.press('Escape')
  await expect(page.locator('.toolbar-summary', { hasText: '未选中对象' })).toBeVisible()
}

async function pastePlainText(page: Page, text: string) {
  await page.evaluate((value) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', value)
    document.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  }, text)
}

async function pasteImageFile(page: Page) {
  await page.evaluate(() => {
    // 1x1 transparent PNG
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const file = new File([bytes], 'paste.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    document.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  })
}

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

test('node content expands into a resource-document style dialog', async ({ page }) => {
  await page.getByTitle('新建页面').click()
  await page.getByRole('menuitem', { name: '画板' }).click()
  await expect(page.locator('.x6-stage')).toBeVisible()

  await page.locator('.x6-node[data-cell-id="x6-start-node"]').click()

  const expandButton = page
    .locator('.x6-cell-content__pane-toolbar button', { hasText: '放大' })
  await expect(expandButton).toBeVisible()
  await expandButton.click()

  const dialog = page.locator('.expanded-document-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.expanded-document-dialog__banner-title')).toHaveText('节点内容')
  await expect(dialog.locator('.expanded-document-dialog__banner-tag').nth(0)).toHaveText('画板内容')
  await expect(dialog.locator('.expanded-document-dialog__banner-tag').nth(1)).toHaveText('可编辑')
  const dialogEditor = dialog.locator('.ProseMirror')
  await expect(dialogEditor).toBeVisible()
  await expect(dialogEditor).toHaveAttribute('contenteditable', 'true')

  // Close restores the small in-panel editor.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.x6-cell-content__editor .ProseMirror')).toBeVisible()
})

test('pasting a bare URL creates a link card whose presentation mode switches', async ({ page }) => {
  await openFreshBoard(page)
  await focusBlankStage(page)
  await pastePlainText(page, 'https://example.com/')

  const card = page.locator('.x6-board-link-card')
  await expect(card).toBeVisible()
  await expect(card).toHaveAttribute('data-display', 'link')
  await expect(card).toContainText('https://example.com/')

  // 属性面板移植了文档链接 toolbar：可切换展示形式（含画板额外提供的图片）
  const bar = page.locator('.link-presentation-modes')
  await expect(bar).toBeVisible()
  await expect(bar.getByRole('button', { name: 'iframe' })).toBeVisible()
  await bar.getByRole('button', { name: '图片' }).click()

  await expect(card).toHaveAttribute('data-display', 'image')
  await expect(card.locator('img')).toBeVisible()
})

test('pasting plain text creates a rich-text node', async ({ page }) => {
  await openFreshBoard(page)
  await focusBlankStage(page)
  await pastePlainText(page, '画板粘贴的富文本内容')

  const overlayEditor = page.locator('.x6-node-overlay .ProseMirror')
  await expect(overlayEditor).toBeVisible()
  await expect(overlayEditor).toContainText('画板粘贴的富文本内容')
})

test('pasting an image file creates an image node directly', async ({ page }) => {
  await openFreshBoard(page)
  await focusBlankStage(page)
  await pasteImageFile(page)

  await expect(page.locator('.x6-node image')).toHaveCount(1)
  // 图片节点无文字/填充色等矩形节点字段
  await expect(page.locator('text=填充色')).toHaveCount(0)
})

test('rounded node converts to rectangle via inspector style select', async ({ page }) => {
  await openFreshBoard(page)

  const processNode = page.locator('.x6-node[data-cell-id="x6-process-node"]')
  await processNode.click()

  const edgeCountBefore = await page.locator('.x6-edge').count()

  // 样式区块默认收起，先展开
  await page.locator('.x6-inspector .inspector-section__toggle', { hasText: '样式' }).click()

  const styleSelect = page.locator('label.field', { hasText: '节点样式' }).locator('select')
  await expect(styleSelect).toHaveValue('round')
  await styleSelect.selectOption('rect')

  // 节点 id 不变，body 的 rx 圆角属性被移除，样式选择器同步更新
  const rect = processNode.locator('rect').first()
  await expect(rect).toBeVisible()
  const rx = await rect.getAttribute('rx')
  expect(!rx || Number(rx) === 0).toBeTruthy()
  await expect(styleSelect).toHaveValue('rect')

  // 转换保留连线
  await expect(page.locator('.x6-edge')).toHaveCount(edgeCountBefore)
})

test('group/ungroup wraps multi-selected nodes and member clicks prefer the group', async ({ page }) => {
  await openFreshBoard(page)

  const startNode = page.locator('.x6-node[data-cell-id="x6-start-node"]')
  const processNode = page.locator('.x6-node[data-cell-id="x6-process-node"]')
  const groupContainer = page.locator('.x6-node[data-board-group="true"], .x6-node:has(g[data-board-group="true"])')
  const groupButton = page.locator('.tool-button', { hasText: '组合' })

  // 未多选时组合按钮禁用
  await expect(groupButton).toBeDisabled()

  await startNode.click()
  await processNode.click({ modifiers: ['Control'] })
  await expect(page.locator('.toolbar-summary').filter({ hasText: '已选中' })).toHaveText('已选中 2 个对象')
  await expect(groupButton).toBeEnabled()

  // 组合：生成虚线边框容器节点并自动选中
  await groupButton.click()
  await expect(groupContainer).toHaveCount(1)
  await expect(groupContainer).toHaveClass(/x6-node-selected/)
  await expect(page.locator('.x6-inspector').getByText('当前选中的是组合容器（含 2 个成员）')).toBeVisible()

  // 单击组内成员 → 优先选中最外层组合容器
  await startNode.click()
  await expect(groupContainer).toHaveClass(/x6-node-selected/)
  await expect(startNode).not.toHaveClass(/x6-node-selected/)

  // Alt+单击成员 → 仅选中该成员，组合容器退出选区（Ctrl+单击保留给多选）
  await startNode.click({ modifiers: ['Alt'] })
  await expect(startNode).toHaveClass(/x6-node-selected/)
  await expect(groupContainer).not.toHaveClass(/x6-node-selected/)

  // Ctrl+单击(组内)另一个成员 → 多选该成员，不重定向到组合容器
  await processNode.click({ modifiers: ['Control'] })
  await expect(startNode).toHaveClass(/x6-node-selected/)
  await expect(processNode).toHaveClass(/x6-node-selected/)
  await expect(groupContainer).not.toHaveClass(/x6-node-selected/)
  await expect(page.locator('.toolbar-summary').filter({ hasText: '已选中' })).toHaveText('已选中 2 个对象')

  // 选中容器后可取消组合：容器移除，成员保留
  // 点容器左上角空白处，避开成员节点之间的连线命中区
  await groupContainer.click({ position: { x: 6, y: 6 } })
  await expect(groupContainer).toHaveClass(/x6-node-selected/)
  await groupButton.click()
  await expect(groupContainer).toHaveCount(0)
  await expect(startNode).toBeVisible()
  await expect(processNode).toBeVisible()
})

async function boardNodeTranslate(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const t = await page.locator(selector).getAttribute('transform')
  const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(t ?? '')
  return { x: m ? Number(m[1]) : NaN, y: m ? Number(m[2]) : NaN }
}

async function dragNodeBy(page: Page, selector: string, dx: number, dy: number) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`no bounding box for ${selector}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 })
  await page.mouse.up()
}

test('dragging a solo-selected member moves only it; dragging the selected group moves all', async ({ page }) => {
  await openFreshBoard(page)

  const startNode = '.x6-node[data-cell-id="x6-start-node"]'
  const processNode = '.x6-node[data-cell-id="x6-process-node"]'
  const groupContainer = page.locator('.x6-node[data-board-group="true"], .x6-node:has(g[data-board-group="true"])')
  const groupContainerSel = '.x6-node[data-shape="board-group"]'
  const groupButton = page.locator('.tool-button', { hasText: '组合' })

  // 建立组合
  await page.locator(startNode).click()
  await page.locator(processNode).click({ modifiers: ['Control'] })
  await groupButton.click()
  await expect(groupContainer).toHaveCount(1)

  // Alt+单击选中单个成员 → 单独拖动它，组合容器保持不动
  await page.locator(startNode).click({ modifiers: ['Alt'] })
  await expect(page.locator(startNode)).toHaveClass(/x6-node-selected/)
  await expect(groupContainer).not.toHaveClass(/x6-node-selected/)
  const startBefore = await boardNodeTranslate(page, startNode)
  const containerBefore = await boardNodeTranslate(page, groupContainerSel)
  const processBefore = await boardNodeTranslate(page, processNode)
  await dragNodeBy(page, startNode, 60, 40)
  const startAfter = await boardNodeTranslate(page, startNode)
  const containerAfter = await boardNodeTranslate(page, groupContainerSel)
  const processAfter = await boardNodeTranslate(page, processNode)
  // 仅被选中的成员发生了位移
  expect(startAfter.x - startBefore.x).not.toBe(0)
  expect(startAfter.y - startBefore.y).not.toBe(0)
  // 组合容器与未选中成员保持不动
  expect(Math.abs(containerAfter.x - containerBefore.x)).toBeLessThan(1)
  expect(Math.abs(containerAfter.y - containerBefore.y)).toBeLessThan(1)
  expect(Math.abs(processAfter.x - processBefore.x)).toBeLessThan(1)
  expect(Math.abs(processAfter.y - processBefore.y)).toBeLessThan(1)

  // 重新选中组合容器 → 拖动任意成员 = 整个组合一起移动
  await groupContainer.click({ position: { x: 6, y: 6 } })
  await expect(groupContainer).toHaveClass(/x6-node-selected/)
  const containerBefore2 = await boardNodeTranslate(page, groupContainerSel)
  const startBefore2 = await boardNodeTranslate(page, startNode)
  const processBefore2 = await boardNodeTranslate(page, processNode)
  await dragNodeBy(page, processNode, -40, 30)
  const containerAfter2 = await boardNodeTranslate(page, groupContainerSel)
  const startAfter2 = await boardNodeTranslate(page, startNode)
  const processAfter2 = await boardNodeTranslate(page, processNode)
  // 容器 + 两个成员的位移必须一致（整体移动，缩放/拾取点无关）
  const gdx = containerAfter2.x - containerBefore2.x
  const gdy = containerAfter2.y - containerBefore2.y
  expect(gdx).not.toBe(0)
  expect(gdy).not.toBe(0)
  expect(startAfter2.x - startBefore2.x).toBeCloseTo(gdx, 0)
  expect(startAfter2.y - startBefore2.y).toBeCloseTo(gdy, 0)
  expect(processAfter2.x - processBefore2.x).toBeCloseTo(gdx, 0)
  expect(processAfter2.y - processBefore2.y).toBeCloseTo(gdy, 0)
})
