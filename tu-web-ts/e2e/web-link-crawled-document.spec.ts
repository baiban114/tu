import { expect, type Page, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.sessionStorage.getItem('tu:web-link-crawled-doc-e2e-init')) {
      window.localStorage.removeItem('tu:mock-state')
      window.sessionStorage.setItem('tu:web-link-crawled-doc-e2e-init', '1')
    }

    const stateKey = 'tu:mock-state'
    const raw = window.localStorage.getItem(stateKey)
    const state = raw ? JSON.parse(raw) : {}
    // loadState 校验 knowledgeBases/pages/contents，缺失时整体回退默认数据，seed 时必须补齐
    if (!Array.isArray(state.knowledgeBases)) state.knowledgeBases = []
    if (!Array.isArray(state.pages)) state.pages = []
    if (!state.contents || typeof state.contents !== 'object') state.contents = {}
    const resourceTypes = Array.isArray(state.resourceTypes) ? state.resourceTypes : []
    const resourceItems = Array.isArray(state.resourceItems) ? state.resourceItems : []

    if (!resourceTypes.some((type: { id: string }) => type.id === 'rt-web-link')) {
      resourceTypes.push({
        id: 'rt-web-link',
        code: 'web-link',
        name: '网页链接',
        icon: 'link',
        description: '网页链接资源，支持爬取网页内容',
        identityFieldKey: 'sourceUrl',
        identityFieldLabel: '源 URL',
      })
    }
    if (!resourceTypes.some((type: { id: string }) => type.id === 'rt-document')) {
      resourceTypes.push({
        id: 'rt-document',
        code: 'document',
        name: '文档',
        icon: 'document',
        description: '文档资源，支持节选片段管理',
        identityFieldKey: 'sourceUrl',
        identityFieldLabel: '源 URL / 文件标识',
      })
    }
    if (!resourceItems.some((item: { id: string }) => item.id === 'ri-doc-demo')) {
      resourceItems.push({
        id: 'ri-doc-demo',
        typeId: 'rt-document',
        typeName: '文档',
        identityFieldKey: 'sourceUrl',
        identityFieldLabel: '源 URL / 文件标识',
        workId: null,
        workTitle: null,
        title: '示例文档资源',
        identityValue: 'local/demo.pdf',
        sourceUrl: null,
        note: 'Mock 文档资源',
        titleSource: 'manual',
        workIdSource: 'auto',
        variantKind: null,
      })
    }
    if (!resourceItems.some((item: { id: string }) => item.id === 'ri-doc-url-demo')) {
      resourceItems.push({
        id: 'ri-doc-url-demo',
        typeId: 'rt-document',
        typeName: '文档',
        identityFieldKey: 'url',
        identityFieldLabel: '网址',
        workId: null,
        workTitle: null,
        title: '示例网址文档',
        identityValue: 'https://example.com/docs/url-demo',
        sourceUrl: null,
        note: 'Mock 标识为网址的文档资源',
        titleSource: 'manual',
        workIdSource: 'auto',
        variantKind: null,
      })
    }
    if (!resourceItems.some((item: { id: string }) => item.id === 'ri-web-link-demo')) {
      resourceItems.push({
        id: 'ri-web-link-demo',
        typeId: 'rt-web-link',
        typeName: '网页链接',
        identityFieldKey: 'sourceUrl',
        identityFieldLabel: '源 URL',
        workId: null,
        workTitle: null,
        title: '示例网页链接',
        identityValue: 'https://example.com/article/demo',
        sourceUrl: 'https://example.com/article/demo',
        note: 'Mock 网页链接资源',
        titleSource: 'manual',
        workIdSource: 'auto',
        variantKind: null,
      })
    }

    state.resourceTypes = resourceTypes
    state.resourceItems = resourceItems
    window.localStorage.setItem(stateKey, JSON.stringify(state))
  })
})

/** web-link 实体默认在实体表中隐藏，需先选择网络链接类型筛选才可见。 */
async function selectWebLinkTypeFilter(page: Page) {
  await page.locator('.resource-filters').getByText('全部类型').click()
  await page.getByRole('option', { name: /网页链接/ }).click()
}

test('web-link item panel crawls, views and deletes crawled document', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=items')
  await selectWebLinkTypeFilter(page)

  const webLinkRow = page.locator('.el-table__row').filter({ hasText: '示例网页链接' }).first()
  await webLinkRow.getByRole('button', { name: '编辑' }).click()

  const panel = page.locator('.item-panel-dialog')
  await expect(panel).toBeVisible()
  const section = panel.locator('.crawled-doc-section')
  await expect(section).toBeVisible()
  await expect(panel.getByText('尚未爬取')).toBeVisible()
  await expect(section.getByRole('button', { name: '爬取网页' })).toBeVisible()
  await expect(section.getByRole('button', { name: '查看' })).toBeDisabled()
  await expect(section.getByRole('button', { name: '删除' })).toBeDisabled()

  await section.getByRole('button', { name: '爬取网页' }).click()
  await expect(panel.getByText(/上次爬取：/)).toBeVisible({ timeout: 15000 })
  await expect(section.getByRole('button', { name: '重新爬取' })).toBeVisible()

  await section.getByRole('button', { name: '查看' }).click()
  const viewDialog = page.locator('.expanded-document-dialog')
  await expect(viewDialog).toBeVisible()
  await expect(viewDialog.locator('.expanded-document-dialog__banner-tag', { hasText: '网络内容' })).toBeVisible()
  await expect(viewDialog.locator('.expanded-document-dialog__banner-tag', { hasText: '只读' })).toBeVisible()
  const proseMirror = viewDialog.locator('.ProseMirror')
  await expect(proseMirror).toBeVisible()
  await expect(proseMirror).toContainText('mock 模式合成的网页内容示例')
  const editable = await proseMirror.getAttribute('contenteditable')
  expect(editable).not.toBe('true')
  await page.keyboard.press('Escape')
  await expect(viewDialog).toBeHidden()

  await section.getByRole('button', { name: '删除' }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '确定' }).click()
  await expect(panel.getByText('尚未爬取')).toBeVisible()
  await expect(section.getByRole('button', { name: '查看' })).toBeDisabled()
})

