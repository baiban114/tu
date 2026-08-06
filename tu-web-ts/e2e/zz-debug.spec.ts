import { expect, test } from '@playwright/test'

test('debug blank annotation popover', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    window.localStorage.removeItem('tu:mock-state')
    window.sessionStorage.setItem('tu:zz-debug', '1')
  })
  await page.goto('/')
  await expect(page.locator('.ProseMirror')).toBeVisible()

  const paragraph = page.locator('.ProseMirror p').first()
  await paragraph.click()
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('End')
  await page.keyboard.up('Shift')

  const addNoteBtn = page.locator('.selection-toolbar').getByRole('button', { name: '标注' })
  await expect(addNoteBtn).toBeVisible({ timeout: 8000 })
  await addNoteBtn.click()
  const dialog = page.locator('.note-editor-popover')
  await expect(dialog).toBeVisible()
  await dialog.locator('textarea').fill('待复核')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toBeHidden()

  page.on('console', (msg) => {
    if (msg.text().includes('[DEBUG')) console.log('PAGE:', msg.text())
  })
  page.setDefaultTimeout(4000)
  const highlight = page.locator('[data-tu-annotation-id]').first()
  await expect(highlight).toBeVisible()
  console.log('BEFORE blank: highlight count=', await page.locator('[data-tu-annotation-id]').count())
  await highlight.click()
  console.log('AFTER click (with note): popover count=', await page.locator('.note-popover').count(),
    'noteEditor count=', await page.locator('.note-editor-popover').count())
  const popover = page.locator('.note-popover')
  await expect(popover).toBeVisible()
  await popover.getByRole('button', { name: '编辑' }).first().click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('textarea')).toHaveValue('待复核')
  await dialog.locator('textarea').fill('')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toBeHidden()

  await page.waitForFunction(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    const contents = state.contents || {}
    return Object.values(contents).some((pageContent: { annotations?: Array<{ note?: string }> }) =>
      (pageContent.annotations || []).some((ann) => (ann.note || '') === ''))
  })

    console.log('AFTER blank: highlight count=', await page.locator('[data-tu-annotation-id]').count())
  await page.evaluate(() => {
    window.__clicks = []
    for (const t of ['mousedown', 'mouseup', 'click']) {
      document.addEventListener(t, (e) => {
        const el = e.target as HTMLElement
        window.__clicks.push(`${t} target=${el.tagName}.${el.className?.split(' ')[0]} ann=${el.closest('[data-tu-annotation-id]')?.getAttribute('data-tu-annotation-id') ?? 'none'}`)
      }, true)
    }
  })
  const highlight2 = page.locator('[data-tu-annotation-id]').first()
  await expect(highlight2).toBeVisible()
  const box = await highlight2.boundingBox()
  console.log('highlight2 box=', JSON.stringify(box))
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const probe = await page.evaluate(([x, y]) => {
      window.scrollTo(0, 0)
      const el = document.elementFromPoint(x, y)
      const chain: string[] = []
      let cur = el
      while (cur && chain.length < 6) {
        chain.push(`${cur.tagName}.${(cur as HTMLElement).className}${cur.getAttribute ? `[ann=${cur.getAttribute('data-tu-annotation-id')}]` : ''}`)
        cur = cur.parentElement
      }
      return chain
    }, [cx, cy] as const)
    console.log('elementFromPoint chain=', JSON.stringify(probe))
    await page.mouse.click(cx, cy)
  }
  await page.waitForTimeout(500)
  console.log('clicks=', JSON.stringify(await page.evaluate(() => window.__clicks)))
  console.log('AFTER click (blank): popover count=', await page.locator('.note-popover').count(),
    'noteEditor count=', await page.locator('.note-editor-popover').count())
  const selections = await page.evaluate(() => window.getSelection()?.toString() ?? '')
  console.log('selection text=', JSON.stringify(selections))
})