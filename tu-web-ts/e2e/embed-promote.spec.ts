import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('promotes embedded mindmap to standalone page', async ({ page }) => {
  const editor = page.locator('.ProseMirror').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await editor.pressSequentially('/思维导图')

  const slashItem = page.locator('.slash-command-menu__item').filter({ hasText: '思维导图' })
  await expect(slashItem).toBeVisible()
  await slashItem.click()

  const mindmapBlock = page.locator('.resizable-block-wrapper').filter({ hasText: '思维导图' }).last()
  await expect(mindmapBlock).toBeVisible()
  await mindmapBlock.click()

  const promoteButton = page.getByRole('button', { name: '升级为思维导图页' })
  await expect(promoteButton).toBeVisible()
  await promoteButton.click()
  await page.getByRole('button', { name: '升级', exact: true }).click()

  await expect(page.locator('.canvas-page')).toBeVisible()
  await expect(page.locator('.x6-stage')).toBeVisible()
  await expect(page.locator('.page-tree .tree-node').filter({ hasText: '思维导图' }).first()).toBeVisible()

  await page.locator('.page-tree .tree-node').filter({ hasText: '快速入门' }).first().click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect(page.locator('.resizable-block-wrapper').filter({ hasText: '思维导图' })).toHaveCount(0)
})
