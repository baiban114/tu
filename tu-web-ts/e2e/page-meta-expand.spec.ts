import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
  })
})

async function openEditorPage(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.locator('.tu-editor-page .ProseMirror')).toBeVisible()
}

test('remembers document metadata expand state across reload', async ({ page }) => {
  test.setTimeout(90_000)
  await openEditorPage(page)

  // Metadata bar is shown (collapsed rail) in editable mock page.
  const collapsedRail = page.getByRole('button', { name: '展开文档元数据' })
  await expect(collapsedRail).toBeVisible({ timeout: 15_000 })
  await collapsedRail.click()

  const expandedToggle = page.getByRole('button', { name: '收起文档元数据' })
  await expect(expandedToggle).toBeVisible()

  await page.reload()
  await expect(page.locator('.tu-editor-page .ProseMirror')).toBeVisible()
  await expect(page.getByRole('button', { name: '收起文档元数据' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: '展开文档元数据' })).toHaveCount(0)
})

test('remembers document metadata collapsed state after manual collapse', async ({ page }) => {
  test.setTimeout(90_000)
  await openEditorPage(page)

  const expandedToggle = page.getByRole('button', { name: '收起文档元数据' })
  if (await expandedToggle.isVisible().catch(() => false)) {
    await expandedToggle.click()
  } else {
    await page.getByRole('button', { name: '展开文档元数据' }).click()
    await page.getByRole('button', { name: '收起文档元数据' }).click()
  }
  await expect(page.getByRole('button', { name: '展开文档元数据' })).toBeVisible()

  await page.reload()
  await expect(page.locator('.tu-editor-page .ProseMirror')).toBeVisible()
  await expect(page.getByRole('button', { name: '展开文档元数据' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: '收起文档元数据' })).toHaveCount(0)
})