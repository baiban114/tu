import { expect, test } from '@playwright/test'

const TAG_FILTER_PAGE_CONTENT = {
  content: [
    '# 快速入门',
    '',
    '页首说明',
    '',
    '<!--tu:heading-id id="hs-impl"-->',
    '## 实现节',
    '',
    '实现节正文应被隐藏',
    '',
    '<!--tu:heading-id id="hs-design"-->',
    '## 设计节',
    '',
    '设计节正文应可见',
    '',
    '<!--tu:embed id="b-demo-x6-1" type="x6"-->',
  ].join('\n'),
  embeds: [
    {
      id: 'b-demo-x6-1',
      type: 'x6',
      title: '示例画板',
      graphData: {
        nodes: [
          { id: 'demo-node-1', x: 120, y: 100, width: 120, height: 56, label: '开始' },
          { id: 'demo-node-2', x: 340, y: 100, width: 140, height: 56, label: '切换到 mock' },
        ],
        edges: [
          { id: 'demo-edge-1', source: 'demo-node-1', target: 'demo-node-2' },
        ],
      },
    },
  ],
  annotations: [],
  metadata: {
    sectionTags: {
      'local:hs-design': [{ id: 'tag-design', label: '设计', color: '#1677ff' }],
    },
  },
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
  })
})

async function seedTagFilterPage(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Reset Mock' }).click()
  await page.waitForFunction(() => Boolean(window.localStorage.getItem('tu:mock-state')))
  await page.evaluate((pageContent) => {
    const raw = window.localStorage.getItem('tu:mock-state')
    if (!raw) throw new Error('mock state missing')
    const state = JSON.parse(raw)
    state.contents['p-demo-1'] = pageContent
    window.localStorage.setItem('tu:mock-state', JSON.stringify(state))
  }, TAG_FILTER_PAGE_CONTENT)
  await page.reload()
}

test('hides untagged section body when filtering by section tag', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await seedTagFilterPage(page)
  await expect(page.locator('.tu-editor-page .ProseMirror')).toBeVisible()
  await expect(page.locator('.page-tags-bar .tag-chip', { hasText: '设计' })).toBeVisible({ timeout: 15_000 })

  const editor = page.locator('.tu-editor-page .ProseMirror')
  const hiddenParagraph = editor.getByText('实现节正文应被隐藏')
  const visibleParagraph = editor.getByText('设计节正文应可见')
  await expect(hiddenParagraph).toBeVisible()
  await expect(visibleParagraph).toBeVisible()

  await page.locator('.page-tags-bar .tag-chip', { hasText: '设计' }).click()
  await expect(page.locator('.page-tags-bar .tag-chip--active', { hasText: '设计' })).toBeVisible()

  await expect(visibleParagraph).toBeVisible()
  await expect(hiddenParagraph).toBeHidden({ timeout: 10_000 })

  const hiddenNodes = await page.locator('.tu-editor-page .ProseMirror .tag-filter--hidden').count()
  expect(hiddenNodes).toBeGreaterThan(0)
})
