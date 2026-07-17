import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.sessionStorage.getItem('tu:knowledge-relation-e2e-init')) {
      window.localStorage.removeItem('tu:mock-state')
      window.localStorage.removeItem('tu-mock-knowledge-relations')
      window.localStorage.removeItem('tu-mock-knowledge-points')
      window.localStorage.removeItem('tu-mock-knowledge-point-anchors')
      window.localStorage.removeItem('tu-mock-knowledge-point-aliases')
      window.sessionStorage.setItem('tu:knowledge-relation-e2e-init', '1')
    }
  })
})

async function selectEditorText(page: import('@playwright/test').Page) {
  const paragraph = page.locator('.ProseMirror p').first()
  await expect(paragraph).toBeVisible()
  await paragraph.click()
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('End')
  await page.keyboard.up('Shift')
}

test('creates case relation from selection and shows reverse lookup in resource manager', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await selectEditorText(page)

  const createRelationButton = page.getByRole('button', { name: '建立关联' })
  await expect(createRelationButton).toBeVisible({ timeout: 8000 })
  await createRelationButton.click()

  const dialog = page.getByRole('dialog', { name: '关联到知识点' })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('知识点树').getByText('基础概念').click()
  await dialog.getByRole('button', { name: '关联' }).click()
  await expect(dialog).toBeHidden()

  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tu-mock-knowledge-relations')
    if (!raw) return null
    const relations = JSON.parse(raw) as Array<{
      relationTypeKey: string
      toPointTitle?: string
      from?: { locator?: string }
    }>
    return relations.find((item) => item.relationTypeKey === 'case') ?? null
  })
  expect(stored).toBeTruthy()
  expect(stored?.toPointTitle).toBe('基础概念')
  expect(stored?.from?.locator).toContain(':selection:')

  await page.goto('/resources?tab=knowledgeRelations')
  await expect(page.getByRole('tab', { name: '知识关联' })).toBeVisible()
  await expect(page.getByText('案例')).toBeVisible()
  await expect(page.getByRole('button', { name: '基础概念' })).toBeVisible()
})

async function openKnowledgeRelationDialog(page: import('@playwright/test').Page) {
  await selectEditorText(page)
  const createRelationButton = page.getByRole('button', { name: '建立关联' })
  await expect(createRelationButton).toBeVisible({ timeout: 8000 })
  await createRelationButton.click()
  const dialog = page.getByRole('dialog', { name: '关联到知识点' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('creates knowledge points from picker tree toolbar and context menu', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  const dialog = await openKnowledgeRelationDialog(page)

  await dialog.getByTitle('新建顶层知识点').click()
  await expect(dialog.getByText('未命名知识点').first()).toBeVisible()
  await expect(dialog.locator('.kpp-panel__value')).toContainText('未命名知识点')

  const rootNode = dialog.locator('.el-tree-node__content', { hasText: '未命名知识点' }).first()
  await rootNode.click({ button: 'right' })
  await page.getByRole('button', { name: '添加子知识点' }).click()
  await expect(dialog.locator('.el-tree-node__children .el-tree-node__content', { hasText: '未命名知识点' })).toBeVisible()
  await dialog.locator('.el-tree-node__children .el-tree-node__content', { hasText: '未命名知识点' }).click()

  await dialog.getByRole('button', { name: '关联' }).click()
  await expect(dialog).toBeHidden()

  const { childPointId, relationToPointId } = await page.evaluate(() => {
    const pointsRaw = window.localStorage.getItem('tu-mock-knowledge-points')
    const relationsRaw = window.localStorage.getItem('tu-mock-knowledge-relations')
    if (!pointsRaw || !relationsRaw) return { childPointId: null, relationToPointId: null }
    const points = JSON.parse(pointsRaw) as Array<{ id: string; parentId?: string | null; title: string }>
    const unnamedRoots = points.filter((item) => item.title === '未命名知识点' && !item.parentId)
    const root = unnamedRoots[unnamedRoots.length - 1]
    const child = root ? points.find((item) => item.parentId === root.id) : undefined
    const relations = JSON.parse(relationsRaw) as Array<{ toPointId?: string; relationTypeKey: string }>
    const latestCase = [...relations].reverse().find((item) => item.relationTypeKey === 'case')
    return { childPointId: child?.id ?? null, relationToPointId: latestCase?.toPointId ?? null }
  })
  expect(childPointId).toBeTruthy()
  expect(relationToPointId).toBe(childPointId)
})

test('renames knowledge point from picker tree via context menu and F2', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  const dialog = await openKnowledgeRelationDialog(page)

  await dialog.getByLabel('知识点树').getByText('基础概念').click()
  await dialog.locator('.el-tree-node__content', { hasText: '基础概念' }).first().click({ button: 'right' })
  await page.getByRole('button', { name: '重命名' }).click()
  const renameInput = dialog.locator('.kpt-tree-rename-input input')
  await expect(renameInput).toBeVisible()
  await renameInput.fill('核心概念')
  await renameInput.press('Enter')
  await expect(dialog.getByLabel('知识点树').getByText('核心概念')).toBeVisible()
  await expect(dialog.locator('.kpp-panel__value')).toContainText('核心概念')

  await page.keyboard.press('F2')
  const secondRenameInput = dialog.locator('.kpt-tree-rename-input input')
  await expect(secondRenameInput).toBeVisible()
  await secondRenameInput.fill('基础知识')
  await secondRenameInput.press('Enter')
  await expect(dialog.getByLabel('知识点树').getByText('基础知识')).toBeVisible()

  const titles = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tu-mock-knowledge-points')
    if (!raw) return []
    const points = JSON.parse(raw) as Array<{ title: string }>
    return points.map((item) => item.title)
  })
  expect(titles).toContain('基础知识')
  expect(titles).toContain('数据结构')
})

