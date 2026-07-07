import { expect, type Page, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.sessionStorage.getItem('tu:external-resource-e2e-init')) {
      window.localStorage.removeItem('tu:mock-state')
      window.localStorage.removeItem('tu:mock-ai-run-logs')
      window.sessionStorage.setItem('tu:external-resource-e2e-init', '1')
    }
  })
})

async function openResourcePicker(page: Page) {
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await page.getByRole('button', { name: '插入资源' }).click()
  const dialog = page.getByRole('dialog', { name: '插入外部资源' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /示例之书/ }).first().click()
  return dialog
}

async function waitForExternalResourceEmbed(page: Page, mode: 'resource' | 'excerpt') {
  await page.waitForFunction((expectedMode) => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    return Object.values(state.contents || {}).some((content: any) => (
      Array.isArray(content.embeds)
      && content.embeds.some((embed: any) => embed.type === 'externalResource' && embed.externalResource?.mode === expectedMode)
    ))
  }, mode)
}

async function openBookExcerptPanel(page: Page) {
  await page.goto('/resources?tab=items')
  const row = page.locator('.resource-row').filter({ hasText: '示例之书' }).first()
  await row.getByRole('button', { name: '节选' }).click()
  const panel = page.locator('.resource-excerpts-panel')
  await expect(panel).toBeVisible()
  return panel
}

test('manages book excerpts on the resources page', async ({ page }) => {
  const panel = await openBookExcerptPanel(page)
  await expect(panel.getByText('关于结构化笔记')).toBeVisible()

  await panel.getByRole('button', { name: '新增节选' }).click()
  await panel.getByLabel('标题').fill('第二个片段')
  await panel.getByLabel('页码/定位').fill('第 2 章')
  await panel.getByLabel('节选正文').fill('第二段用于验证一本书可以保存多个节选。')
  await panel.getByLabel('备注').fill('新增节选备注')
  await panel.getByRole('button', { name: '创建节选' }).click()

  await expect(panel.getByText('第二个片段')).toBeVisible()
  const row = panel.locator('.excerpt-row').filter({ hasText: '第二个片段' })
  await row.getByRole('button', { name: '编辑' }).click()
  await panel.getByLabel('备注').fill('已更新备注')
  await panel.getByRole('button', { name: '保存节选' }).click()
  await expect(panel.getByText('已更新备注')).toBeVisible()

  await row.getByRole('button', { name: '删除' }).click()
  await page.getByRole('button', { name: '确定' }).click()
  await expect(panel.getByText('第二个片段')).not.toBeVisible()
})

test('creates a resource item without choosing a work or ISBN', async ({ page }) => {
  await page.goto('/resources?tab=items')
  const form = page.locator('.resource-form').first()
  await expect(form.getByLabel('归类 Work')).toHaveValue('')

  await form.getByLabel('标题').fill('未归类无 ISBN 图书')
  await form.getByRole('button', { name: '创建实体' }).click()

  const row = page.locator('.resource-row').filter({ hasText: '未归类无 ISBN 图书' })
  await expect(row).toContainText('归类：未归类')
  await expect(row).toContainText('ISBN: 未填写')
})

test('inserts a whole external resource and keeps it after reload', async ({ page }) => {
  const dialog = await openResourcePicker(page)
  await dialog.getByRole('button', { name: '插入整个资源' }).click()

  const card = page.locator('.external-resource-card').last()
  await expect(card).toContainText('示例之书')
  await expect(card).toContainText('ISBN')
  await waitForExternalResourceEmbed(page, 'resource')

  await page.reload()
  await expect(page.locator('.external-resource-card')).toContainText('示例之书')
})

test('inserts an existing excerpt and shows it in references', async ({ page }) => {
  const dialog = await openResourcePicker(page)
  await dialog.getByRole('button', { name: /关于结构化笔记/ }).click()

  const card = page.locator('.external-resource-card').last()
  await expect(card).toContainText('图书节选')
  await expect(card).toContainText('第 1 章')
  await expect(card).toContainText('好的笔记系统')
  await waitForExternalResourceEmbed(page, 'excerpt')

  await page.goto('/resources?tab=references')
  await expect(page.locator('.resource-row').filter({ hasText: '关于结构化笔记' })).toContainText('节选：关于结构化笔记')
  await expect(page.locator('.resource-row').filter({ hasText: '关于结构化笔记' })).toContainText('第 1 章')
})

test('creates an excerpt in the picker, inserts it, and lists it in resources', async ({ page }) => {
  const dialog = await openResourcePicker(page)
  await dialog.locator('.resource-picker__form input[placeholder="节选标题"]').fill('即时创建节选')
  await dialog.locator('.resource-picker__form input[placeholder^="页码"]').fill('附录 A')
  await dialog.locator('.resource-picker__form textarea[placeholder="节选正文"]').fill('这是在插入弹窗中快速创建的图书节选。')
  await dialog.locator('.resource-picker__form textarea[placeholder^="备注"]').fill('来自插入弹窗')
  await dialog.getByRole('button', { name: '创建并插入节选' }).click()

  const card = page.locator('.external-resource-card').last()
  await expect(card).toContainText('即时创建节选')
  await expect(card).toContainText('附录 A')
  await waitForExternalResourceEmbed(page, 'excerpt')

  const panel = await openBookExcerptPanel(page)
  await expect(panel.getByText('即时创建节选')).toBeVisible()
  await expect(panel.getByText('来自插入弹窗')).toBeVisible()
})
