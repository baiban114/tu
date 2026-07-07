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
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    return Object.values(state.contents || {}).some((content: { content?: string }) => (
      typeof content.content === 'string' && content.content.includes('<!--tu:heading-source')
    ))
  })
}

async function expectMockReferencesIncludeHeadingSource(page: import('@playwright/test').Page) {
  const found = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('tu:mock-state') || '{}') as {
      contents?: Record<string, { content?: string }>
      resourceExcerpts?: Array<{ id: string; title?: string }>
    }
    const re = /<!--tu:heading-source\s+([^>]+)-->/g
    for (const pc of Object.values(state.contents || {})) {
      if (!pc?.content) continue
      re.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = re.exec(pc.content)) !== null) {
        const attrs: Record<string, string> = {}
        for (const part of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
          attrs[part[1]] = part[2]
        }
        if (!attrs.excerpt || !attrs.item) continue
        const excerpt = (state.resourceExcerpts || []).find((entry) => entry.id === attrs.excerpt)
        if (excerpt) return excerpt.title || attrs.title || true
      }
    }
    return null
  })
  expect(found).toBeTruthy()
  return String(found)
}

async function selectFirstHeading(page: import('@playwright/test').Page) {
  const heading = page.locator('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3').first()
  await expect(heading).toBeVisible()
  await heading.click()
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('End')
  await page.keyboard.up('Shift')
}

async function bindHeadingSourceFromSelection(page: import('@playwright/test').Page) {
  const markSourceButton = page.getByRole('button', { name: '标记来源' })
  await expect(markSourceButton).toBeVisible({ timeout: 8000 })
  await markSourceButton.click()

  const dialog = page.getByRole('dialog', { name: '标记标题来源' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /示例之书/ }).first().click()
  await dialog.getByRole('button', { name: /关于结构化笔记/ }).click()
}

test('binds heading source, persists after reload, and indexes mock references', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await selectFirstHeading(page)
  await bindHeadingSourceFromSelection(page)

  await expect(page.locator('.heading-source-badge')).toBeVisible()
  await expect(page.locator('.heading-source-badge')).toContainText('关于结构化笔记')
  await expect(page.locator('.page-toc__source')).toBeVisible()
  await waitForHeadingSourceInContent(page)
  const excerptTitle = await expectMockReferencesIncludeHeadingSource(page)
  expect(excerptTitle).toContain('关于结构化笔记')

  await page.reload()
  await expect(page.locator('.heading-source-badge')).toBeVisible()
  await expect(page.locator('.page-toc__source')).toBeVisible()
})

test('clears heading source from selection toolbar', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  await selectFirstHeading(page)
  await bindHeadingSourceFromSelection(page)
  await expect(page.locator('.heading-source-badge')).toBeVisible()

  await selectFirstHeading(page)
  await expect(page.getByRole('button', { name: '解除来源' })).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: '解除来源' }).click()
  await expect(page.locator('.heading-source-badge')).toHaveCount(0)
})