test('non web-link item panel hides crawled document section', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=items')

  const docRow = page.locator('.el-table__row').filter({ hasText: '示例文档资源' }).first()
  await docRow.getByRole('button', { name: '编辑' }).click()

  const panel = page.locator('.item-panel-dialog')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.crawled-doc-section')).toHaveCount(0)
  await expect(panel.locator('.el-divider', { hasText: '网页内容' })).toHaveCount(0)
})

test('web-link row offers crawl and view content buttons', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=items')
  await selectWebLinkTypeFilter(page)

  const webLinkRow = page.locator('.el-table__row').filter({ hasText: '示例网页链接' }).first()
  await expect(webLinkRow.getByRole('button', { name: '爬取内容' })).toBeVisible()
  await expect(webLinkRow.getByRole('button', { name: '查看内容' })).toBeVisible()

  // 未爬取时查看应出现警告提示
  await webLinkRow.getByRole('button', { name: '查看内容' }).click()
  await expect(page.locator('.el-message--warning').filter({ hasText: '尚未爬取内容' })).toBeVisible()

  await webLinkRow.getByRole('button', { name: '爬取内容' }).click()
  await expect(page.locator('.el-message--success').filter({ hasText: '内容已爬取' })).toBeVisible({ timeout: 15000 })

  await webLinkRow.getByRole('button', { name: '查看内容' }).click()
  const viewDialog = page.locator('.expanded-document-dialog')
  await expect(viewDialog).toBeVisible()
  await expect(viewDialog.locator('.expanded-document-dialog__banner-tag', { hasText: '网络内容' })).toBeVisible()
  await expect(viewDialog.locator('.ProseMirror')).toContainText('mock 模式合成的网页内容示例')
  await page.keyboard.press('Escape')
  await expect(viewDialog).toBeHidden()
})

test('non web-link row without url identity hides crawl and view content buttons', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=items')

  const docRow = page.locator('.el-table__row').filter({ hasText: '示例文档资源' }).first()
  await expect(docRow.getByRole('button', { name: '爬取内容' })).toHaveCount(0)
  await expect(docRow.getByRole('button', { name: '查看内容' })).toHaveCount(0)
})

test('document row with url identity offers crawl and view content buttons', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=items')

  const docRow = page.locator('.el-table__row').filter({ hasText: '示例网址文档' }).first()
  await expect(docRow.getByRole('button', { name: '爬取内容' })).toBeVisible()
  await expect(docRow.getByRole('button', { name: '查看内容' })).toBeVisible()

  await docRow.getByRole('button', { name: '爬取内容' }).click()
  await expect(page.locator('.el-message--success').filter({ hasText: '内容已爬取' })).toBeVisible({ timeout: 15000 })

  await docRow.getByRole('button', { name: '查看内容' }).click()
  const viewDialog = page.locator('.expanded-document-dialog')
  await expect(viewDialog).toBeVisible()
  await expect(viewDialog.locator('.expanded-document-dialog__banner-tag', { hasText: '网络内容' })).toBeVisible()
  await expect(viewDialog.locator('.ProseMirror')).toContainText('mock 模式合成的网页内容示例')
  await page.keyboard.press('Escape')
  await expect(viewDialog).toBeHidden()
})

test('removing web-link item cascades crawled document', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/resources?tab=items')
  await selectWebLinkTypeFilter(page)

  const webLinkRow = page.locator('.el-table__row').filter({ hasText: '示例网页链接' }).first()
  await webLinkRow.getByRole('button', { name: '编辑' }).click()
  const panel = page.locator('.item-panel-dialog')
  await expect(panel).toBeVisible()
  await panel.locator('.crawled-doc-section').getByRole('button', { name: '爬取网页' }).click()
  await expect(panel.getByText(/上次爬取：/)).toBeVisible({ timeout: 15000 })
  await panel.getByRole('button', { name: '取消' }).click()
  await expect(panel).toBeHidden()

  await webLinkRow.getByRole('button', { name: '移除' }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '确定' }).click()

  await expect(page.locator('.el-table__row').filter({ hasText: '示例网页链接' })).toHaveCount(0)
  const remaining = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tu:mock-state')
    const state = raw ? JSON.parse(raw) : { resourceCrawledDocuments: [] }
    return {
      crawledDocuments: state.resourceCrawledDocuments ?? [],
      items: (state.resourceItems ?? []).map((item: { id: string }) => item.id),
    }
  })
  expect(remaining.items).not.toContain('ri-web-link-demo')
  expect(remaining.crawledDocuments).toEqual([])
})
