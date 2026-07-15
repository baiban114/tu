import { expect, test, type Page } from '@playwright/test'

const readEmbed = async (page: Page, embedId: string) => {
  return page.evaluate((id) => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    return state.contents?.['p-e2e']?.embeds?.find((embed: { id: string }) => embed.id === id)
  }, embedId)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.sessionStorage.getItem('tu:multi-table-e2e-init')) {
      window.localStorage.removeItem('tu:mock-ai-run-logs')
      window.sessionStorage.setItem('tu:multi-table-e2e-init', '1')
    }
    window.localStorage.setItem('tu:mock-state', JSON.stringify({
      knowledgeBases: [
        { id: 'kb-e2e', name: 'E2E', icon: 'T', description: 'E2E mock' },
      ],
      pages: [
        { id: 'p-e2e', kbId: 'kb-e2e', parentId: null, title: '表格列菜单测试', order: 0 },
      ],
      contents: {
        'p-e2e': {
          content: [
            '# 表格列菜单测试',
            '',
            '<!--tu:embed id="table-e2e" type="table"-->',
            '',
            '<!--tu:embed id="mt-e2e" type="multiTable"-->',
          ].join('\n'),
          embeds: [
            {
              id: 'table-e2e',
              type: 'table',
              tableData: {
                textMode: 'plain',
                headers: ['E2E-A', 'E2E-B'],
                rows: [['a1', 'b1'], ['a2', 'b2']],
                columnWidths: [120, 140],
                rowHeights: [38, 38],
              },
            },
            {
              id: 'mt-e2e',
              type: 'multiTable',
              multiTableData: {
                fields: [
                  { id: 'e2eTitle', name: '标题', type: 'text' },
                  {
                    id: 'e2eStatus',
                    name: '状态',
                    type: 'singleSelect',
                    options: [
                      { id: 'todo', label: 'E2E待处理', color: '#e2e8f0' },
                      { id: 'doing', label: 'E2E进行中', color: '#dbeafe' },
                    ],
                  },
                ],
                records: [
                  { id: 'r-1', values: { e2eTitle: 'E2E 任务 A', e2eStatus: 'todo' } },
                ],
                views: [
                  { id: 'view-table', name: '表格', type: 'table' },
                  { id: 'view-kanban', name: '看板', type: 'kanban', groupByFieldId: 'e2eStatus' },
                ],
                activeViewId: 'view-kanban',
              },
            },
          ],
          annotations: [],
        },
      },
    }))
  })
  await page.goto('/')
})

test('opens field actions from the multi-table grid header', async ({ page }) => {
  const block = page.locator('.multi-table').last()
  await expect(block).toBeVisible()

  await block.getByRole('button', { name: '表格' }).click()
  const fieldHeader = block.locator('th[data-field-id="e2eTitle"]').first()
  await expect(fieldHeader).toBeVisible()

  await fieldHeader.click({ button: 'right' })
  const menu = page.locator('.multi-table-menu').filter({ has: page.getByRole('button', { name: '字段设置' }) })
  await expect(menu.getByRole('button', { name: '字段设置' })).toBeVisible()
  await expect(menu.getByRole('button', { name: '在左侧新增列' })).toBeVisible()
  await expect(menu.getByRole('button', { name: '在右侧新增列' })).toBeVisible()
  await expect(menu.getByRole('button', { name: '删除字段' })).toBeVisible()
})

test('inserts a plain table column from the column menu', async ({ page }) => {
  const block = page.locator('.table-block').last()
  await expect(block).toBeVisible()

  await block.locator('thead th.table-block__header-cell').first().click({ button: 'right' })
  const menu = page.locator('.table-block__column-context-menu')
  await expect(menu.getByRole('button', { name: '在左侧新增列' })).toBeVisible()
  await expect(menu.getByRole('button', { name: '在右侧新增列' })).toBeVisible()
  await expect(menu.getByRole('button', { name: '删除列' })).toBeVisible()

  await menu.getByRole('button', { name: '在右侧新增列' }).click()
  await expect(block.locator('thead th.table-block__header-cell')).toHaveCount(3)
  await expect(block.locator('tbody tr').first().locator('td')).toHaveCount(3)

  await expect.poll(async () => {
    const embed = await readEmbed(page, 'table-e2e')
    return {
      headers: embed.tableData.headers.length,
      cells: embed.tableData.rows[0].length,
      widths: embed.tableData.columnWidths.length,
    }
  }).toEqual({ headers: 3, cells: 3, widths: 3 })
})

