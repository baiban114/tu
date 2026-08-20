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

async function measureReferencedBoardInterfaceEndpointGap(page: Page, edgeId: string) {
  return page.evaluate((id) => {
    const preview = document.querySelector('.x6-board-reference-preview')
    const dock = preview?.querySelector<SVGCircleElement>(
      `[data-interface-edge-id="${id}"] .x6-board-reference-preview__interface-dock`,
    )
    const edgeElement = preview?.querySelector<SVGGElement>(
      `.x6-edge[data-cell-id="${CSS.escape(id)}"]`,
    )
    const path = edgeElement?.querySelector<SVGPathElement>('.x6-edge-connection')
      ?? edgeElement?.querySelector<SVGPathElement>('path')
    const pathMatrix = path?.getScreenCTM()
    if (!dock || !path || !pathMatrix) return null

    const edgeEnds = [0, path.getTotalLength()].map((length) => {
      const point = path.getPointAtLength(length)
      return new DOMPoint(point.x, point.y).matrixTransform(pathMatrix)
    })
    const dockRect = dock.getBoundingClientRect()
    const dockCenter = {
      x: dockRect.left + dockRect.width / 2,
      y: dockRect.top + dockRect.height / 2,
    }
    return Math.min(...edgeEnds.map((point) => (
      Math.hypot(dockCenter.x - point.x, dockCenter.y - point.y)
    )))
  }, edgeId)
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

test('board page enters and exits fullscreen from its page toolbar', async ({ page }) => {
  await openFreshBoard(page)

  const fullscreenButton = page.getByRole('button', { name: '全屏画板页面' })
  await expect(fullscreenButton).toBeVisible()
  await fullscreenButton.click()

  await expect.poll(() => page.evaluate(() => (
    document.fullscreenElement?.classList.contains('canvas-page') === true
  ))).toBe(true)
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible()
  await expect(page.locator('.canvas-page__topbar')).toBeHidden()
  await expect(page.locator('.board-canvas-shell__header')).toBeHidden()
  await expect(page.locator('.x6-stage')).toBeVisible()

  await page.getByRole('button', { name: '退出全屏' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await expect(fullscreenButton).toBeVisible()
  await expect(page.locator('.canvas-page__topbar')).toBeVisible()
  await expect(page.locator('.board-canvas-shell__header')).toBeVisible()
})

test('board page fills the webpage without entering browser fullscreen', async ({ page }) => {
  await openFreshBoard(page)

  const webFullscreenButton = page.getByRole('button', { name: '网页全屏' })
  await expect(webFullscreenButton).toBeVisible()
  await webFullscreenButton.click()

  await expect(page.locator('.canvas-page')).toHaveClass(/canvas-page--web-fullscreen/)
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  await expect(page.getByRole('button', { name: '退出网页全屏' })).toBeVisible()
  await expect(page.locator('.canvas-page__topbar')).toBeHidden()
  await expect(page.locator('.board-canvas-shell__header')).toBeHidden()
  const webFullscreenBox = await page.locator('.canvas-page').boundingBox()
  const viewport = page.viewportSize()
  expect(webFullscreenBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(webFullscreenBox!.x).toBeCloseTo(0, 1)
  expect(webFullscreenBox!.y).toBeCloseTo(0, 1)
  expect(webFullscreenBox!.width).toBeCloseTo(viewport!.width, 1)
  expect(webFullscreenBox!.height).toBeCloseTo(viewport!.height, 1)

  await page.getByRole('button', { name: '退出网页全屏' }).click()
  await expect(page.locator('.canvas-page')).not.toHaveClass(/canvas-page--web-fullscreen/)
  await expect(webFullscreenButton).toBeVisible()
  await expect(page.locator('.canvas-page__topbar')).toBeVisible()
  await expect(page.locator('.board-canvas-shell__header')).toBeVisible()
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

test('overlapping nodes only select the node with the highest Z value', async ({ page }) => {
  await openFreshBoard(page)

  const startNode = page.locator('.x6-node[data-cell-id="x6-start-node"]')
  const processNode = page.locator('.x6-node[data-cell-id="x6-process-node"]')

  // Give the start node an explicit higher layer before overlapping the nodes.
  await startNode.click()
  const zInput = page.locator('.x6-inspector label.field', { hasText: 'Z 值' }).locator('input')
  await zInput.fill('20')
  await zInput.press('Enter')

  const startBox = await startNode.boundingBox()
  const processBox = await processNode.boundingBox()
  expect(startBox).toBeTruthy()
  expect(processBox).toBeTruthy()
  await page.mouse.move(processBox!.x + processBox!.width / 2, processBox!.y + processBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2, { steps: 8 })
  await page.mouse.up()

  // Moving can affect the renderer order, so assert the intended Z ordering
  // after the overlap is established.
  await zInput.fill('10')
  await zInput.press('Enter')

  // Avoid the connecting edge that crosses the node's vertical center.
  await page.mouse.click(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2 - 14)
  await expect(startNode).toHaveClass(/x6-node-selected/)
  await expect(processNode).not.toHaveClass(/x6-node-selected/)
  await expect(page.locator('.toolbar-summary', { hasText: '节点:' })).toContainText('开始')
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
  // 编辑状态下不显示「画板内容/可编辑」等标签（只读时才显示「只读」）
  await expect(dialog.locator('.expanded-document-dialog__banner-tag')).toHaveCount(0)
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

  // 选中组合后再点其中的成员 → 钻取选中该成员本身
  await startNode.click()
  await expect(startNode).toHaveClass(/x6-node-selected/)
  await expect(groupContainer).not.toHaveClass(/x6-node-selected/)

  // 组合未选中时单击成员 → 优先选中最外层组合容器
  await processNode.click()
  await expect(groupContainer).toHaveClass(/x6-node-selected/)
  await expect(processNode).not.toHaveClass(/x6-node-selected/)

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

test('ungroup button is only enabled on single-select of a group container', async ({ page }) => {
  await openFreshBoard(page)

  const startNode = page.locator('.x6-node[data-cell-id="x6-start-node"]')
  const processNode = page.locator('.x6-node[data-cell-id="x6-process-node"]')
  const decisionNode = page.locator('.x6-node[data-cell-id="x6-decision-node"]')
  const groupContainer = page.locator('.x6-node[data-board-group="true"], .x6-node:has(g[data-board-group="true"])')

  // 多选 2 节点 → 组合
  await startNode.click()
  await processNode.click({ modifiers: ['Control'] })
  await page.locator('.tool-button', { hasText: '组合' }).click()
  await expect(groupContainer).toBeVisible()

  // 单选组合容器 → 取消组合可用
  await groupContainer.click({ position: { x: 6, y: 6 } })
  await expect(page.locator('.tool-button', { hasText: '取消组合' })).toBeEnabled()

  // Ctrl+单击组外节点 → 多选含容器 → 取消组合禁用，按钮回到"组合"
  await decisionNode.click({ modifiers: ['Control'] })
  await expect(page.locator('.tool-button', { hasText: '组合' })).toBeDisabled()

  // 再次单选容器 → 恢复可用
  await groupContainer.click({ position: { x: 6, y: 6 } })
  await expect(page.locator('.tool-button', { hasText: '取消组合' })).toBeEnabled()
})

test('a parent element can hold multiple children: 设为子元素 stays enabled for an existing parent', async ({ page }) => {
  await openFreshBoard(page)

  const startNode = page.locator('.x6-node[data-cell-id="x6-start-node"]')
  const processNode = page.locator('.x6-node[data-cell-id="x6-process-node"]')
  const decisionNode = page.locator('.x6-node[data-cell-id="x6-decision-node"]')
  const childButton = page.locator('.tool-button', { hasText: '设为子元素' })

  // 选中 start + process（process 后选，作为父元素）→ 设为子元素可用
  await startNode.click()
  await processNode.click({ modifiers: ['Control'] })
  await expect(childButton).toBeEnabled()
  const beforeAttach = await page.evaluate(() => {
    const g = (window as any).__x6graph
    return ['x6-start-node', 'x6-process-node'].map((id) => ({ id, bbox: g.getCellById(id).getBBox().toJSON() }))
  })
  await childButton.click()
  const afterAttach = await page.evaluate(() => {
    const g = (window as any).__x6graph
    return ['x6-start-node', 'x6-process-node'].map((id) => ({ id, bbox: g.getCellById(id).getBBox().toJSON() }))
  })

  // 父节点保持原画布坐标；远处的子节点进入父容器内部，而不是把父节点拉到左上角。
  expect(afterAttach[1].bbox.x).toBeCloseTo(beforeAttach[1].bbox.x, 5)
  expect(afterAttach[1].bbox.y).toBeCloseTo(beforeAttach[1].bbox.y, 5)
  expect(afterAttach[0].bbox.x).toBeGreaterThanOrEqual(afterAttach[1].bbox.x + 15)
  expect(afterAttach[0].bbox.y).toBeGreaterThanOrEqual(afterAttach[1].bbox.y + 15)

  // process 成为父容器，start 被嵌入为其子元素
  // X6 embed 不改变 DOM 层级，通过模型验证父子关系
  await expect.poll(() => page.evaluate(() => {
    const child = (window as any).__x6graph?.getCellById('x6-start-node')
    return child?.getParent()?.id
  })).toBe('x6-process-node')

  // 建立父子关系后画板仍可正常平移，不会被异常大的父容器遮住。
  const translateBefore = await page.evaluate(() => (window as any).__x6graph.translate())
  await page.locator('.x6-stage').hover({ position: { x: 24, y: 24 } })
  await page.mouse.wheel(0, 80)
  await expect.poll(async () => {
    const current = await page.evaluate(() => (window as any).__x6graph.translate())
    return current.ty
  }).toBeCloseTo(translateBefore.ty - 80, 5)
  await page.mouse.wheel(0, -80)

  // 单选父元素 process → 按钮禁用（选中父元素时不可用）
  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-process-node'))
  })
  await expect(childButton).toBeDisabled()

  // 再选中 decision + process（process 最后选中作为父）→ 设为子元素仍可用，可继续添加子元素
  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-decision-node'))
    g.select(g.getCellById('x6-process-node'))
  })
  await expect(childButton).toBeEnabled()
  await childButton.click()

  // process 现在同时拥有两个子元素：start 与 decision（相连边也会被嵌入，过滤只统计节点）
  await expect.poll(() => page.evaluate(() => {
    const parent = (window as any).__x6graph?.getCellById('x6-process-node')
    return parent
      ?.getChildren()
      ?.filter((c: any) => c.isNode())
      .map((c: any) => c.id)
      .sort()
  })).toEqual(['x6-decision-node', 'x6-start-node'])
})

test('nesting a parent moves its whole subtree atomically and rejects inverse cycles', async ({ page }) => {
  await openFreshBoard(page)

  const childButton = page.locator('.tool-button', { hasText: '设为子元素' })
  const snapshot = () => page.evaluate(() => {
    const g = (window as any).__x6graph
    return ['x6-start-node', 'x6-process-node', 'x6-decision-node', 'x6-finish-node']
      .map((id) => ({ id, bbox: g.getCellById(id).getBBox().toJSON() }))
  })

  // 先建立 process → start，使 process 成为一个带子节点的父容器。
  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-start-node'))
    g.select(g.getCellById('x6-process-node'))
  })
  await expect(childButton).toBeEnabled()
  await childButton.click()

  // 放置一个不属于该子树、但与 process 容器实际重叠的节点，覆盖“原来重叠元素”场景。
  await page.evaluate(() => {
    const g = (window as any).__x6graph
    const processBox = g.getCellById('x6-process-node').getBBox()
    g.getCellById('x6-finish-node').setPosition(processBox.x + 4, processBox.y + 4)
  })
  const beforeNestedAttach = await snapshot()

  // 再建立 decision → process；process 与其已有子节点必须作为一个整体移动。
  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-process-node'))
    g.select(g.getCellById('x6-decision-node'))
  })
  await expect(childButton).toBeEnabled()
  await childButton.click()

  const afterNestedAttach = await snapshot()
  const beforeById = Object.fromEntries(beforeNestedAttach.map((item) => [item.id, item.bbox]))
  const afterById = Object.fromEntries(afterNestedAttach.map((item) => [item.id, item.bbox]))
  const processDx = afterById['x6-process-node'].x - beforeById['x6-process-node'].x
  const processDy = afterById['x6-process-node'].y - beforeById['x6-process-node'].y

  // 原本与父容器重叠的 start 不参与中间态回算，位移与 process 完全一致。
  expect(afterById['x6-start-node'].x - beforeById['x6-start-node'].x).toBeCloseTo(processDx, 5)
  expect(afterById['x6-start-node'].y - beforeById['x6-start-node'].y).toBeCloseTo(processDy, 5)
  // 新父节点及与子树重叠、但无父子关系的节点不应被拖向左侧或左上角。
  expect(afterById['x6-decision-node'].x).toBeCloseTo(beforeById['x6-decision-node'].x, 5)
  expect(afterById['x6-decision-node'].y).toBeCloseTo(beforeById['x6-decision-node'].y, 5)
  expect(afterById['x6-finish-node'].x).toBeCloseTo(beforeById['x6-finish-node'].x, 5)
  expect(afterById['x6-finish-node'].y).toBeCloseTo(beforeById['x6-finish-node'].y, 5)

  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).__x6graph
    return {
      processParent: g.getCellById('x6-process-node').getParent()?.id,
      startParent: g.getCellById('x6-start-node').getParent()?.id,
    }
  })).toEqual({ processParent: 'x6-decision-node', startParent: 'x6-process-node' })

  // 反向再设 decision 为 process 的子节点会形成环，按钮必须直接禁用。
  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-decision-node'))
    g.select(g.getCellById('x6-process-node'))
  })
  await expect(childButton).toBeDisabled()
})