test('generates knowledge points from page tree and searches by alias', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=knowledgePoints')
  await expect(page.getByRole('tab', { name: '知识点' })).toBeVisible()

  await page.getByRole('button', { name: '从定位系统生成…' }).click()
  const generateDialog = page.getByRole('dialog', { name: '从定位系统生成知识点' })
  await expect(generateDialog).toBeVisible()
  await generateDialog.getByRole('button', { name: '预览' }).click()
  await expect(generateDialog.getByText(/共 \d+ 条候选/)).toBeVisible()
  await generateDialog.getByRole('button', { name: /确认生成 \d+ 条/ }).click()
  await expect(generateDialog).toBeHidden()

  const pageAnchors = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tu-mock-knowledge-point-anchors')
    if (!raw) return []
    const anchors = JSON.parse(raw) as Array<{ locator: string }>
    return anchors.filter((item) => item.locator.startsWith('page:')).map((item) => item.locator)
  })
  expect(pageAnchors.length).toBeGreaterThan(0)

  await page.getByText('基础概念', { exact: true }).first().click()
  const aliasInput = page.getByPlaceholder('添加别名')
  await aliasInput.fill('核心术语')
  await page.getByRole('button', { name: '添加', exact: true }).click()

  const filterInput = page.getByPlaceholder('筛选分类树')
  await filterInput.fill('核心术语')
  await expect(page.getByText('基础概念', { exact: true }).first()).toBeVisible()
})

test('manager tree rejects deleting knowledge point with children', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=knowledgePoints')
  await expect(page.getByRole('tab', { name: '知识点' })).toBeVisible()

  const parentNode = page.locator('.kpt-tree .el-tree-node').filter({ hasText: '基础概念' }).first()
  await parentNode.locator('.el-tree-node__expand-icon').click()
  await expect(page.locator('.kpt-tree .el-tree-node__content', { hasText: '数据结构' })).toBeVisible()

  await page.locator('.kpt-tree .el-tree-node__content', { hasText: '基础概念' }).first().click({ button: 'right' })
  await page.getByRole('button', { name: '删除' }).click()
  await expect(page.getByText('knowledge point has children')).toBeVisible()

  const stillThere = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tu-mock-knowledge-points')
    if (!raw) return false
    const points = JSON.parse(raw) as Array<{ id: string; title: string }>
    return points.some((item) => item.id === 'kp-demo-1' && item.title === '基础概念')
  })
  expect(stillThere).toBe(true)
})

test('promotes child knowledge point to sibling via context menu', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=knowledgePoints')
  await expect(page.getByRole('tab', { name: '知识点' })).toBeVisible()

  const parentNode = page.locator('.kpt-tree .el-tree-node').filter({ hasText: '基础概念' }).first()
  await parentNode.locator('.el-tree-node__expand-icon').click()
  await page.locator('.kpt-tree .el-tree-node__content', { hasText: '数据结构' }).first().click({ button: 'right' })
  await page.getByRole('button', { name: '提升为同级节点' }).click()

  const parentId = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tu-mock-knowledge-points')
    if (!raw) return undefined
    const points = JSON.parse(raw) as Array<{ id: string; title: string; parentId?: string | null }>
    return points.find((item) => item.title === '数据结构')?.parentId ?? null
  })
  expect(parentId).toBeNull()
})