test('inserts a multi-table field from the field menu', async ({ page }) => {
  const block = page.locator('.multi-table').last()
  await expect(block).toBeVisible()

  await block.getByRole('button', { name: '表格' }).click()
  await block.locator('th[data-field-id="e2eStatus"]').first().click({ button: 'right' })
  const menu = page.locator('.multi-table-menu').filter({ has: page.getByRole('button', { name: '字段设置' }) })
  await menu.getByRole('button', { name: '在左侧新增列' }).click()

  await expect(block.locator('.field-settings input').first()).toHaveValue('字段 3')
  await expect(block.locator('thead th')).toHaveCount(3)

  const insertedFieldId = await block.locator('thead th').nth(1).getAttribute('data-field-id')
  expect(insertedFieldId).toBeTruthy()
  await expect(block.locator('tbody tr').first().locator('td').nth(1).locator('input')).toHaveValue('')
})

test('adds a multi-table record from the grid add row control', async ({ page }) => {
  const block = page.locator('.multi-table').last()
  await expect(block).toBeVisible()

  await block.getByRole('button', { name: '表格' }).click()
  await expect(block.locator('tbody tr')).toHaveCount(2)

  await block.getByRole('button', { name: '+ 新增一行' }).click()
  await expect(block.locator('tbody tr')).toHaveCount(3)
  await expect(block.locator('tbody tr').nth(1).locator('td').first().locator('input')).toHaveValue('')
})

test('resizes multi-table height from the bottom border handle', async ({ page }) => {
  const wrapper = page.locator('.multi-table-block-view .resizable-block-wrapper').last()
  const block = wrapper.locator('.multi-table')
  await expect(block).toBeVisible()

  const before = await wrapper.boundingBox()
  expect(before).toBeTruthy()
  await wrapper.hover()

  const handle = wrapper.locator('.resizable-handle--bottom')
  await expect(handle).toBeVisible()
  const handleBox = await handle.boundingBox()
  expect(handleBox).toBeTruthy()

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2 + 120)
  await page.mouse.up()

  await expect.poll(async () => {
    const box = await wrapper.boundingBox()
    return Math.round(box?.height || 0)
  }).toBeGreaterThan(Math.round(before!.height + 80))

  await expect.poll(async () => {
    const embed = await readEmbed(page, 'mt-e2e')
    return Math.round(Number(embed?.height || 0))
  }).toBeGreaterThan(Math.round(before!.height + 80))
})

async function openMockLearningPlanPreview(page: Page) {
  page.once('dialog', (dialog) => dialog.accept())
  const block = page.locator('.multi-table').last()
  await block.getByRole('button', { name: '学习计划' }).click()
  await block.getByRole('button', { name: 'AI 生成计划' }).click()
  await block.getByPlaceholder('例如：两周内入门机器学习基础').fill('学习 TypeScript')
  await block.getByLabel('总可用小时').fill('12')
  await block.getByRole('button', { name: '生成', exact: true }).click()
  await expect(block.locator('.learning-plan-ai__progress-log')).toContainText('开始生成学习计划')
  await expect(block.locator('.learning-plan-ai__preview')).toContainText('学习 TypeScript 学习计划')
  return block
}

test('cancels mock learning-plan generation', async ({ page }) => {
  page.once('dialog', (dialog) => dialog.accept())
  const block = page.locator('.multi-table').last()
  await block.getByRole('button', { name: '学习计划' }).click()
  await block.getByRole('button', { name: 'AI 生成计划' }).click()
  await block.getByPlaceholder('例如：两周内入门机器学习基础').fill('学习 TypeScript')
  await block.getByRole('button', { name: '生成', exact: true }).click()
  await expect(block.locator('.learning-plan-ai__progress-log')).toBeVisible()
  await block.getByRole('button', { name: '中止' }).click()
  await expect(block.getByText('已中止生成')).toBeVisible()
  await expect(block.locator('.learning-plan-ai__preview')).toHaveCount(0)
})

