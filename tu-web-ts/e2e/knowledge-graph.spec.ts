import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.sessionStorage.getItem('tu:knowledge-graph-e2e-init')) {
      window.localStorage.removeItem('tu:mock-state')
      window.localStorage.removeItem('tu-mock-knowledge-relations')
      window.localStorage.removeItem('tu-mock-knowledge-points')
      window.localStorage.removeItem('tu-mock-knowledge-point-anchors')
      window.localStorage.removeItem('tu-mock-knowledge-point-aliases')
      window.sessionStorage.setItem('tu:knowledge-graph-e2e-init', '1')
    }

    const relationsKey = 'tu-mock-knowledge-relations'
    const raw = window.localStorage.getItem(relationsKey)
    const relations = raw ? JSON.parse(raw) as Array<{ relationTypeKey: string }> : []
    const hasPrerequisite = relations.some((item) => item.relationTypeKey === 'prerequisite')
    if (!hasPrerequisite) {
      relations.push({
        id: 'kr-graph-demo-prereq',
        kbId: 'kb-demo-1',
        relationTypeKey: 'prerequisite',
        relationTypeLabel: '前置',
        relationTypeColor: '#fa8c16',
        bidirectional: false,
        fromPointId: 'kp-demo-1',
        toPointId: 'kp-demo-2',
        fromPointTitle: '基础概念',
        toPointTitle: '数据结构',
        from: null,
        to: null,
        note: null,
        sourceProvenance: 'user',
        status: 'ok',
      })
      window.localStorage.setItem(relationsKey, JSON.stringify(relations))
    }
  })
})

test('opens knowledge graph tab with empty centered state by default', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=knowledgeGraph')
  await expect(page.getByRole('tab', { name: '知识点关联图' })).toBeVisible()
  await expect(page.locator('.kg-panel__toolbar')).toBeVisible()
  await expect(page.getByText('请选择中心知识点，查看其关联子图。')).toBeVisible()
  await expect(page.getByRole('button', { name: '选择知识点' })).toBeVisible()
  await expect(page.locator('.knowledge-graph-viewer .x6-node')).toHaveCount(0)
})

test('navigates from knowledge point manager to centered graph', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=knowledgePoints')
  await expect(page.getByRole('tab', { name: '知识点' })).toBeVisible()
  await page.getByText('基础概念', { exact: true }).first().click()
  await page.getByRole('button', { name: '在关联图中查看' }).click()

  await expect(page).toHaveURL(/tab=knowledgeGraph/)
  await expect(page).toHaveURL(/centerPointId=kp-demo-1/)
  await expect(page.getByRole('tab', { name: '知识点关联图' })).toBeVisible()
  await expect(page.locator('.knowledge-graph-viewer .x6-node')).toHaveCount(2, { timeout: 15000 })

  const nestedInsideParent = await page.evaluate(() => {
    function findNodeRect(label: string): DOMRect | null {
      const viewer = document.querySelector('.knowledge-graph-viewer')
      if (!viewer) return null
      const texts = Array.from(viewer.querySelectorAll('text'))
      const match = texts.find((item) => item.textContent?.trim() === label)
      if (!match) return null
      const nodeEl = match.closest('.x6-node') as HTMLElement | null
      return nodeEl?.getBoundingClientRect() ?? null
    }

    const parent = findNodeRect('基础概念')
    const child = findNodeRect('数据结构')
    if (!parent || !child) return false
    return (
      child.left >= parent.left
      && child.top >= parent.top
      && child.right <= parent.right + 1
      && child.bottom <= parent.bottom + 1
    )
  })
  expect(nestedInsideParent).toBe(true)
})

