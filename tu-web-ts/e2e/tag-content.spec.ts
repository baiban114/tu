import { expect, test } from '@playwright/test'

const TAGGED_PAGE_CONTENT = {
  content: [
    '# 标签检索示例页',
    '',
    '<!--tu:heading-id id="hs-design"-->',
    '## 设计节',
    '',
    '设计节正文',
    '',
    '<!--tu:heading-id id="hs-impl"-->',
    '## 实现节',
    '',
    '实现节正文',
    '',
    '<!--tu:embed id="b-x6-1" type="x6"-->',
    '',
    '普通段落',
  ].join('\n'),
  embeds: [
    {
      id: 'b-x6-1',
      type: 'x6',
      title: '示例画板',
      graphData: {
        nodes: [
          { id: 'demo-node-1', x: 120, y: 100, width: 120, height: 56, label: '开始' },
        ],
        edges: [],
      },
    },
  ],
  annotations: [],
  metadata: {
    sectionTags: {
      'local:hs-design': [{ id: 'tag-design', label: '设计', color: '#1677ff' }],
      'local:hs-impl': [{ id: 'tag-impl', label: '实现', color: '#67c23a' }],
    },
    textTagSpans: [
      {
        id: 'text-span-design-body',
        tags: [{ id: 'tag-text-highlight', label: '摘录', color: '#e6a23c' }],
        selectedText: '设计节正文',
        contextBefore: '',
        contextAfter: '',
        unresolved: false,
      },
    ],
  },
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
  })
})

async function seedTaggedPage(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Reset Mock' }).click()
  await page.waitForFunction(() => Boolean(window.localStorage.getItem('tu:mock-state')))
  await page.evaluate((pageContent) => {
    const raw = window.localStorage.getItem('tu:mock-state')
    if (!raw) throw new Error('mock state missing')
    const state = JSON.parse(raw)
    state.contents['p-demo-1'] = pageContent
    window.localStorage.setItem('tu:mock-state', JSON.stringify(state))
  }, TAGGED_PAGE_CONTENT)
  await page.reload()
}

async function openTagContentView(page: import('@playwright/test').Page) {
  await page.locator('.source-switch__btn', { hasText: '视图' }).click()
  await page.locator('.kb-item', { hasText: '标签检索' }).click()
  await expect(page.locator('.tag-content-view')).toBeVisible()
}

test('switches to tag view and prompts for KB / tag selection', async ({ page }) => {
  test.setTimeout(90_000)
  await seedTaggedPage(page)
  await openTagContentView(page)
  await expect(page.locator('.tag-content-view__empty')).toContainText('选择标签后检索')
})

test('selects a section tag and lists tagged unit results', async ({ page }) => {
  test.setTimeout(90_000)
  await seedTaggedPage(page)
  await openTagContentView(page)

  await page.locator('.tag-content-view__select').click()
  await page.getByRole('option', { name: '设计' }).click()

  await expect(page.locator('.tag-content-view__meta')).toContainText('命中 1 项')
  await expect(page.locator('.tag-content-view__table .scope-chip--section')).toHaveCount(1)
  await expect(page.locator('.tag-content-view__table .title-cell__title', { hasText: '设计节' })).toBeVisible()
})

test('expands a section row to preview original content', async ({ page }) => {
  test.setTimeout(90_000)
  await seedTaggedPage(page)
  await openTagContentView(page)

  await page.locator('.tag-content-view__select').click()
  await page.getByRole('option', { name: '设计' }).click()
  await expect(page.locator('.tag-content-view__table .title-cell__title', { hasText: '设计节' })).toBeVisible()

  await page.locator('.tag-content-view__table').getByRole('button', { name: '展开当前行' }).first().click()
  await expect(page.locator('.tagged-content-expander')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.tagged-content-expander').getByText('设计节正文')).toBeVisible()
})

test('selects a text-range tag and lists the marked document content', async ({ page }) => {
  test.setTimeout(90_000)
  await seedTaggedPage(page)
  await openTagContentView(page)

  await page.locator('.tag-content-view__select').click()
  await page.getByRole('option', { name: '摘录' }).click()

  await expect(page.locator('.tag-content-view__meta')).toContainText('命中 1 项')
  await expect(page.locator('.tag-content-view__table .scope-chip--text')).toHaveText('文字')
  await expect(page.locator('.tag-content-view__table .title-cell__title')).toContainText('设计节正文')

  await page.locator('.tag-content-view__table').getByRole('button', { name: '展开当前行' }).click()
  await expect(page.locator('.tagged-content-expander__text')).toHaveText('设计节正文')
})

test('open page navigates to the document', async ({ page }) => {
  test.setTimeout(90_000)
  await seedTaggedPage(page)
  await openTagContentView(page)

  await page.locator('.tag-content-view__select').click()
  await page.getByRole('option', { name: '设计' }).click()
  await expect(page.locator('.tag-content-view__table .title-cell__title', { hasText: '设计节' })).toBeVisible()

  await page.locator('.tag-content-view__table').getByRole('button', { name: '打开页面' }).first().click()
  await expect(page.locator('.tu-editor-page .ProseMirror')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.tu-editor-page .ProseMirror').getByText('设计节正文')).toBeVisible()
})

test('remembers last-viewed tag and restores it on reopen (direct load)', async ({ page }) => {
  test.setTimeout(90_000)
  await seedTaggedPage(page)
  await openTagContentView(page)

  // Select a tag so it gets persisted as the "last viewed" tag.
  await page.locator('.tag-content-view__select').click()
  await page.getByRole('option', { name: '实现' }).click()
  await expect(page.locator('.tag-content-view__table .title-cell__title', { hasText: '实现节' })).toBeVisible()

  // Leave the tag view, then reopen the page source feed / view.
  await page.locator('.source-switch__btn', { hasText: '知识库' }).click()
  await expect(page.locator('.tag-content-view')).toBeHidden()

  await page.locator('.source-switch__btn', { hasText: '视图' }).click()
  await page.locator('.kb-item', { hasText: '标签检索' }).click()

  // Last-viewed tag is auto-restored and results load directly without manual selection.
  await expect(page.locator('.tag-content-view .el-select__placeholder')).toHaveText('实现')
  await expect(page.locator('.tag-content-view__table .title-cell__title', { hasText: '实现节' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.tag-content-view__meta')).toContainText('命中 1 项')
})
