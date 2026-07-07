import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.sessionStorage.getItem('tu:heading-section-fold-e2e-init')) {
      window.localStorage.removeItem('tu:mock-state')
      window.sessionStorage.setItem('tu:heading-section-fold-e2e-init', '1')
    }
  })
})

async function waitForHeadingFoldPersisted(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    const contents = state.contents || {}
    type DocNode = { type?: string; attrs?: { sectionCollapsed?: boolean }; content?: DocNode[] }
    const hasCollapsedHeading = (nodes?: DocNode[]): boolean => {
      if (!nodes) return false
      for (const node of nodes) {
        if (node.type === 'heading' && node.attrs?.sectionCollapsed) return true
        if (hasCollapsedHeading(node.content)) return true
      }
      return false
    }
    return Object.values(contents).some((pageContent: { document?: { content?: DocNode[] }; content?: string }) => {
      if (hasCollapsedHeading(pageContent.document?.content)) return true
      return typeof pageContent.content === 'string' && pageContent.content.includes('<!--tu:heading-fold')
    })
  })
}

async function showHeadingGutter(page: import('@playwright/test').Page) {
  const heading = page.locator('.ProseMirror h1').first()
  await expect(heading).toBeVisible()
  await heading.hover()
}

async function clickFoldButton(page: import('@playwright/test').Page, label: '收起本节' | '展开本节') {
  await showHeadingGutter(page)
  await page.getByRole('button', { name: label }).first().click()
}

async function openLineHandleMenu(page: import('@playwright/test').Page, itemLabel: string) {
  const heading = page.locator('.ProseMirror h1').first()
  await expect(heading).toBeVisible()
  await heading.hover()
  const handle = page.locator('.tu-editor-wrapper > .hover-handle').first()
  await expect(handle).toBeVisible({ timeout: 5000 })
  await handle.hover()
  await page.locator('.hover-handle__item', { hasText: itemLabel }).click()
}

test('collapses and expands heading section in editor body', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  const bodyParagraph = page.locator('.ProseMirror p').first()
  await expect(bodyParagraph).toBeVisible()

  await clickFoldButton(page, '收起本节')
  await expect(bodyParagraph).toBeHidden()

  await clickFoldButton(page, '展开本节')
  await expect(bodyParagraph).toBeVisible()
})

test('persists collapsed section after reload', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await clickFoldButton(page, '收起本节')
  await expect(page.locator('.ProseMirror p').first()).toBeHidden()
  await waitForHeadingFoldPersisted(page)

  await page.reload()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect(page.locator('.ProseMirror p').first()).toBeHidden()
})

test('collapsing parent heading hides nested subsections', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  const firstParagraph = page.locator('.ProseMirror p').first()
  await firstParagraph.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('## 子节')
  await page.keyboard.press('Enter')
  await page.keyboard.type('子节正文')
  await page.keyboard.press('Enter')
  await page.keyboard.type('### 孙节')
  await page.keyboard.press('Enter')
  await page.keyboard.type('孙节正文')

  await expect(page.locator('.ProseMirror h2')).toContainText('子节')
  await expect(page.locator('.ProseMirror h3')).toContainText('孙节')

  await clickFoldButton(page, '收起本节')
  await expect(page.locator('.ProseMirror h2')).toBeHidden()
  await expect(page.locator('.ProseMirror h3')).toBeHidden()
  await expect(page.getByText('子节正文')).toBeHidden()
  await expect(page.getByText('孙节正文')).toBeHidden()
  await expect(page.locator('.ProseMirror h1').first()).toBeVisible()
})

test('adds section annotation from line handle menu on heading', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await openLineHandleMenu(page, '添加标注（本节）')
  const dialog = page.locator('.note-editor-popover')
  await expect(dialog).toBeVisible()
  await dialog.locator('textarea').fill('本节要点')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toBeHidden()

  await page.waitForFunction(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    const contents = state.contents || {}
    return Object.values(contents).some((pageContent: { annotations?: Array<{ note?: string; scope?: string }> }) => (
      (pageContent.annotations || []).some((ann) => ann.note === '本节要点' && (ann.scope === 'compound' || ann.scope === 'block'))
    ))
  })
})