test('operation manager persists 设为子元素 and restores the board to before it', async ({ page }) => {
  await openFreshBoard(page)
  await page.locator('.dev-mode-panel').getByRole('button', { name: '隐藏' }).click()

  const before = await page.evaluate(() => {
    const g = (window as any).__x6graph
    return ['x6-start-node', 'x6-process-node'].map((id) => ({
      id,
      bbox: g.getCellById(id).getBBox().toJSON(),
    }))
  })

  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-start-node'))
    g.select(g.getCellById('x6-process-node'))
  })
  await page.locator('.tool-button', { hasText: '设为子元素' }).click()

  await page.locator('.x6-inspector-tab', { hasText: '操作' }).click()
  const childOperation = page.locator('.x6-operation-item', { hasText: '设为子元素' }).first()
  await expect(childOperation).toBeVisible()

  // 操作记录随页面内容进入 mock 持久化，而不只是 X6 当前会话的撤销栈。
  await expect.poll(() => page.evaluate(() => (
    window.localStorage.getItem('tu:mock-state')?.includes('operationHistory') ?? false
  ))).toBe(true)

  await childOperation.getByRole('button', { name: '回退到此前' }).click()
  await expect(childOperation).toContainText('当前状态会自动保留')
  await childOperation.getByRole('button', { name: '确认回退' }).click()

  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).__x6graph
    return {
      parent: g.getCellById('x6-start-node').getParent()?.id ?? null,
      boxes: ['x6-start-node', 'x6-process-node'].map((id) => g.getCellById(id).getBBox().toJSON()),
    }
  })).toEqual({ parent: null, boxes: before.map((item) => item.bbox) })
  await expect(page.locator('.x6-operation-manager__notice')).toContainText('已回退到「设为子元素」之前')

  // 回退本身也成为一条可恢复记录，避免误操作后无法找回。
  await expect(page.locator('.x6-operation-item').first()).toContainText('回退到「设为子元素」之前')
  await expect.poll(() => page.evaluate(() => (
    window.localStorage.getItem('tu:mock-state')?.includes('回退到\\u300c设为子元素\\u300d之前')
    || window.localStorage.getItem('tu:mock-state')?.includes('回退到「设为子元素」之前')
    || false
  ))).toBe(true)

  // 刷新后重新打开该画板，恢复结果和操作时间线仍然存在。
  await page.reload()
  await page.getByRole('treeitem', { name: '未命名画板' }).click()
  await expect(page.locator('.x6-stage')).toBeVisible()
  await page.locator('.x6-inspector-tab', { hasText: '操作' }).click()
  await expect(page.locator('.x6-operation-item').first()).toContainText('回退到「设为子元素」之前')
  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).__x6graph
    return {
      parent: g.getCellById('x6-start-node').getParent()?.id ?? null,
      boxes: ['x6-start-node', 'x6-process-node'].map((id) => g.getCellById(id).getBBox().toJSON()),
    }
  })).toEqual({ parent: null, boxes: before.map((item) => item.bbox) })
})