async function generateMockLearningPlan(page: Page) {
  const block = await openMockLearningPlanPreview(page)
  await block.getByRole('button', { name: '确认替换当前学习计划' }).click()
  return block
}

test('resizes generated learning-plan preview height', async ({ page }) => {
  const block = await openMockLearningPlanPreview(page)
  const preview = block.locator('.learning-plan-ai__preview')
  const before = await preview.boundingBox()
  expect(before).toBeTruthy()

  const handle = preview.locator('.learning-plan-ai__preview-resize')
  await expect(handle).toBeVisible()
  const handleBox = await handle.boundingBox()
  expect(handleBox).toBeTruthy()
  const centerX = handleBox!.x + handleBox!.width / 2
  const centerY = handleBox!.y + handleBox!.height / 2

  await handle.dispatchEvent('mousedown', { button: 0, clientX: centerX, clientY: centerY })
  await page.dispatchEvent('body', 'mousemove', { button: 0, clientX: centerX, clientY: centerY + 90 })
  await page.dispatchEvent('body', 'mouseup', { button: 0, clientX: centerX, clientY: centerY + 90 })

  await expect.poll(async () => {
    const box = await preview.boundingBox()
    return Math.round(box?.height || 0)
  }).toBeGreaterThan(Math.round(before!.height + 60))
})

test('generates a mock learning plan and replaces the table with a task tree', async ({ page }) => {
  const block = await generateMockLearningPlan(page)

  await expect(block.locator('tbody tr.multi-table__tree-row')).toHaveCount(9)
  await expect(block).toContainText('建立基础框架')
  await expect(block).toContainText('梳理概念地图')
  await expect(block.locator('.multi-table__summary')).toContainText('总工时')

  await block.getByRole('button', { name: '看板', exact: true }).click()
  await expect(block.locator('.kanban-card')).toHaveCount(3)
  await expect(block.locator('.kanban-card').first()).toContainText('梳理概念地图')
})

test('writes an agent run log for mock learning-plan generation', async ({ page }) => {
  await openMockLearningPlanPreview(page)

  await page.goto('/settings')
  await page.getByRole('menuitem', { name: 'AI' }).click()
  await expect(page.getByRole('heading', { name: 'Agent 记录' })).toBeVisible()
  await expect(page.locator('.agent-run-log__row')).toContainText('学习计划生成')
  await expect(page.locator('.agent-run-log__row')).toContainText('成功')
  await expect(page.locator('.agent-run-log__row')).toContainText('380')

  await page.getByRole('button', { name: '查看记录' }).first().click()
  const detail = page.locator('.agent-run-log__detail')
  await expect(detail).toContainText('Learning goal: 学习 TypeScript')
  await expect(detail).toContainText('System Prompt')
  await expect(detail).toContainText('Raw Response')
  await expect(detail).toContainText('Prompt Tokens')
})

test('dragging a learning-plan chapter updates descendant statuses', async ({ page }) => {
  const block = await generateMockLearningPlan(page)

  await block.getByRole('button', { name: '看板', exact: true }).click()
  const source = block.locator('.kanban-column__body[data-kanban-group-id="todo"] .kanban-card').first()
  const target = block.locator('.kanban-column__body[data-kanban-group-id="done"]')
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await source.dispatchEvent('dragstart', { dataTransfer })
  await target.dispatchEvent('dragover', { dataTransfer })
  await target.dispatchEvent('drop', { dataTransfer })
  await expect(block.locator('[data-kanban-group-id="done"] .kanban-card')).toContainText('建立基础框架')

  await block.getByRole('button', { name: '表格' }).click()
  const firstThreeStatuses = await block.locator('tbody tr.multi-table__tree-row select').evaluateAll((selects) => {
    return selects.slice(0, 3).map((select) => (select as HTMLSelectElement).value)
  })
  expect(firstThreeStatuses).toEqual(['done', 'done', 'done'])
})
