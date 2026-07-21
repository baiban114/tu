import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.sessionStorage.getItem('tu:kb-resource-document-e2e-init')) {
      window.localStorage.removeItem('tu:mock-state')
      window.localStorage.removeItem('tu:mock-ai-run-logs')
      window.sessionStorage.setItem('tu:kb-resource-document-e2e-init', '1')
    }
  })
})

test('links a document resource into the KB page list as read-only', async ({ page }) => {
  test.setTimeout(60_000)

  await page.goto('/')
  await expect(page.locator('.kb-item').filter({ hasText: '个人笔记' }).first()).toBeVisible()
  await page.locator('.kb-item').filter({ hasText: '个人笔记' }).first().click()
  await expect(page.locator('.page-tree .node-label').filter({ hasText: '快速入门' })).toBeVisible()

  await page.locator('.section-actions button[title="新建页面"]').click()
  await page.getByRole('menuitem', { name: '挂接到知识库' }).click()
  const dialog = page.getByRole('dialog', { name: '挂接文档资源到知识库' })
  await expect(dialog).toBeVisible()
  await dialog.locator('.resource-picker__item').filter({ hasText: '示例文档资源' }).click()
  await dialog.getByRole('button', { name: '加入当前知识库' }).click()
  await expect(dialog).toBeHidden()

  const resourceNode = page.locator('.page-tree .tree-node--resource-document').filter({ hasText: '示例文档资源' })
  await expect(resourceNode).toBeVisible()
  await resourceNode.click()

  await expect(page.locator('.resource-document-banner__tag')).toHaveText('只读')
  await expect(page.locator('.ProseMirror')).toContainText('这是挂接到知识库后只读展示的文档节选正文')
  await expect(page.locator('.ProseMirror')).toContainText('第二节内容：节选会按顺序拼接成一篇只读文档')
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
})