test('operation manager displays 30 rollback records per page', async ({ page }) => {
  await openFreshBoard(page)

  const boardTitle = '三十条回退记录画板'
  const titleInput = page.locator('.board-canvas-shell__title-input')
  await titleInput.fill(boardTitle)
  await titleInput.press('Enter')
  await expect(page.getByRole('treeitem', { name: boardTitle })).toBeVisible()

  await expect.poll(() => page.evaluate((title) => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    return state.pages?.some((item: { title?: string }) => item.title === title) ?? false
  }, boardTitle)).toBe(true)

  await page.evaluate((title) => {
    const storageKey = 'tu:mock-state'
    const state = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
    const boardPage = state.pages.find((item: { title?: string }) => item.title === title)
    const embed = state.contents?.[boardPage.id]?.embeds?.[0]
    const cells = structuredClone(embed.graphData?.cells ?? [])
    embed.graphData.operationHistory = Array.from({ length: 30 }, (_, index) => ({
      id: `board-operation-page-size-${index}`,
      label: `测试操作 ${index + 1}`,
      createdAt: Date.now() - index,
      before: { cells: structuredClone(cells) },
    }))
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  }, boardTitle)

  await page.reload()
  await page.getByRole('treeitem', { name: boardTitle }).click()
  await expect(page.locator('.x6-stage')).toBeVisible()
  await page.locator('.x6-inspector-tab', { hasText: '操作' }).click()

  await expect(page.locator('.x6-operation-item')).toHaveCount(30)
  await expect(page.locator('.x6-operation-manager__pagination')).toHaveCount(0)
  await expect(page.locator('.x6-operation-manager__header')).toContainText('每页显示 30 条')
})

test('rollback remains after immediately switching to another board and back', async ({ page }) => {
  await openFreshBoard(page)

  const sourceBoardTitle = '回退切换来源画板'
  const titleInput = page.locator('.board-canvas-shell__title-input')
  await titleInput.fill(sourceBoardTitle)
  await titleInput.press('Enter')
  await expect(page.getByRole('treeitem', { name: sourceBoardTitle })).toBeVisible()

  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-start-node'))
    g.select(g.getCellById('x6-process-node'))
  })
  await page.locator('.tool-button', { hasText: '设为子元素' }).click()

  await page.locator('.x6-inspector-tab', { hasText: '操作' }).click()
  const childOperation = page.locator('.x6-operation-item', { hasText: '设为子元素' }).first()
  await childOperation.getByRole('button', { name: '回退到此前' }).click()
  await childOperation.getByRole('button', { name: '确认回退' }).click()
  await expect.poll(() => page.evaluate(() => (
    (window as any).__x6graph.getCellById('x6-start-node').getParent()?.id ?? null
  ))).toBe(null)

  // 不等待 CanvasPage 的 500ms 防抖，直接切走，覆盖卸载 flush 的竞态窗口。
  await page.getByTitle('新建页面').click()
  await page.getByRole('menuitem', { name: '画板' }).click()
  await expect(page.locator('.x6-stage')).toBeVisible()
  await page.getByRole('treeitem', { name: sourceBoardTitle }).click()
  await expect(page.locator('.x6-stage')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    (window as any).__x6graph.getCellById('x6-start-node').getParent()?.id ?? null
  ))).toBe(null)
})

test('extracts selected nodes as a standalone board and turns crossing edges into interfaces', async ({ page }) => {
  await openFreshBoard(page)

  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-start-node'))
    g.select(g.getCellById('x6-process-node'))
  })

  const extractButton = page.getByRole('button', { name: '提取为画板页' })
  await expect(extractButton).toBeEnabled()
  await extractButton.click()

  await expect(page.locator('.page-tree .tree-node').filter({ hasText: '开始 等组件' }).first()).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id="x6-start-node"]')).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id="x6-process-node"]')).toBeVisible()
  await expect(page.locator('.x6-edge-labels').filter({ hasText: '接口：需要分支?' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).__x6graph
    if (!g) return null
    const nodes = g.getNodes().map((node: any) => node.id).sort()
    const edges = g.getEdges().map((edge: any) => ({
      id: edge.id,
      source: edge.getSource(),
      target: edge.getTarget(),
      data: edge.getData(),
      labels: edge.getLabels(),
    }))
    return { nodes, edges }
  })).toEqual({
    nodes: ['x6-process-node', 'x6-start-node'],
    edges: expect.arrayContaining([
      expect.objectContaining({
        id: 'x6-edge-1',
        source: expect.objectContaining({ cell: 'x6-start-node' }),
        target: expect.objectContaining({ cell: 'x6-process-node' }),
      }),
      expect.objectContaining({
        id: 'x6-edge-2',
        source: expect.objectContaining({ cell: 'x6-process-node' }),
        target: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        data: expect.objectContaining({
          boardInterface: expect.objectContaining({
            direction: 'out',
            externalCellId: 'x6-decision-node',
            externalLabel: '需要分支?',
          }),
        }),
        labels: expect.arrayContaining([
          expect.objectContaining({
            attrs: expect.objectContaining({
              label: expect.objectContaining({ text: '接口：需要分支?' }),
            }),
          }),
        ]),
      }),
    ]),
  })

  // 来源画板的选区被替换为可跳转的画板引用，跨界线改接到引用。
  await page.locator('.page-tree .tree-node').filter({ hasText: '未命名画板' }).first().click()
  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).__x6graph
    if (!g) return null
    const reference = g.getNodes().find((node: any) => node.getData()?.extractedBoardReference === true)
    const crossingEdge = g.getCellById('x6-edge-2')
    return {
      nodes: g.getNodes().map((node: any) => node.id).sort(),
      edges: g.getEdges().map((edge: any) => edge.id).sort(),
      referenceId: reference?.id,
      referenceLabel: reference?.attr('label/text'),
      referencePageId: reference?.getData()?.refBlockId,
      crossingSource: crossingEdge?.getSource()?.cell,
      crossingSourcePort: crossingEdge?.getSource()?.port,
      crossingTarget: crossingEdge?.getTarget()?.cell,
      extractedInterfaces: reference?.getData()?.extractedInterfaces,
      interfacePorts: reference?.getPorts()
        .filter((port: any) => String(port.id).startsWith('board-interface-'))
        .map((port: any) => port.id),
    }
  })).toEqual({
    nodes: expect.arrayContaining(['x6-decision-node', 'x6-finish-node']),
    edges: ['x6-edge-2', 'x6-edge-3'],
    referenceId: expect.stringMatching(/^board-page-ref-/),
    referenceLabel: '画板引用：开始 等组件',
    referencePageId: expect.any(String),
    crossingSource: expect.stringMatching(/^board-page-ref-/),
    crossingSourcePort: 'board-interface-x6-edge-2',
    crossingTarget: 'x6-decision-node',
    extractedInterfaces: [expect.objectContaining({
      edgeId: 'x6-edge-2',
      portId: 'board-interface-x6-edge-2',
      side: expect.stringMatching(/^(top|right|bottom|left)$/),
      ratio: expect.any(Number),
    })],
    interfacePorts: ['board-interface-x6-edge-2'],
  })
  await expect(page.locator('.x6-node[data-cell-id="x6-start-node"]')).toHaveCount(0)
  await expect(page.locator('.x6-node[data-cell-id="x6-process-node"]')).toHaveCount(0)

  const referenceNode = page.locator('.x6-node').filter({ hasText: '画板引用：开始 等组件' })
  await expect(referenceNode).toBeVisible()
  await referenceNode.click()
  await page.locator('.inspector-source-row__jump[title="点击跳转"]').click()
  await expect(page.locator('.x6-node[data-cell-id="x6-start-node"]')).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id="x6-process-node"]')).toBeVisible()
})

test('rolling back board extraction stays restored after a page refresh', async ({ page }) => {
  await openFreshBoard(page)

  const sourceBoardTitle = '提取回退来源画板'
  const titleInput = page.locator('.board-canvas-shell__title-input')
  await titleInput.fill(sourceBoardTitle)
  await titleInput.press('Enter')
  await expect(page.getByRole('treeitem', { name: sourceBoardTitle })).toBeVisible()

  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-start-node'))
    g.select(g.getCellById('x6-process-node'))
  })
  await page.getByRole('button', { name: '提取为画板页' }).click()

  // 提取完成后会进入新画板；返回来源画板执行“提取为画板页”的回退。
  await page.getByRole('treeitem', { name: sourceBoardTitle }).click()
  await expect(page.locator('.x6-node').filter({ hasText: '画板引用：开始 等组件' })).toBeVisible()
  await page.locator('.x6-inspector-tab', { hasText: '操作' }).click()
  const extractionOperation = page.locator('.x6-operation-item', { hasText: '提取为画板页' }).first()
  await extractionOperation.getByRole('button', { name: '回退到此前' }).click()
  await extractionOperation.getByRole('button', { name: '确认回退' }).click()

  await expect(page.locator('.x6-node').filter({ hasText: '画板引用：开始 等组件' })).toHaveCount(0)
  await expect(page.locator('.x6-node[data-cell-id="x6-start-node"]')).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id="x6-process-node"]')).toBeVisible()

  await page.reload()
  await page.getByRole('treeitem', { name: sourceBoardTitle }).click()
  await expect(page.locator('.x6-stage')).toBeVisible()
  await expect(page.locator('.x6-node').filter({ hasText: '画板引用：开始 等组件' })).toHaveCount(0)
  await expect(page.locator('.x6-node[data-cell-id="x6-start-node"]')).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id="x6-process-node"]')).toBeVisible()
})

