import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.sessionStorage.getItem('tu:content-tree-outline-e2e-init')) {
      window.sessionStorage.setItem('tu:content-tree-outline-e2e-init', '1')
      window.localStorage.setItem('tu:mock-state', JSON.stringify({
        knowledgeBases: [
          { id: 'kb-outline', name: 'Outline E2E', icon: 'O', description: 'content tree outline' },
        ],
        pages: [
          { id: 'p-outline-doc', kbId: 'kb-outline', parentId: null, title: '目录文档', order: 0, pageType: 'document' },
          { id: 'p-mindmap-outline', kbId: 'kb-outline', parentId: null, title: 'Outline 思维导图', order: 1, pageType: 'mindmap' },
        ],
        contents: {
          'p-outline-doc': {
            content: '# 目录文档\n\n## Alpha 章节\n\nAlpha 正文。\n\n## Beta 章节\n\nBeta 正文。',
            embeds: [],
            annotations: [],
          },
          'p-mindmap-outline': {
            content: '',
            embeds: [{
              id: 'embed-mindmap-outline',
              type: 'x6',
              title: 'Outline 思维导图',
              graphData: {
                blueprintMeta: { kind: 'mindmap' },
                nodes: [
                  {
                    id: 'mind-root',
                    x: 400,
                    y: 280,
                    width: 140,
                    height: 48,
                    label: '中心',
                    data: { mindRole: 'root', childrenCollapsed: false },
                  },
                  {
                    id: 'mind-ref-doc',
                    x: 620,
                    y: 280,
                    width: 160,
                    height: 48,
                    label: '目录文档',
                    data: {
                      mindRole: 'topic',
                      refKind: 'block-ref',
                      refBlockId: 'p-outline-doc',
                      refType: 'page',
                      childrenCollapsed: true,
                      refTocCollapsed: {},
                    },
                  },
                ],
                edges: [
                  { id: 'edge-root-ref', source: 'mind-root', target: 'mind-ref-doc' },
                ],
              },
            }],
            annotations: [],
          },
        },
        resourceTypes: [],
        resourceWorks: [],
        resourceItems: [],
        resourceChapters: [],
        resourceExcerpts: [],
        urlClusterRules: [],
        resourceItemRelations: [],
        contentTreeHours: {},
      }))
    }
  })
})

test.describe.serial('mindmap outline projection', () => {
  test('expands ref toc and keeps deletions across collapse', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.locator('.page-tree')).toBeVisible()
    await page.locator('.page-tree .tree-node').filter({ hasText: 'Outline 思维导图' }).click()
    await expect(page.locator('.x6-stage')).toBeVisible()

    const refNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: '目录文档' }).first()
    await expect(refNode).toBeVisible()
    const refCellId = await refNode.getAttribute('data-cell-id')
    expect(refCellId).toBeTruthy()
    const refById = page.locator(`.x6-node[data-cell-id="${refCellId}"]`)

    await refById.hover()

    const collapseButton = page.locator('.mindmap-collapse-btn').first()
    await expect(collapseButton).toBeVisible()
    await collapseButton.click()

    await expect.poll(async () => (
      page.locator('.x6-node[data-cell-id]').filter({ hasText: 'Alpha 章节' }).count()
    )).toBeGreaterThanOrEqual(1)
    await expect.poll(async () => (
      page.locator('.x6-node[data-cell-id]').filter({ hasText: 'Beta 章节' }).count()
    )).toBeGreaterThanOrEqual(1)

    const betaNode = page.locator('.x6-node[data-cell-id]').filter({ hasText: 'Beta 章节' }).first()
    await betaNode.hover()
    await betaNode.click()
    await expect(page.locator('.toolbar-summary').first()).toContainText('Beta 章节')
    await page.getByRole('button', { name: '删除' }).click()
    await expect(page.locator('.x6-node[data-cell-id]').filter({ hasText: 'Beta 章节' })).toHaveCount(0)
    await expect(refById).toHaveCount(1)
    await expect(page.locator('.x6-node[data-cell-id]').filter({ hasText: 'Alpha 章节' }).count()).resolves.toBeGreaterThanOrEqual(1)

    await refById.hover()
    await collapseButton.click()
    await refById.hover()
    await collapseButton.click()

    await expect(page.locator('.x6-node[data-cell-id]').filter({ hasText: 'Beta 章节' })).toHaveCount(0)
    await expect.poll(async () => (
      page.locator('.x6-node[data-cell-id]').filter({ hasText: 'Alpha 章节' }).count()
    )).toBeGreaterThanOrEqual(1)
  })
})

test('persists content tree hours in mock state', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    state.contentTreeHours = { 'ctn-demo-hours': 3.5 }
    window.localStorage.setItem('tu:mock-state', JSON.stringify(state))
  })
  const hours = await page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    return state.contentTreeHours?.['ctn-demo-hours']
  })
  expect(hours).toBe(3.5)
})
