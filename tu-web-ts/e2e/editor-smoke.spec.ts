import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('loads the editor in mock mode', async ({ page }) => {
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect(page.locator('.ProseMirror h1').first()).toBeVisible()
  await expect(page.locator('[data-block-id]').first()).toBeVisible()
})

test('keeps content floating toolbar below the workspace topbar', async ({ page }) => {
  const nodeView = page.locator('.x6-block-view').first()
  await expect(nodeView).toBeVisible()

  await nodeView.click()
  const toolbar = page.locator('.nodeview-toolbar')
  await expect(toolbar).toBeVisible()

  const topbarZIndex = await page.locator('.workspace-topbar').evaluate((el) => getComputedStyle(el).zIndex)
  const toolbarZIndex = await toolbar.evaluate((el) => getComputedStyle(el).zIndex)

  expect(Number(toolbarZIndex)).toBeLessThan(Number(topbarZIndex))
})

test('code block keeps leading Enter and lets the cursor leave from its start', async ({ page }) => {
  const editor = page.locator('.ProseMirror')
  const sourceParagraph = editor.locator(':scope > p').first()
  await sourceParagraph.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('```')
  await page.keyboard.press('Space')

  const codeBlock = page.locator('.tu-code-block-view')
  const codeContent = codeBlock.locator('[data-node-view-content]')
  await expect(codeBlock).toBeVisible()

  await page.keyboard.type('alpha')
  await codeContent.evaluate((element) => {
    const textNode = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()
    if (!textNode) throw new Error('code block text node is missing')
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })

  await page.keyboard.press('Enter')
  await expect(codeContent).toHaveText('\nalpha')

  await codeContent.evaluate((element) => {
    const textNode = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()
    if (!textNode) throw new Error('code block text node is missing')
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  const paragraphCountBefore = await editor.locator(':scope > p').count()
  await page.waitForTimeout(100)
  await page.keyboard.press('ArrowLeft')

  await expect(editor.locator(':scope > p')).toHaveCount(paragraphCountBefore)
  await expect(editor.locator(':scope > .ProseMirror-gapcursor')).toHaveCSS('display', 'block')
  await expect(codeBlock).toBeVisible()
})