test('extracting Ctrl+A keeps independent nodes together with a selected group', async ({ page }) => {
  await openFreshBoard(page)

  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-decision-node'))
    g.select(g.getCellById('x6-finish-node'))
  })
  await page.locator('.tool-button', { hasText: '设为子元素' }).click()
  await expect.poll(() => page.evaluate(() => (
    (window as any).__x6graph.getCellById('x6-decision-node').getParent()?.id
  ))).toBe('x6-finish-node')

  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-process-node'))
    g.select(g.getCellById('x6-finish-node'))
  })
  await page.locator('.tool-button', { hasText: '组合' }).click()
  const groupContainer = page.locator('.x6-node[data-shape="board-group"]')
  await expect(groupContainer).toHaveCount(1)

  await groupContainer.click({ force: true })
  await page.keyboard.press('Control+a')
  await expect(page.locator('.toolbar-summary').filter({ hasText: '已选中' })).toHaveText('已选中 8 个对象')
  const sourceLayout = await page.evaluate(() => {
    const g = (window as any).__x6graph
    return Object.fromEntries(g.getNodes().map((node: any) => {
      const position = node.getPosition()
      const size = node.getSize()
      return [node.id, {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        parent: node.getParent()?.id ?? null,
      }]
    }))
  })
  await page.getByRole('button', { name: '提取为画板页' }).click()

  await expect(page.locator('.x6-node[data-cell-id="x6-start-node"]')).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id="x6-process-node"]')).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id="x6-decision-node"]')).toBeVisible()
  await expect(page.locator('.x6-node[data-cell-id="x6-finish-node"]')).toBeVisible()
  await expect(page.locator('.x6-node[data-shape="board-group"]')).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).__x6graph
    return {
      nodeIds: g?.getNodes().map((node: any) => node.id).sort(),
      edgeIds: g?.getEdges().map((edge: any) => edge.id).sort(),
    }
  })).toEqual({
    nodeIds: expect.arrayContaining([
      'x6-start-node',
      'x6-process-node',
      'x6-decision-node',
      'x6-finish-node',
    ]),
    edgeIds: ['x6-edge-1', 'x6-edge-2', 'x6-edge-3'],
  })

  const assertRelativeLayoutPreserved = async () => {
    const extractedLayout = await page.evaluate(() => {
      const g = (window as any).__x6graph
      return Object.fromEntries(g.getNodes().map((node: any) => {
        const position = node.getPosition()
        const size = node.getSize()
        return [node.id, {
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          parent: node.getParent()?.id ?? null,
        }]
      }))
    })
    const ids = Object.keys(sourceLayout)
    const anchorId = 'x6-start-node'
    const dx = extractedLayout[anchorId].x - sourceLayout[anchorId].x
    const dy = extractedLayout[anchorId].y - sourceLayout[anchorId].y
    for (const id of ids) {
      expect(extractedLayout[id]).toEqual({
        x: sourceLayout[id].x + dx,
        y: sourceLayout[id].y + dy,
        width: sourceLayout[id].width,
        height: sourceLayout[id].height,
        parent: sourceLayout[id].parent,
      })
    }
  }
  await assertRelativeLayoutPreserved()

  // Persistence round-trip must not trigger a second parent/container layout.
  const extractedPageTitle = await page.locator('.page-tree .el-tree-node.is-current .node-label').textContent()
  expect(extractedPageTitle).toBeTruthy()
  await page.locator('.page-tree .tree-node').filter({ hasText: '未命名画板' }).first().click()
  await page.locator('.page-tree .tree-node').filter({ hasText: extractedPageTitle! }).first().click()
  await assertRelativeLayoutPreserved()
})