test('merges child knowledge point into parent via context menu', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=knowledgePoints')
  await expect(page.getByRole('tab', { name: '知识点' })).toBeVisible()

  const parentNode = page.locator('.kpt-tree .el-tree-node').filter({ hasText: '基础概念' }).first()
  await parentNode.locator('.el-tree-node__expand-icon').click()
  await page.locator('.kpt-tree .el-tree-node__content', { hasText: '数据结构' }).first().click({ button: 'right' })
  await page.getByRole('button', { name: '合并到…' }).click()

  const pickerDialog = page.getByRole('dialog', { name: '合并到知识点' })
  await expect(pickerDialog).toBeVisible()
  await pickerDialog.getByLabel('知识点树').getByText('基础概念', { exact: true }).click()
  await pickerDialog.getByRole('button', { name: '确认合并' }).click()

  await page.getByRole('dialog', { name: '确认合并知识点' }).getByRole('button', { name: '确认合并' }).click()

  const result = await page.evaluate(() => {
    const pointsRaw = window.localStorage.getItem('tu-mock-knowledge-points')
    const aliasesRaw = window.localStorage.getItem('tu-mock-knowledge-point-aliases')
    if (!pointsRaw || !aliasesRaw) return null
    const points = JSON.parse(pointsRaw) as Array<{ id: string; title: string; estimatedHours?: number | null }>
    const aliases = JSON.parse(aliasesRaw) as Array<{ knowledgePointId: string; alias: string }>
    const target = points.find((item) => item.id === 'kp-demo-1')
    const sourceGone = !points.some((item) => item.id === 'kp-demo-2')
    const aliasMerged = aliases.some(
      (item) => item.knowledgePointId === 'kp-demo-1' && item.alias === '数据结构',
    )
    return {
      sourceGone,
      aliasMerged,
      estimatedHours: target?.estimatedHours ?? null,
    }
  })

  expect(result?.sourceGone).toBe(true)
  expect(result?.aliasMerged).toBe(true)
  expect(result?.estimatedHours).toBe(2)
  await expect(page.locator('.kpt-tree .el-tree-node__content', { hasText: '数据结构' })).toHaveCount(0)
})

test('shows page knowledge context bar with page points and prerequisites', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?pageId=p-demo-2')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await page.evaluate(() => {
    const pointsRaw = window.localStorage.getItem('tu-mock-knowledge-points')
    const points = pointsRaw ? JSON.parse(pointsRaw) as Array<{ id: string; kbId?: string; title?: string; parentId?: string | null; status?: string; sortOrder?: number }> : []
    if (!points.some((item) => item.id === 'kp-demo-1')) {
      points.push({
        id: 'kp-demo-1',
        kbId: 'kb-demo-1',
        parentId: null,
        title: '基础概念',
        status: 'active',
        sortOrder: 0,
      })
    }
    if (!points.some((item) => item.id === 'kp-pre')) {
      points.push({
        id: 'kp-pre',
        kbId: 'kb-demo-1',
        parentId: null,
        title: '前置概念',
        status: 'active',
        sortOrder: 2,
      })
    }
    window.localStorage.setItem('tu-mock-knowledge-points', JSON.stringify(points))

    const anchorsRaw = window.localStorage.getItem('tu-mock-knowledge-point-anchors')
    const anchors = anchorsRaw ? JSON.parse(anchorsRaw) as Array<Record<string, unknown>> : []
    if (!anchors.some((item) => item.id === 'kpa-e2e-page-context')) {
      anchors.push({
        id: 'kpa-e2e-page-context',
        knowledgePointId: 'kp-demo-1',
        kind: 'page',
        locator: 'page:p-demo-2',
        role: 'primary',
        primary: true,
        snapshot: { title: '基础概念' },
      })
    }
    window.localStorage.setItem('tu-mock-knowledge-point-anchors', JSON.stringify(anchors))

    const relationsRaw = window.localStorage.getItem('tu-mock-knowledge-relations')
    const relations = relationsRaw ? JSON.parse(relationsRaw) as Array<Record<string, unknown>> : []
    if (!relations.some((item) => item.id === 'kr-e2e-page-context')) {
      relations.push({
        id: 'kr-e2e-page-context',
        kbId: 'kb-demo-1',
        relationTypeKey: 'prerequisite',
        fromPointId: 'kp-demo-1',
        toPointId: 'kp-pre',
        sourceProvenance: 'user',
        status: 'ok',
      })
    }
    window.localStorage.setItem('tu-mock-knowledge-relations', JSON.stringify(relations))
  })

  await page.reload()
  await expect(page.locator('.ProseMirror')).toBeVisible()

  const contextBar = page.getByRole('region', { name: '页面知识点关联' })
  await expect(contextBar).toBeVisible()
  await expect(contextBar.getByRole('button', { name: '基础概念' })).toBeVisible()
  await expect(contextBar.getByRole('button', { name: '前置概念' })).toBeVisible()
  await expect(contextBar.getByText('前驱')).toBeVisible()
})
