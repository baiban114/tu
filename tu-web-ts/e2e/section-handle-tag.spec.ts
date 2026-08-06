import { expect, test } from '@playwright/test'

const SECTION_PAGE_CONTENT = {
  content: [
    '# 标签范围示例页',
    '',
    '<!--tu:heading-id id="hs-arch"-->',
    '## 架构节',
    '',
    '架构节正文',
    '',
    '<!--tu:heading-id id="hs-impl"-->',
    '## 实现节',
    '',
    '实现节正文',
  ].join('\n'),
  embeds: [],
  annotations: [],
  metadata: {},
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
  })
})

async function seedSectionPage(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Reset Mock' }).click()
  await page.waitForFunction(() => Boolean(window.localStorage.getItem('tu:mock-state')))
  await page.evaluate((pageContent) => {
    const raw = window.localStorage.getItem('tu:mock-state')
    if (!raw) throw new Error('mock state missing')
    const state = JSON.parse(raw)
    state.contents['p-demo-1'] = pageContent
    window.localStorage.setItem('tu:mock-state', JSON.stringify(state))
  }, SECTION_PAGE_CONTENT)
  await page.reload()
}

async function openSectionAnnotate(page: import('@playwright/test').Page) {
  const heading = page.locator('.ProseMirror h2').first()
  await expect(heading).toBeVisible()
  await heading.hover()
  const handle = page.locator('.tu-editor-wrapper > .hover-handle').first()
  await expect(handle).toBeVisible({ timeout: 5000 })
  await handle.hover()
  await page.locator('.hover-handle__item', { hasText: '添加标注（本节）' }).click()
}

async function addTagInNoteEditor(page: import('@playwright/test').Page, tagLabel: string) {
  const dialog = page.locator('.note-editor-popover')
  await expect(dialog).toBeVisible()
  await dialog.locator('.note-editor-tag-input').fill(tagLabel)
  await dialog.locator('.note-editor-tag-option--create').click()
  await expect(dialog.locator('.tag-chip--selected', { hasText: tagLabel })).toBeVisible()
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toBeHidden()
}

async function readStoredMetadata(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    const pageContent = state.contents?.['p-demo-1'] || {}
    return {
      sectionTags: pageContent.metadata?.sectionTags ?? {},
      textTagSpans: pageContent.metadata?.textTagSpans ?? [],
    }
  })
}

test('section-handle tagging writes sectionTags (not textTagSpans)', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await seedSectionPage(page)
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await openSectionAnnotate(page)
  await addTagInNoteEditor(page, '架构')

  await page.waitForFunction(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    const pageContent = state.contents?.['p-demo-1'] || {}
    const sectionTags = pageContent.metadata?.sectionTags ?? {}
    const hasTag = Object.values(sectionTags).some((tags: Array<{ label?: string }>) =>
      (tags || []).some((tag) => tag.label === '架构'))
    const noTextSpans = (pageContent.metadata?.textTagSpans ?? []).length === 0
    return hasTag && noTextSpans
  })

  const stored = await readStoredMetadata(page)
  const sectionKeys = Object.keys(stored.sectionTags).filter((key) =>
    stored.sectionTags[key].some((tag: { label?: string }) => tag.label === '架构'))
  expect(sectionKeys.length).toBeGreaterThan(0)
  expect(sectionKeys.every((key) => key.startsWith('local:'))).toBe(true)
  expect(stored.textTagSpans.length).toBe(0)
})

test('reopening section annotate preloads existing section tags', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await seedSectionPage(page)
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await openSectionAnnotate(page)
  await addTagInNoteEditor(page, '架构')

  await page.waitForFunction(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    const pageContent = state.contents?.['p-demo-1'] || {}
    return Object.values(pageContent.metadata?.sectionTags ?? {}).some((tags: Array<{ label?: string }>) =>
      (tags || []).some((tag) => tag.label === '架构'))
  })

  await openSectionAnnotate(page)
  const dialog = page.locator('.note-editor-popover')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.tag-chip--selected', { hasText: '架构' })).toBeVisible({ timeout: 5000 })
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toBeHidden()
})