test('board reference content mode renders proportionally and writes edits back to the source board', async ({ page }) => {
  await openFreshBoard(page)

  await page.evaluate(() => {
    const g = (window as any).__x6graph
    g.cleanSelection()
    g.select(g.getCellById('x6-start-node'))
    g.select(g.getCellById('x6-process-node'))
  })
  await page.getByRole('button', { name: '提取为画板页' }).click()
  await expect(page.locator('.page-tree .el-tree-node.is-current .node-label'))
    .not.toHaveText('未命名画板')
  const extractedTitle = await page.locator('.page-tree .el-tree-node.is-current .node-label').textContent()
  expect(extractedTitle).toBeTruthy()
  const extractedInterfaceTerminal = await page.evaluate(() => (
    structuredClone((window as any).__x6graph.getCellById('x6-edge-2').getTarget())
  ))

  await page.locator('.page-tree .tree-node').filter({ hasText: '未命名画板' }).first().click()
  const referenceId = await page.evaluate(() => {
    const g = (window as any).__x6graph;
    (window as any).__outerBoardGraph = g
    return g.getNodes().find((node: any) => node.getData()?.extractedBoardReference)?.id
  })
  expect(referenceId).toBeTruthy()
  await page.locator(`.x6-node[data-cell-id="${referenceId}"]`).click()
  await page.locator('.inspector-reference-display select').selectOption('content')

  const preview = page.locator('.x6-board-reference-preview')
  await expect(preview).toBeVisible()
  await expect(preview.locator('.x6-node[data-cell-id="x6-start-node"]')).toBeVisible()
  await expect(preview.locator('.x6-node[data-cell-id="x6-process-node"]')).toBeVisible()

  // Selecting inside the reference must be cleared by a click in the outer
  // board as well, not only by another click inside the reference.
  const outerNodeBox = await page.evaluate((refId) => {
    const outer = (window as any).__outerBoardGraph
    const node = outer.getNodes().find((item: any) => item.id !== refId)
    const element = node && outer.findViewByCell(node)?.container as HTMLElement | undefined
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }, referenceId)
  expect(outerNodeBox).not.toBeNull()
  await page.evaluate(() => {
    const nested = (window as any).__x6graph
    nested.resetSelection([nested.getCellById('x6-start-node')])
  })
  await expect.poll(() => page.evaluate(() => (window as any).__x6graph.getSelectedCells().length)).toBe(1)
  await page.mouse.click(
    outerNodeBox!.x + outerNodeBox!.width / 2,
    outerNodeBox!.y + outerNodeBox!.height / 2,
  )
  await expect.poll(() => page.evaluate(() => (window as any).__x6graph.getSelectedCells().length)).toBe(0)

  const boundedTerminal = await page.evaluate(() => {
    const g = (window as any).__x6graph
    const edge = g.getCellById('x6-edge-1')
    const rect = g.container.getBoundingClientRect()
    const topLeft = g.clientToLocal(rect.left, rect.top)
    const bottomRight = g.clientToLocal(rect.right, rect.bottom)
    const boundaryX = Math.max(topLeft.x, bottomRight.x)
    const middleY = (topLeft.y + bottomRight.y) / 2
    edge.setTarget({ x: boundaryX + 240, y: middleY }, { ui: true })
    return {
      allowBlank: g.options.connecting.allowBlank,
      boundaryX,
      target: edge.getTarget(),
    }
  })
  expect(boundedTerminal.allowBlank).toBe(true)
  expect(boundedTerminal.target.x).toBeCloseTo(boundedTerminal.boundaryX, 4)

  await page.evaluate(() => {
    const g = (window as any).__x6graph
    const edge = g.getCellById('x6-edge-2')
    const source = edge.getSourcePoint()
    const target = edge.getTargetPoint()
    edge.setVertices([{
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2 - 36,
    }])
    g.resetSelection([edge])
  })
  const clearVerticesButton = preview.locator('[data-action="clear-edge-vertices"]')
  await expect(clearVerticesButton).toBeVisible()
  await clearVerticesButton.click()
  await expect.poll(() => page.evaluate(() => (
    (window as any).__x6graph.getCellById('x6-edge-2').getVertices().length
  ))).toBe(0)

  // The editable preview intercepts the outer X6 node click. Clicking its
  // wrapper must still create the same native transform handles as a normal node.
  await page.evaluate(() => (window as any).__outerBoardGraph.cleanSelection())
  await expect(page.locator('.x6-widget-transform-resize')).toHaveCount(0)
  await expect(preview).toHaveAttribute('data-wheel-active', 'false')

  const nestedStage = preview.locator('.x6-stage')
  const nestedStageBox = await nestedStage.boundingBox()
  expect(nestedStageBox).not.toBeNull()
  const readBoardZooms = () => page.evaluate(() => ({
    outer: (window as any).__outerBoardGraph.zoom(),
    nested: (window as any).__x6graph.zoom(),
  }))

  // An unselected reference lets the outer board own the wheel gesture.
  const beforeOuterWheel = await readBoardZooms()
  const previewBeforeOuterWheel = await preview.boundingBox()
  const nodeBeforeOuterWheel = await preview.locator('.x6-node[data-cell-id="x6-start-node"]').boundingBox()
  expect(previewBeforeOuterWheel).not.toBeNull()
  expect(nodeBeforeOuterWheel).not.toBeNull()
  await page.mouse.move(
    nestedStageBox!.x + nestedStageBox!.width / 2,
    nestedStageBox!.y + nestedStageBox!.height / 2,
  )
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 120)
  await page.keyboard.up('Control')
  await expect.poll(async () => (await readBoardZooms()).outer)
    .toBeLessThan(beforeOuterWheel.outer)
  await expect.poll(async () => {
    const resizedPreview = await preview.boundingBox()
    const resizedNode = await preview.locator('.x6-node[data-cell-id="x6-start-node"]').boundingBox()
    if (!resizedPreview || !resizedNode) return Number.POSITIVE_INFINITY
    const referenceRatio = resizedPreview.width / previewBeforeOuterWheel!.width
    const contentRatio = resizedNode.width / nodeBeforeOuterWheel!.width
    return Math.abs(referenceRatio - contentRatio)
  }).toBeLessThan(0.03)

  await preview.locator('.x6-board-reference-preview__header').click()
  await expect(page.locator('.x6-widget-transform-resize')).toHaveCount(8)
  await expect(preview).toHaveAttribute('data-wheel-active', 'true')

  // Once selected, the same gesture belongs only to the referenced board and
  // must not bubble back into the outer board.
  const beforeNestedWheel = await readBoardZooms()
  const selectedNestedStageBox = await nestedStage.boundingBox()
  expect(selectedNestedStageBox).not.toBeNull()
  await page.mouse.move(
    selectedNestedStageBox!.x + selectedNestedStageBox!.width / 2,
    selectedNestedStageBox!.y + selectedNestedStageBox!.height / 2,
  )
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 120)
  await page.keyboard.up('Control')
  await expect.poll(async () => (await readBoardZooms()).nested)
    .toBeLessThan(beforeNestedWheel.nested)
  expect((await readBoardZooms()).outer).toBeCloseTo(beforeNestedWheel.outer, 5)

  const geometry = await page.evaluate((id) => {
    const wrapper = document.querySelector(`.x6-node[data-cell-id="${id}"]`)?.getBoundingClientRect()
    const previewElement = document.querySelector('.x6-board-reference-preview')?.getBoundingClientRect()
    if (!wrapper || !previewElement) return null
    return {
      wrapper: { width: wrapper.width, height: wrapper.height },
      preview: {
        left: previewElement.left - wrapper.left,
        top: previewElement.top - wrapper.top,
        width: previewElement.width,
        height: previewElement.height,
      },
    }
  }, referenceId)
  expect(geometry).not.toBeNull()
  expect(geometry!.wrapper.width).toBeGreaterThan(300)
  expect(geometry!.wrapper.height).toBeGreaterThan(200)
  expect(Math.abs(geometry!.preview.left)).toBeLessThanOrEqual(6)
  expect(Math.abs(geometry!.preview.top)).toBeLessThanOrEqual(6)
  expect(Math.abs(geometry!.preview.width - geometry!.wrapper.width)).toBeLessThanOrEqual(8)
  expect(Math.abs(geometry!.preview.height - geometry!.wrapper.height)).toBeLessThanOrEqual(8)

  const interfaceDock = preview.locator('[data-interface-edge-id="x6-edge-2"]')
  await expect(interfaceDock).toBeVisible()
  await expect(preview.locator('.x6-board-reference-preview__interface-line')).toHaveCount(0)
  const dockGeometry = await interfaceDock.evaluate((element) => {
    const dock = element.getBoundingClientRect()
    const wrapper = element.closest('.x6-board-reference-preview')?.getBoundingClientRect()
    if (!wrapper) return null
    return {
      distanceToBorder: Math.min(
        Math.abs(dock.left - wrapper.left),
        Math.abs(dock.right - wrapper.right),
        Math.abs(dock.top - wrapper.top),
        Math.abs(dock.bottom - wrapper.bottom),
      ),
    }
  })
  expect(dockGeometry).not.toBeNull()
  expect(dockGeometry!.distanceToBorder).toBeLessThanOrEqual(6)
  await expect.poll(async () => {
    return measureReferencedBoardInterfaceEndpointGap(page, 'x6-edge-2')
  }).toBeLessThanOrEqual(4)

  const previewBeforeDrag = await preview.boundingBox()
  expect(previewBeforeDrag).not.toBeNull()
  const header = preview.locator('.x6-board-reference-preview__header')
  const headerBox = await header.boundingBox()
  expect(headerBox).not.toBeNull()
  await header.evaluate((element, points) => {
    const pointerId = 71
    element.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId,
      clientX: points.startX,
      clientY: points.startY,
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId,
      clientX: points.endX,
      clientY: points.endY,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId,
      clientX: points.endX,
      clientY: points.endY,
    }))
  }, {
    startX: headerBox!.x + headerBox!.width / 2,
    startY: headerBox!.y + headerBox!.height / 2,
    endX: headerBox!.x + headerBox!.width / 2 + 72,
    endY: headerBox!.y + headerBox!.height / 2 + 44,
  })
  await expect.poll(async () => {
    const moved = await preview.boundingBox()
    if (!moved) return null
    return {
      dx: Math.round(moved.x - previewBeforeDrag!.x),
      dy: Math.round(moved.y - previewBeforeDrag!.y),
    }
  }).toEqual({ dx: 72, dy: 44 })
  await expect(preview.locator('.x6-node[data-cell-id="x6-start-node"]')).toBeVisible()

  const readReferencedNodeGeometry = async () => {
    const nodeBox = await preview.locator('.x6-node[data-cell-id="x6-start-node"]').boundingBox()
    if (!nodeBox) return null
    return {
      x: nodeBox.x,
      y: nodeBox.y,
      width: nodeBox.width,
      height: nodeBox.height,
    }
  }
  const referencedNodeBeforeResize = await readReferencedNodeGeometry()
  expect(referencedNodeBeforeResize).not.toBeNull()

  const previewBeforeResize = await preview.boundingBox()
  expect(previewBeforeResize).not.toBeNull()
  const nativeResizeHandles = page.locator('.x6-widget-transform-resize')
  await expect(nativeResizeHandles).toHaveCount(8)
  for (const position of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) {
    await expect(page.locator(`.x6-widget-transform-resize[data-position="${position}"]`)).toHaveCount(1)
  }
  const resizeHandle = page.locator('.x6-widget-transform-resize[data-position="top-right"]')
  await expect(resizeHandle).toBeVisible()
  const resizeHandleBox = await resizeHandle.boundingBox()
  expect(resizeHandleBox).not.toBeNull()
  await page.mouse.move(
    resizeHandleBox!.x + resizeHandleBox!.width / 2,
    resizeHandleBox!.y + resizeHandleBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    resizeHandleBox!.x + resizeHandleBox!.width / 2 + 64,
    resizeHandleBox!.y + resizeHandleBox!.height / 2 - 40,
    { steps: 6 },
  )
  await page.mouse.up()
  await expect.poll(async () => {
    const resized = await preview.boundingBox()
    if (!resized) return false
    const dy = resized.y - previewBeforeResize!.y
    const dw = resized.width - previewBeforeResize!.width
    const dh = resized.height - previewBeforeResize!.height
    return dy < -30 && dw > 50 && dh > 30 && Math.abs(dy + dh) <= 2
  }).toBe(true)
  await expect(preview.locator('.x6-node[data-cell-id="x6-start-node"]')).toBeVisible()
  await expect.poll(readReferencedNodeGeometry).toEqual({
    x: expect.closeTo(referencedNodeBeforeResize!.x, 1),
    y: expect.closeTo(referencedNodeBeforeResize!.y, 1),
    width: expect.closeTo(referencedNodeBeforeResize!.width, 1),
    height: expect.closeTo(referencedNodeBeforeResize!.height, 1),
  })
  await expect.poll(async () => {
    return measureReferencedBoardInterfaceEndpointGap(page, 'x6-edge-2')
  }).toBeLessThanOrEqual(4)

  const previewBeforeNorthWestResize = await preview.boundingBox()
  expect(previewBeforeNorthWestResize).not.toBeNull()
  const northWestHandle = page.locator('.x6-widget-transform-resize[data-position="top-left"]')
  const northWestHandleBox = await northWestHandle.boundingBox()
  expect(northWestHandleBox).not.toBeNull()
  await page.mouse.move(
    northWestHandleBox!.x + northWestHandleBox!.width / 2,
    northWestHandleBox!.y + northWestHandleBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    northWestHandleBox!.x + northWestHandleBox!.width / 2 - 24,
    northWestHandleBox!.y + northWestHandleBox!.height / 2 - 20,
    { steps: 4 },
  )
  await page.mouse.up()
  await expect.poll(async () => {
    const resized = await preview.boundingBox()
    if (!resized) return false
    const dx = resized.x - previewBeforeNorthWestResize!.x
    const dy = resized.y - previewBeforeNorthWestResize!.y
    const dw = resized.width - previewBeforeNorthWestResize!.width
    const dh = resized.height - previewBeforeNorthWestResize!.height
    return dx < -15
      && dy < -15
      && dw > 15
      && dh > 15
      && Math.abs(dx + dw) <= 2
      && Math.abs(dy + dh) <= 2
  }).toBe(true)
  await expect.poll(readReferencedNodeGeometry).toEqual({
    x: expect.closeTo(referencedNodeBeforeResize!.x, 1),
    y: expect.closeTo(referencedNodeBeforeResize!.y, 1),
    width: expect.closeTo(referencedNodeBeforeResize!.width, 1),
    height: expect.closeTo(referencedNodeBeforeResize!.height, 1),
  })

  const movedPreviewBox = await preview.boundingBox()
  expect(movedPreviewBox).not.toBeNull()
  const dockHandle = interfaceDock.locator('.x6-board-reference-preview__interface-dock')
  const dockHandleBox = await dockHandle.boundingBox()
  expect(dockHandleBox).not.toBeNull()
  await dockHandle.evaluate((element, points) => {
    const pointerId = 91
    element.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId,
      clientX: points.startX,
      clientY: points.startY,
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId,
      clientX: points.startX - 8,
      clientY: points.startY,
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId,
      clientX: points.endX,
      clientY: points.endY,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId,
      clientX: points.endX,
      clientY: points.endY,
    }))
  }, {
    startX: dockHandleBox!.x + dockHandleBox!.width / 2,
    startY: dockHandleBox!.y + dockHandleBox!.height / 2,
    endX: movedPreviewBox!.x + 2,
    endY: movedPreviewBox!.y + movedPreviewBox!.height * 0.66,
  })

  await expect.poll(async () => {
    const dock = await dockHandle.boundingBox()
    if (!dock) return null
    return Math.round((dock.x + dock.width / 2) - movedPreviewBox!.x)
  }).toBeLessThanOrEqual(6)
  await expect.poll(() => (
    measureReferencedBoardInterfaceEndpointGap(page, 'x6-edge-2')
  )).toBeLessThanOrEqual(4)
  const interfaceAlignment = await page.evaluate(({ id, portId }) => {
    const previewElement = document.querySelector('.x6-board-reference-preview')
    const dock = previewElement?.querySelector('.x6-board-reference-preview__interface-dock')?.getBoundingClientRect()
    const outerEdge = Array.from(document.querySelectorAll(`.x6-edge[data-cell-id="${id}"]`))
      .find((element) => !previewElement?.contains(element))
    const path = outerEdge?.querySelector<SVGPathElement>('.x6-edge-connection')
      ?? outerEdge?.querySelector<SVGPathElement>('path')
    const matrix = path?.getScreenCTM()
    const edgeEnds = path && matrix
      ? [0, path.getTotalLength()].map((length) => {
        const point = path.getPointAtLength(length)
        return new DOMPoint(point.x, point.y).matrixTransform(matrix)
      })
      : []
    if (!dock || !edgeEnds.length) return null
    const dockCenter = { x: dock.left + dock.width / 2, y: dock.top + dock.height / 2 }
    return {
      edgeDistance: Math.min(...edgeEnds.map((point) => (
        Math.hypot(dockCenter.x - point.x, dockCenter.y - point.y)
      ))),
    }
  }, { id: 'x6-edge-2' })
  expect(interfaceAlignment).not.toBeNull()
  expect(interfaceAlignment!.edgeDistance).toBeLessThanOrEqual(12)

  await expect.poll(() => page.evaluate(() => (
    (window as any).__x6graph?.getCellById('x6-start-node')?.id
  ))).toBe('x6-start-node')
  await page.evaluate(() => {
    const nestedGraph = (window as any).__x6graph
    nestedGraph.getCellById('x6-start-node').attr('label/text', '主机（引用内同步）')
  })

  await page.locator('.page-tree .tree-node').filter({ hasText: extractedTitle! }).first().click()
  await expect(page.getByText('不能在画板内展开其自身引用')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (
    (window as any).__x6graph?.getCellById('x6-start-node')?.attr('label/text')
  ))).toBe('主机（引用内同步）')
  await expect.poll(() => page.evaluate(() => (
    structuredClone((window as any).__x6graph?.getCellById('x6-edge-2')?.getTarget())
  ))).toEqual(extractedInterfaceTerminal)
  await expect.poll(() => page.evaluate((title) => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    const sourcePage = state.pages?.find((item: { title?: string }) => item.title === title)
    const graphData = sourcePage ? state.contents?.[sourcePage.id]?.embeds?.[0]?.graphData : null
    const cells = graphData?.cells ?? []
    return {
      label: cells.find((cell: any) => cell.id === 'x6-start-node')?.attrs?.label?.text,
      selfReferences: cells.filter((cell: any) => (
        cell.data?.extractedBoardReference === true
        && cell.data?.refBlockId === sourcePage?.id
      )).length,
    }
  }, extractedTitle)).toEqual({ label: '主机（引用内同步）', selfReferences: 0 })

  const restoredSourceTreeNode = page.locator('.page-tree .tree-node').filter({ hasText: '未命名画板' }).first()
  await expect(async () => {
    await restoredSourceTreeNode.click()
    await expect(page.locator('.page-tree .el-tree-node.is-current .node-label')).toHaveText('未命名画板')
  }).toPass()
  const restoredPreview = page.locator('.x6-board-reference-preview')
  await expect(restoredPreview).toBeVisible()
  await expect.poll(async () => {
    const restoredBox = await restoredPreview.boundingBox()
    const restoredDock = await restoredPreview
      .locator('[data-interface-edge-id="x6-edge-2"] .x6-board-reference-preview__interface-dock')
      .boundingBox()
    if (!restoredBox || !restoredDock) return null
    return Math.round((restoredDock.x + restoredDock.width / 2) - restoredBox.x)
  }).toBeLessThanOrEqual(6)
})