test('opens prerequisite subgraph from knowledge point detail', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=knowledgePoints')
  const parentNode = page.locator('.kpt-tree .el-tree-node').filter({ hasText: '基础概念' }).first()
  await parentNode.locator('.el-tree-node__expand-icon').click()
  await page.locator('.kpt-tree .el-tree-node__content', { hasText: '数据结构' }).first().click()
  await page.getByRole('button', { name: '前置子图' }).click()

  await expect(page).toHaveURL(/graphMode=prerequisite/)
  await expect(page).toHaveURL(/centerPointId=kp-demo-2/)
  await expect(page.locator('.kg-panel__toolbar')).toBeVisible()
  await expect(page.locator('.knowledge-graph-viewer .x6-node')).toHaveCount(2, { timeout: 15000 })
})

test('includes taxonomy child inside parent without semantic relation', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=knowledgeGraph')
  await page.evaluate(() => {
    const points = [
      {
        id: 'kp-tax-parent',
        kbId: 'kb-demo-1',
        parentId: null,
        title: '父知识点',
        status: 'active',
        sortOrder: 10,
      },
      {
        id: 'kp-tax-child',
        kbId: 'kb-demo-1',
        parentId: 'kp-tax-parent',
        title: '子知识点',
        status: 'active',
        sortOrder: 0,
      },
    ]
    window.localStorage.setItem('tu-mock-knowledge-points', JSON.stringify(points))
    window.localStorage.setItem('tu-mock-knowledge-relations', '[]')
  })

  await page.goto('/resources?tab=knowledgeGraph&centerPointId=kp-tax-parent')
  await expect(page.locator('.knowledge-graph-viewer .x6-node')).toHaveCount(2, { timeout: 15000 })

  const nestedInsideParent = await page.evaluate(() => {
    function findNodeRect(label: string): DOMRect | null {
      const viewer = document.querySelector('.knowledge-graph-viewer')
      if (!viewer) return null
      const texts = Array.from(viewer.querySelectorAll('text'))
      const match = texts.find((item) => item.textContent?.trim() === label)
      if (!match) return null
      const nodeEl = match.closest('.x6-node') as HTMLElement | null
      return nodeEl?.getBoundingClientRect() ?? null
    }

    const parent = findNodeRect('父知识点')
    const child = findNodeRect('子知识点')
    if (!parent || !child) return false
    return (
      child.left >= parent.left
      && child.top >= parent.top
      && child.right <= parent.right + 1
      && child.bottom <= parent.bottom + 1
    )
  })
  expect(nestedInsideParent).toBe(true)
})

test('collapses embedded taxonomy children for selected container', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=knowledgeGraph')
  await page.evaluate(() => {
    const points = [
      {
        id: 'kp-tax-parent',
        kbId: 'kb-demo-1',
        parentId: null,
        title: '父知识点',
        status: 'active',
        sortOrder: 10,
      },
      {
        id: 'kp-tax-child',
        kbId: 'kb-demo-1',
        parentId: 'kp-tax-parent',
        title: '子知识点',
        status: 'active',
        sortOrder: 0,
      },
    ]
    window.localStorage.setItem('tu-mock-knowledge-points', JSON.stringify(points))
    window.localStorage.setItem('tu-mock-knowledge-relations', '[]')
  })

  await page.goto('/resources?tab=knowledgeGraph&centerPointId=kp-tax-parent')
  await expect(page.locator('.knowledge-graph-viewer .x6-node')).toHaveCount(2, { timeout: 15000 })

  await page.getByRole('button', { name: '收起选中子节点' }).click()
  await expect(page.locator('.knowledge-graph-viewer .x6-node')).toHaveCount(1, { timeout: 15000 })

  const collapsedLabel = await page.evaluate(() => {
    const viewer = document.querySelector('.knowledge-graph-viewer')
    if (!viewer) return ''
    const texts = Array.from(viewer.querySelectorAll('text'))
    return texts.map((item) => item.textContent?.trim() ?? '').join('|')
  })
  expect(collapsedLabel).toContain('父知识点')
  expect(collapsedLabel).toContain('▸')
  expect(collapsedLabel).not.toContain('子知识点')

  await page.getByRole('button', { name: '全部展开' }).click()
  await expect(page.locator('.knowledge-graph-viewer .x6-node')).toHaveCount(2, { timeout: 15000 })
})
