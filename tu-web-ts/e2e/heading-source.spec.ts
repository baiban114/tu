import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.sessionStorage.getItem('tu:heading-source-e2e-init')) {
      window.localStorage.removeItem('tu:mock-state')
      window.localStorage.removeItem('tu:mock-ai-run-logs')
      window.sessionStorage.setItem('tu:heading-source-e2e-init', '1')
    }
  })
})

async function waitForHeadingSourceInContent(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    type StoredDocNode = {
      type?: string
      attrs?: {
        sourceBinding?: {
          resourceItemId?: string
          resourceExcerptId?: string
        }
      }
      content?: StoredDocNode[]
    }

    const hasBinding = (content: { content?: string; document?: { content?: StoredDocNode[] } }): boolean => {
      if (typeof content.content === 'string' && content.content.includes('<!--tu:heading-source')) {
        return true
      }
      const walk = (nodes?: StoredDocNode[]): boolean => {
        if (!nodes) return false
        for (const node of nodes) {
          const binding = node.attrs?.sourceBinding
          if (node.type === 'heading' && binding?.resourceItemId && binding?.resourceExcerptId) {
            return true
          }
          if (walk(node.content)) return true
        }
        return false
      }
      return walk(content.document?.content)
    }

    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    return Object.values(state.contents || {}).some((content) => hasBinding(content as { content?: string; document?: { content?: StoredDocNode[] } }))
  })
}

async function expectMockReferencesIncludeHeadingSource(page: import('@playwright/test').Page) {
  const found = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('tu:mock-state') || '{}') as {
      contents?: Record<string, StoredPageContent>
      resourceExcerpts?: Array<{ id: string; title?: string }>
    }

    type StoredPageContent = {
      content?: string
      document?: { content?: StoredDocNode[] }
    }

    type StoredDocNode = {
      type?: string
      attrs?: {
        sourceBinding?: {
          resourceItemId?: string
          resourceExcerptId?: string
          snapshot?: { excerptTitle?: string; resourceTitle?: string }
        }
      }
      content?: StoredDocNode[]
    }

    function findHeadingSourceBinding(content: StoredPageContent) {
      if (typeof content.content === 'string') {
        const re = /<!--tu:heading-source\s+([^>]+)-->/g
        let match: RegExpExecArray | null
        while ((match = re.exec(content.content)) !== null) {
          const attrs: Record<string, string> = {}
          for (const part of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
            attrs[part[1]] = part[2]
          }
          if (attrs.item && attrs.excerpt) {
            return { resourceItemId: attrs.item, resourceExcerptId: attrs.excerpt, excerptTitle: attrs.title }
          }
        }
      }

      const walk = (nodes?: StoredDocNode[]): ReturnType<typeof findHeadingSourceBinding> => {
        if (!nodes) return null
        for (const node of nodes) {
          const binding = node.attrs?.sourceBinding
          if (node.type === 'heading' && binding?.resourceItemId && binding?.resourceExcerptId) {
            return {
              resourceItemId: binding.resourceItemId,
              resourceExcerptId: binding.resourceExcerptId,
              excerptTitle: binding.snapshot?.excerptTitle,
            }
          }
          const nested = walk(node.content)
          if (nested) return nested
        }
        return null
      }

      return walk(content.document?.content) ?? null
    }

    for (const pc of Object.values(state.contents || {})) {
      const binding = findHeadingSourceBinding(pc)
      if (!binding) continue
      const excerpt = (state.resourceExcerpts || []).find((entry) => entry.id === binding.resourceExcerptId)
      if (excerpt) return excerpt.title || binding.excerptTitle || true
    }
    return null
  })
  expect(found).toBeTruthy()
  return String(found)
}

async function clickHeadingWithoutSelection(page: import('@playwright/test').Page) {
  const heading = page.locator('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3').first()
  await expect(heading).toBeVisible()
  await heading.click()
  await page.keyboard.press('Home')
}

async function openSectionHandleMenu(page: import('@playwright/test').Page, itemLabel: string) {
  const heading = page.locator('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3').first()
  await expect(heading).toBeVisible()
  await heading.hover()
  const handle = page.locator('.tu-editor-wrapper > .hover-handle').first()
  await expect(handle).toBeVisible({ timeout: 5000 })
  await handle.hover()
  await page.locator('.hover-handle__item', { hasText: itemLabel }).click()
}

async function bindHeadingSourceFromSectionHandle(page: import('@playwright/test').Page) {
  await openSectionHandleMenu(page, '标记来源')

  const dialog = page.getByRole('dialog', { name: '标记标题来源' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /示例之书/ }).first().click()
  await dialog.getByRole('button', { name: /关于结构化笔记/ }).click()
}

test('does not show selection toolbar on heading click without text selection', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await clickHeadingWithoutSelection(page)
  await expect(page.locator('.selection-toolbar')).toHaveCount(0)
})

test('binds heading source, persists after reload, and indexes mock references', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await bindHeadingSourceFromSectionHandle(page)

  await expect(page.locator('.heading-source-badge')).toBeVisible()
  await expect(page.locator('.heading-source-badge')).toContainText('关于结构化笔记')
  await expect(page.locator('.page-toc__source')).toBeVisible()
  await page.waitForTimeout(700)
  await waitForHeadingSourceInContent(page)
  const excerptTitle = await expectMockReferencesIncludeHeadingSource(page)
  expect(excerptTitle).toContain('关于结构化笔记')

  await page.reload()
  await expect(page.locator('.heading-source-badge')).toBeVisible()
  await expect(page.locator('.page-toc__source')).toBeVisible()
})

test('clears heading source from section handle menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await bindHeadingSourceFromSectionHandle(page)
  await expect(page.locator('.heading-source-badge')).toBeVisible()

  await openSectionHandleMenu(page, '解除来源')
  await expect(page.locator('.heading-source-badge')).toHaveCount(0)
})