test('source-board interface edge edits do not change the reference board after its initial default', async ({ page }) => {
  await openFreshBoard(page)

  await page.evaluate(() => {
    const graph = (window as any).__x6graph
    graph.cleanSelection()
    graph.select(graph.getCellById('x6-start-node'))
    graph.select(graph.getCellById('x6-process-node'))
  })
  await page.getByRole('button', { name: '提取为画板页' }).click()
  await expect(page.locator('.page-tree .el-tree-node.is-current .node-label'))
    .not.toHaveText('未命名画板')
  const extractedTitle = await page.locator('.page-tree .el-tree-node.is-current .node-label').textContent()
  expect(extractedTitle).toBeTruthy()

  await page.locator('.page-tree .tree-node').filter({ hasText: '未命名画板' }).first().click()
  const referenceId = await page.evaluate(() => (
    (window as any).__x6graph.getNodes().find((node: any) => (
      node.getData()?.extractedBoardReference
    ))?.id
  ))
  expect(referenceId).toBeTruthy()
  await page.locator(`.x6-node[data-cell-id="${referenceId}"]`).click()
  await page.locator('.inspector-reference-display select').selectOption('content')

  const preview = page.locator('.x6-board-reference-preview')
  await expect(preview).toBeVisible()
  const initialReferenceInterface = await page.evaluate(() => {
    const graph = (window as any).__x6graph
    const edge = graph.getCellById('x6-edge-2')
    return {
      vertices: structuredClone(edge.getVertices()),
      stroke: edge.attr('line/stroke'),
    }
  })

  await page.locator('.page-tree .tree-node').filter({ hasText: extractedTitle! }).first().click()
  await page.evaluate(() => {
    const graph = (window as any).__x6graph
    const edge = graph.getCellById('x6-edge-2')
    edge.setVertices([{ x: 280, y: 36 }])
    edge.attr('line/stroke', '#ef4444')
  })
  await expect.poll(() => page.evaluate(() => {
    const edge = (window as any).__x6graph.getCellById('x6-edge-2')
    return { vertices: edge.getVertices(), stroke: edge.attr('line/stroke') }
  })).toEqual({ vertices: [{ x: 280, y: 36 }], stroke: '#ef4444' })

  await page.locator('.page-tree .tree-node').filter({ hasText: '未命名画板' }).first().click()
  await page.locator(`.x6-node[data-cell-id="${referenceId}"]`).click()
  await page.locator('.inspector-reference-display select').selectOption('content')
  await expect(preview).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const graph = (window as any).__x6graph
    const edge = graph.getCellById('x6-edge-2')
    return { vertices: structuredClone(edge.getVertices()), stroke: edge.attr('line/stroke') }
  })).toEqual(initialReferenceInterface)
})

test('unused board reference border anchors disappear after detaching or deleting their edge', async ({ page }) => {
  await openFreshBoard(page)

  await page.evaluate(() => {
    const graph = (window as any).__x6graph
    graph.cleanSelection()
    graph.select(graph.getCellById('x6-start-node'))
    graph.select(graph.getCellById('x6-process-node'))
  })
  await page.getByRole('button', { name: '提取为画板页' }).click()
  await expect(page.locator('.page-tree .el-tree-node.is-current .node-label'))
    .not.toHaveText('未命名画板')
  await page.locator('.page-tree .tree-node').filter({ hasText: '未命名画板' }).first().click()
  await expect(page.locator('.page-tree .el-tree-node.is-current .node-label'))
    .toHaveText('未命名画板')

  const interfaceIdentity = await page.evaluate(() => {
    const graph = (window as any).__x6graph
    const reference = graph.getNodes().find((node: any) => (
      node.getData()?.extractedBoardReference
    ))
    const item = reference.getData().extractedInterfaces[0]
    return { nodeId: reference.id, edgeId: item.edgeId, portId: item.portId }
  })

  const readAnchorState = () => page.evaluate(({ nodeId, portId }) => {
    const graph = (window as any).__x6graph
    const reference = graph.getCellById(nodeId)
    const item = reference.getData().extractedInterfaces.find((entry: any) => (
      entry.portId === portId
    ))
    return {
      portVisible: reference.getPorts().some((port: any) => port.id === portId),
      detached: item?.interfaceDetached === true,
      terminalUsesPort: graph.getEdges().some((edge: any) => (
        [edge.getSource(), edge.getTarget()].some((terminal: any) => (
          terminal?.cell === nodeId && terminal?.port === portId
        ))
      )),
    }
  }, interfaceIdentity)

  await expect.poll(readAnchorState).toEqual({
    portVisible: true,
    detached: false,
    terminalUsesPort: true,
  })

  await page.evaluate(({ edgeId }) => {
    const graph = (window as any).__x6graph
    graph.getCellById(edgeId).setSource({ x: 920, y: 520 })
  }, interfaceIdentity)
  await expect.poll(readAnchorState).toEqual({
    portVisible: false,
    detached: true,
    terminalUsesPort: false,
  })

  await page.evaluate(({ nodeId, edgeId, portId }) => {
    const graph = (window as any).__x6graph
    graph.getCellById(edgeId).setSource({ cell: nodeId, port: portId })
  }, interfaceIdentity)
  await expect.poll(readAnchorState).toEqual({
    portVisible: true,
    detached: false,
    terminalUsesPort: true,
  })

  await page.evaluate(({ edgeId }) => {
    const graph = (window as any).__x6graph
    graph.removeCell(edgeId)
  }, interfaceIdentity)
  await expect.poll(readAnchorState).toEqual({
    portVisible: false,
    detached: true,
    terminalUsesPort: false,
  })
})

test('deleting a selected group container with the Delete key dissolves it without crashing', async ({ page }) => {
  await openFreshBoard(page)

  const startNode = page.locator('.x6-node[data-cell-id="x6-start-node"]')
  const processNode = page.locator('.x6-node[data-cell-id="x6-process-node"]')
  const groupContainer = page.locator('.x6-node[data-board-group="true"], .x6-node:has(g[data-board-group="true"])')
  const groupButton = page.locator('.tool-button', { hasText: '组合' })

  await startNode.click()
  await processNode.click({ modifiers: ['Control'] })
  await groupButton.click()
  await expect(groupContainer).toHaveCount(1)

  // 选中容器后按 Delete：容器移除，成员保留（等价于取消组合）
  await groupContainer.click({ position: { x: 6, y: 6 } })
  await expect(groupContainer).toHaveClass(/x6-node-selected/)
  await page.keyboard.press('Delete')
  await expect(groupContainer).toHaveCount(0)
  await expect(startNode).toBeVisible()
  await expect(processNode).toBeVisible()

  // 组合回退：多选成员后再次组合，删除后组内剩余不足 2 成员的组自动解散
  await startNode.click()
  await processNode.click({ modifiers: ['Control'] })
  await groupButton.click()
  await expect(groupContainer).toHaveCount(1)
  // 钻取选中单个成员并删除 → 组内只剩 1 个成员，自动解散且不报错
  await startNode.click()
  await expect(startNode).toHaveClass(/x6-node-selected/)
  await page.keyboard.press('Backspace')
  await expect(groupContainer).toHaveCount(0)
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

  // Alt+单击选中单个成员 → 单独拖动它，边框随成员收束，其余成员不动
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
  // 被选中的成员发生了位移
  expect(startAfter.x - startBefore.x).not.toBe(0)
  expect(startAfter.y - startBefore.y).not.toBe(0)
  // 边框随成员收束：容器左上角仍 = 成员包围盒左上角 - padding（此处 start 右移，minX 增大）
  expect(containerAfter.x - containerBefore.x).toBeCloseTo(startAfter.x - startBefore.x, 0)
  // 未被选中的成员保持不动
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

test('group border preset switches in inspector and the frame auto-fits members', async ({ page }) => {
  await openFreshBoard(page)

  const startNode = '.x6-node[data-cell-id="x6-start-node"]'
  const processNode = '.x6-node[data-cell-id="x6-process-node"]'
  const groupContainer = page.locator('.x6-node[data-shape="board-group"]')
  const groupButton = page.locator('.tool-button', { hasText: '组合' })
  const borderSelect = page.locator('.x6-inspector .field', { hasText: '组合边框' }).locator('select')
  const containerRect = groupContainer.locator('rect').first()

  // 建立组合，默认紧贴边界（无虚线）
  await page.locator(startNode).click()
  await page.locator(processNode).click({ modifiers: ['Control'] })
  await groupButton.click()
  await expect(groupContainer).toHaveCount(1)

  const dash = await containerRect.getAttribute('stroke-dasharray')
  expect(!dash || dash === 'none').toBeTruthy()

  // 展开「样式」区，露出组合边框预设选择
  await page.locator('.x6-inspector .inspector-section__toggle', { hasText: '样式' }).click()
  await expect(borderSelect).toBeVisible()

  const rectSize = await groupContainer.evaluate((el) => {
    const box = el.getBoundingClientRect()
    return { width: box.width, height: box.height }
  })

  // 切到高亮边框：出现虚线
  await borderSelect.selectOption('highlight')
  await expect(containerRect).toHaveAttribute('stroke-dasharray', '6 4')
  const highlightSize = await groupContainer.evaluate((el) => {
    const box = el.getBoundingClientRect()
    return { width: box.width, height: box.height }
  })
  // 高亮内缩边距更大 → 边框更大
  expect(highlightSize.width).toBeGreaterThan(rectSize.width)
  expect(highlightSize.height).toBeGreaterThan(rectSize.height)

  // 切回紧贴边界
  await borderSelect.selectOption('tight')
  await expect(containerRect).not.toHaveAttribute('stroke-dasharray', '6 4')

  // Alt+单击选中成员并拖动放大组合范围 → 边框自动扩展（不再收在旧范围）
  await page.locator(startNode).click({ modifiers: ['Alt'] })
  await expect(page.locator(startNode)).toHaveClass(/x6-node-selected/)
  const containerBefore = await boardNodeTranslate(page, '.x6-node[data-shape="board-group"]')
  const startBefore = await boardNodeTranslate(page, startNode)
  const processBefore = await boardNodeTranslate(page, processNode)
  await dragNodeBy(page, startNode, 40, 40)
  const containerAfter = await boardNodeTranslate(page, '.x6-node[data-shape="board-group"]')
  const startAfter = await boardNodeTranslate(page, startNode)
  const processAfter = await boardNodeTranslate(page, processNode)
  // 成员右移 → 容器左上角随成员前进（紧贴成员包围盒的左边界）
  expect(containerAfter.x - containerBefore.x).toBeCloseTo(startAfter.x - startBefore.x, 0)
  // 未被选中的成员不动，且容器仍包住它
  expect(Math.abs(processAfter.x - containerBefore.x)).toBeGreaterThan(0)
  expect(Math.abs(processAfter.x - processBefore.x)).toBeLessThan(1)
})

test('creates a new sibling document from a node via the content panel', async ({ page }) => {
  await page.getByTitle('新建页面').click()
  await page.getByRole('menuitem', { name: '画板' }).click()
  await expect(page.locator('.x6-stage')).toBeVisible()

  // 选中“开始”节点，「内容」属性区默认展开，「内容绑定」面板可见
  await page.locator('.x6-node[data-cell-id="x6-start-node"]').click()
  const bindSection = page.locator('.x6-cell-content__bind')
  await expect(bindSection).toBeVisible()

  // 未绑定态：显示「新建」按钮，提示含「未绑定」
  const createBtn = bindSection.getByRole('button', { name: '新建', exact: true })
  await expect(createBtn).toBeVisible()
  await expect(bindSection.locator('.x6-cell-content__hint')).toContainText('未绑定')

  await createBtn.click()

  // 绑定态：按钮变为「更换」+「解除」，提示含「已绑定」
  await expect(bindSection.getByRole('button', { name: '更换' })).toBeVisible()
  await expect(bindSection.getByRole('button', { name: '解除' })).toBeVisible()
  await expect(bindSection.locator('.x6-cell-content__hint')).toContainText('已绑定')

  // 以节点标签“开始”为名的新文档出现在页面树
  const newDocNode = page.locator('.page-tree .tree-node .node-label').filter({ hasText: '开始' })
  await expect(newDocNode).toBeVisible()

  // 新文档是画板页“未命名画板”的同级，且紧随其正下方
  const topLabels = await page.evaluate(() => {
    const top = Array.from(document.querySelectorAll('.page-tree > .el-tree-node'))
    return top.map((n) => {
      const content = n.querySelector(':scope > .el-tree-node__content')
      return content?.querySelector('.node-label')?.textContent?.trim() ?? ''
    })
  })
  const boardIdx = topLabels.findIndex((t) => t === '未命名画板')
  const docIdx = topLabels.findIndex((t) => t === '开始')
  expect(boardIdx).toBeGreaterThanOrEqual(0)
  expect(docIdx).toBe(boardIdx + 1)
})

test('arrow keys nudge the selected node by 1px and shift+arrow by 10px', async ({ page }) => {
  await openFreshBoard(page)

  const startNode = '.x6-node[data-cell-id="x6-start-node"]'
  await page.locator(startNode).click()
  await expect(page.locator(startNode)).toHaveClass(/x6-node-selected/)

  const before = await boardNodeTranslate(page, startNode)

  // 方向键：每次 1px
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => boardNodeTranslate(page, startNode).then((p) => p.x)).toBeCloseTo(before.x + 1, 5)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => boardNodeTranslate(page, startNode).then((p) => p.y)).toBeCloseTo(before.y + 1, 5)

  // Shift + 方向键：每次 10px
  await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(() => boardNodeTranslate(page, startNode).then((p) => p.x)).toBeCloseTo(before.x + 11, 5)
  await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(() => boardNodeTranslate(page, startNode).then((p) => p.y)).toBeCloseTo(before.y + 11, 5)

  // 无选中节点时方向键不应移动画板（点击空白取消选择）
  await page.locator('.x6-stage').click({ position: { x: 10, y: 10 } })
  await expect(page.locator('.toolbar-summary', { hasText: '未选中对象' })).toBeVisible()
  const afterDeselect = await boardNodeTranslate(page, startNode)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(60)
  const afterIdle = await boardNodeTranslate(page, startNode)
  expect(afterIdle.x).toBeCloseTo(afterDeselect.x, 5)
})

test('right-click drag does not trigger the browser context menu on the canvas', async ({ page }) => {
  await openFreshBoard(page)

  // 浏览器手势在右键按下时就可能开始：必须提前 preventDefault，而不只是
  // 等到拖动结束后的 contextmenu。
  const rightPointerDownPrevented = await page.evaluate(() => {
    const stage = document.querySelector('.x6-stage')
    if (!stage) return null
    const e = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
      pointerId: 99,
      pointerType: 'mouse',
    })
    stage.dispatchEvent(e)
    return e.defaultPrevented
  })
  expect(rightPointerDownPrevented).toBe(true)

  // 合成 contextmenu 事件：stage 与节点都应被 preventDefault
  const preventedOnStage = await page.evaluate(() => {
    const stage = document.querySelector('.x6-stage')
    if (!stage) return null
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
    stage.dispatchEvent(e)
    return e.defaultPrevented
  })
  expect(preventedOnStage).toBe(true)

  const preventedOnNode = await page.evaluate(() => {
    const node = document.querySelector('.x6-node')
    if (!node) return null
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
    node.dispatchEvent(e)
    return e.defaultPrevented
  })
  expect(preventedOnNode).toBe(true)

  // 真实右键拖动平移后触发的 contextmenu 也应被 preventDefault
  await page.evaluate(() => {
    // bubble 阶段在 stage 监听之后读取 defaultPrevented
    document.addEventListener('contextmenu', (e) => {
      (window as any).__ctxPrevented = e.defaultPrevented
    })
  })
  const stageBox = await page.locator('.x6-stage').boundingBox()
  expect(stageBox).toBeTruthy()
  const cx = stageBox!.x + stageBox!.width / 2
  const cy = stageBox!.y + stageBox!.height / 2
  const startNode = page.locator('.x6-node[data-cell-id="x6-start-node"]')
  const nodeBefore = await startNode.boundingBox()
  expect(nodeBefore).toBeTruthy()
  await page.mouse.move(cx, cy)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(cx + 40, cy + 30, { steps: 6 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(100)
  const contextMenuState = await page.evaluate(() => (window as any).__ctxPrevented)
  // 自定义 pointer 拖动通常会让 contextmenu 完全不产生；若浏览器仍派发，
  // stage 的兜底监听也必须将其 defaultPrevented。
  expect(contextMenuState === undefined || contextMenuState === true).toBe(true)
  const nodeAfter = await startNode.boundingBox()
  expect(nodeAfter).toBeTruthy()
  expect(nodeAfter!.x).toBeCloseTo(nodeBefore!.x + 40, 0)
  expect(nodeAfter!.y).toBeCloseTo(nodeBefore!.y + 30, 0)
})

test('plain mouse wheel pans the board view vertically; ctrl+wheel still zooms', async ({ page }) => {
  await openFreshBoard(page)

  const stageBox = await page.locator('.x6-stage').boundingBox()
  expect(stageBox).toBeTruthy()
  await page.mouse.move(stageBox!.x + stageBox!.width / 2, stageBox!.y + stageBox!.height / 2)

  const translate = () =>
    page.evaluate(() => (window as any).__x6graph.translate())
  const zoom = () => page.evaluate(() => (window as any).__x6graph.zoom())

  const before = await translate()

  // 向下滚动（deltaY>0）→ 内容上移，ty 减小 120
  await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await translate()).ty).toBeCloseTo(before.ty - 120, 5)

  // 向上滚动 → ty 恢复
  await page.mouse.wheel(0, -120)
  await expect.poll(async () => (await translate()).ty).toBeCloseTo(before.ty, 5)

  // Ctrl + 滚轮 → 缩放而非平移：ty 可能因缩放中心偏移微调，但 zoom 明显增大
  const zoomBefore = await zoom()
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -120)
  await page.keyboard.up('Control')
  await expect.poll(zoom).toBeGreaterThan(zoomBefore * 1.01)
})

test('adding a shape from the toolbar is undoable with Ctrl+Z', async ({ page }) => {
  await openFreshBoard(page)

  const nodeCount = () => page.evaluate(() => (window as any).__x6graph.getNodes().length)
  const before = await nodeCount()

  // 点击工具栏「矩形」按钮在画布中心添加一个节点，随后 Ctrl+Z 应能撤销
  await page.getByRole('button', { name: '矩形', exact: true }).click()
  await expect.poll(nodeCount).toBe(before + 1)
  expect(await page.evaluate(() => (window as any).__x6graph.canUndo())).toBe(true)

  // 工具栏点击会把焦点移出画布，修复后 Ctrl+Z 仍能到达 graph 容器并撤销添加
  await page.keyboard.press('Control+z')
  await expect.poll(nodeCount).toBe(before)

  // 撤销后可重做
  await page.keyboard.press('Control+y')
  await expect.poll(nodeCount).toBe(before + 1)
})

test('the straight-line tool defaults to a pure straight line (line router)', async ({ page }) => {
  await openFreshBoard(page)

  // 进入直线绘制模式
  await page.getByRole('button', { name: '直线连线', exact: true }).click()

  const stage = page.locator('.x6-stage')

  // 在空白区域点击两次创建一条直线
  await stage.click({ position: { x: 100, y: 50 } })
  await page.waitForTimeout(100)
  await stage.click({ position: { x: 100, y: 300 } })
  await page.waitForTimeout(100)

  // 新增连线默认使用「纯直线」（line）路由器
  const routers = await page.evaluate(() => {
    return (window as any).__x6graph.getEdges().map((e: any) => {
      const r = e.getRouter()
      return typeof r === 'string' ? r : r?.name
    })
  })
  // 原有的 3 条 starter 连线 + 新增的 1 条纯直线
  expect(routers.length).toBe(4)
  expect(routers[3]).toBe('line')

  // 选中该连线，属性面板「路由」下拉应显示「纯直线」
  await page.evaluate(() => {
    const g = (window as any).__x6graph
    const edges = g.getEdges()
    g.cleanSelection()
    g.select(edges[edges.length - 1])
  })
  await page.waitForTimeout(60)
  await expect(
    page.locator('.x6-inspector label.field', { hasText: '路由' }).locator('select'),
  ).toHaveValue('line')
})
