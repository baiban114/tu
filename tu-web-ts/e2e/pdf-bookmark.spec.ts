import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

const MINIMAL_PDF_BASE64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9Db3VudCAzIC9LaWRzIFszIDAgUiA0IDAgUiA1IDAgUl0gPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8ID4+IC9Db250ZW50cyBbXSA+PgplbmRvYmoKNCAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdIC9SZXNvdXJjZXMgPDwgPj4gL0NvbnRlbnRzIFtdID4+CmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNjEyIDc5Ml0gL1Jlc291cmNlcyA8PCA+PiAvQ29udGVudHMgW10gPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMjcgMDAwMDAgbiAKMDAwMDAwMDIyOCAwMDAwMCBuIAowMDAwMDAwMzI5IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDMwCiUlRU9GCg=='

function multiPagePdfBase64(pageCount: number): string {
  const pageObjectNumbers = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageObjectNumbers.join(' ')}] >>`,
    ...pageObjectNumbers.map(() => (
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents [] >>'
    )),
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'ascii')
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf, 'ascii')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'ascii').toString('base64')
}

const BOOKMARK_BLOCK = {
  type: 'pdfExcerptBlock',
  attrs: {
    blockId: 'pdf-bookmark-block',
    fileId: 'pdf-bookmark-file',
    fileName: 'bookmarks.pdf',
    viewMode: 'full',
    startPage: 1,
    endPage: 3,
    height: 480,
    clipTop: 0,
    clipBottom: 1,
    notesVisible: false,
    bookmarks: [],
    title: 'PDF 书签测试',
    sourceHref: '',
    sourceLabel: 'PDF 书签测试',
  },
}

async function openPdf(
  page: Page,
  bookmarkBlock = BOOKMARK_BLOCK,
  pdfBase64 = MINIMAL_PDF_BASE64,
) {
  await page.addInitScript(({ pdfBase64, block }) => {
    window.localStorage.setItem('tu:data-source', 'mock')
    if (!window.localStorage.getItem('tu:mock-state')) {
      window.localStorage.setItem('tu:mock-state', JSON.stringify({
        knowledgeBases: [
          { id: 'kb-pdf-bookmark', name: 'PDF Bookmark E2E', icon: 'P', description: '' },
        ],
        pages: [{
          id: 'p-pdf-bookmark',
          kbId: 'kb-pdf-bookmark',
          parentId: null,
          title: 'PDF 书签测试',
          order: 0,
          pageType: 'document',
        }],
        contents: {
          'p-pdf-bookmark': {
            schemaVersion: 2,
            document: { type: 'doc', content: [block] },
            content: '',
            embeds: [],
            annotations: [],
          },
        },
        resourceTypes: [],
        resourceWorks: [],
        resourceItems: [],
        resourceChapters: [],
        resourceExcerpts: [],
        resourceCrawledDocuments: [],
        resourcePdfRegionNotes: [],
        urlClusterRules: [],
        resourceItemRelations: [],
        kbResourceLinks: [],
        contentComments: [],
        contentTreeHours: {},
        pageUpdatedAt: {},
      }))
    }
    const binary = atob(pdfBase64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
      if (url.includes('/api/files/pdf-bookmark-file')) {
        return Promise.resolve(new Response(bytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(bytes.byteLength),
            'Accept-Ranges': 'bytes',
          },
        }))
      }
      return originalFetch(input, init)
    }
  }, { pdfBase64, block: bookmarkBlock })

  await page.goto('/?pageId=p-pdf-bookmark')
  const pdfBlock = page.locator('.pdf-excerpt-block-nv')
  await expect(pdfBlock).toBeVisible()
  await expect(pdfBlock.getByRole('button', { name: '添加书签' }).first()).toBeVisible({
    timeout: 15_000,
  })
  return pdfBlock
}

test('adds at the visible page, renames from the menu and deletes', async ({ page }) => {
  test.setTimeout(60_000)
  const block = await openPdf(page)
  const pages = block.locator('.pdf-excerpt-block__pages')

  await block.locator('.pdf-excerpt-block__main').click()
  await pages.evaluate(async (element) => {
    const waitFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const deadline = performance.now() + 10_000
    while (performance.now() < deadline && element.scrollHeight <= element.clientHeight) {
      await waitFrame()
    }
  })
  await pages.evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2
    element.dispatchEvent(new Event('scroll'))
  })
  await expect(block.getByRole('navigation', { name: 'PDF 页码导航' })
    .locator('.pdf-excerpt-block__page-navigation-current')).toHaveText('2')
  await block.getByRole('button', { name: '添加书签' }).first().click()
  const bookmark = block.getByRole('treeitem', { name: /未命名书签，第 2 页/ })
  await expect(bookmark).toBeVisible()
  await bookmark.click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await bookmark.click({ button: 'right' })
  await expect(menu).toBeVisible()
  await page.locator('.pdf-excerpt-block__sidebar-title').click()
  await expect(menu).toBeHidden()
  await bookmark.click({ button: 'right' })
  await menu.getByRole('menuitem', { name: '重命名' }).click()
  const renameInput = block.locator('[data-tree-node-rename-input]')
  await expect(renameInput).toBeVisible()
  await renameInput.fill('进程调度')
  await renameInput.press('Enter')
  await expect(block.getByRole('treeitem', { name: /进程调度，第 2 页/ })).toBeVisible()

  await page.waitForFunction(() => (
    window.localStorage.getItem('tu:mock-state')?.includes('"title":"进程调度"')
    && window.localStorage.getItem('tu:mock-state')?.includes('"pageNumber":2')
  ) ?? false)
  await page.reload()
  const reloadedBlock = page.locator('.pdf-excerpt-block-nv')
  await reloadedBlock.getByRole('button', { name: '显示书签与目录' }).click()
  const persisted = reloadedBlock.getByRole('treeitem', { name: /进程调度，第 2 页/ })
  await expect(persisted).toBeVisible({ timeout: 15_000 })

  await persisted.click({ button: 'right' })
  await page.getByRole('menu').getByRole('menuitem', { name: '删除' }).click()
  const confirm = page.getByRole('dialog', { name: '删除书签' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '删除' }).click()
  await expect(reloadedBlock.getByRole('treeitem', { name: /进程调度，第 2 页/ })).toHaveCount(0)
})

test('persists bookmark order after dragging', async ({ page }) => {
  test.setTimeout(60_000)
  const block = await openPdf(page, {
    ...BOOKMARK_BLOCK,
    attrs: {
      ...BOOKMARK_BLOCK.attrs,
      bookmarks: [
        { id: 'bookmark-a', title: '书签 A', pageNumber: 1 },
        { id: 'bookmark-b', title: '书签 B', pageNumber: 2 },
      ],
    },
  })
  await block.getByRole('button', { name: '显示书签与目录' }).click()

  const first = block.getByRole('treeitem', { name: /书签 A，第 1 页/ })
  const second = block.getByRole('treeitem', { name: /书签 B，第 2 页/ })
  await expect(first).toBeVisible({ timeout: 15_000 })
  await page.evaluate(({ sourceId, targetId }) => {
    const source = document.querySelector<HTMLElement>(
      `.tree-list-node__row[data-tree-node-id="${sourceId}"]`,
    )
    const target = document.querySelector<HTMLElement>(
      `.tree-list-node__row[data-tree-node-id="${targetId}"]`,
    )
    if (!source || !target) throw new Error('bookmark rows not found')
    const dataTransfer = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }))
    const targetRect = target.getBoundingClientRect()
    target.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX: targetRect.left + 20,
      clientY: targetRect.top + 1,
    }))
    target.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX: targetRect.left + 20,
      clientY: targetRect.top + 1,
    }))
    source.dispatchEvent(new DragEvent('dragend', {
      bubbles: true,
      dataTransfer,
    }))
  }, { sourceId: 'bookmark-b', targetId: 'bookmark-a' })

  await page.waitForFunction(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}') as {
      contents?: Record<string, {
        document?: {
          content?: Array<{ attrs?: { bookmarks?: Array<{ title: string }> } }>
        }
      }>
    }
    const bookmarks = state.contents?.['p-pdf-bookmark']?.document?.content?.[0]?.attrs?.bookmarks
    return bookmarks?.[0]?.title === '书签 B' && bookmarks[1]?.title === '书签 A'
  })

  await page.reload()
  const reloaded = page.locator('.pdf-excerpt-block-nv')
  await reloaded.getByRole('button', { name: '显示书签与目录' }).click()
  const customRows = reloaded.locator('.pdf-excerpt-sidebar-tree .tree-list-node__row[draggable="true"]')
  await expect(customRows.nth(0)).toContainText('书签 B', { timeout: 15_000 })
  await expect(customRows.nth(1)).toContainText('书签 A')
})

test('moves a bookmark into another bookmark and persists the hierarchy', async ({ page }) => {
  test.setTimeout(60_000)
  const block = await openPdf(page, {
    ...BOOKMARK_BLOCK,
    attrs: {
      ...BOOKMARK_BLOCK.attrs,
      bookmarks: [
        { id: 'bookmark-parent', title: '书签父项', pageNumber: 1 },
        { id: 'bookmark-child', title: '书签子项', pageNumber: 2 },
      ],
    },
  })
  await block.getByRole('button', { name: '显示书签与目录' }).click()

  const parent = block.getByRole('treeitem', { name: /书签父项，第 1 页/ })
  const child = block.getByRole('treeitem', { name: /书签子项，第 2 页/ })
  await expect(child).toBeVisible({ timeout: 15_000 })

  await page.evaluate(({ sourceId, targetId }) => {
    const source = document.querySelector<HTMLElement>(
      `.tree-list-node__row[data-tree-node-id="${sourceId}"]`,
    )
    const target = document.querySelector<HTMLElement>(
      `.tree-list-node__row[data-tree-node-id="${targetId}"]`,
    )
    if (!source || !target) throw new Error('bookmark rows not found')
    const dataTransfer = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }))
    const targetRect = target.getBoundingClientRect()
    target.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX: targetRect.left + 20,
      clientY: targetRect.top + targetRect.height / 2,
    }))
    target.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX: targetRect.left + 20,
      clientY: targetRect.top + targetRect.height / 2,
    }))
    source.dispatchEvent(new DragEvent('dragend', {
      bubbles: true,
      dataTransfer,
    }))
  }, { sourceId: 'bookmark-child', targetId: 'bookmark-parent' })

  await expect(parent.locator('[role="treeitem"]').filter({ hasText: '书签子项' }))
    .toBeVisible()
  await page.waitForFunction(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}') as {
      contents?: Record<string, {
        document?: {
          content?: Array<{
            attrs?: { bookmarks?: Array<{ id: string; parentId?: string }> }
          }>
        }
      }>
    }
    const bookmarks = state.contents?.['p-pdf-bookmark']?.document?.content?.[0]?.attrs?.bookmarks
    return bookmarks?.find((bookmark) => bookmark.id === 'bookmark-child')?.parentId
      === 'bookmark-parent'
  })

  await page.reload()
  const reloaded = page.locator('.pdf-excerpt-block-nv')
  await reloaded.getByRole('button', { name: '显示书签与目录' }).click()
  const reloadedParent = reloaded.getByRole('treeitem', { name: /书签父项，第 1 页/ })
  await expect(reloadedParent.locator('[role="treeitem"]').filter({ hasText: '书签子项' }))
    .toBeVisible({ timeout: 15_000 })
})

test('keeps scroll position stable while lazy pages settle to real heights', async ({ page }) => {
  test.setTimeout(60_000)
  const pageCount = 28
  const block = await openPdf(page, {
    ...BOOKMARK_BLOCK,
    attrs: {
      ...BOOKMARK_BLOCK.attrs,
      endPage: pageCount,
    },
  }, multiPagePdfBase64(pageCount))
  const pages = block.locator('.pdf-excerpt-block__pages')

  await block.locator('.pdf-excerpt-block__main').click()
  await expect.poll(() => pages.evaluate((element) => (
    element.scrollHeight > element.clientHeight * 10
  ))).toBe(true)
  await pages.evaluate((element) => {
    element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) * 0.72)
    element.dispatchEvent(new Event('scroll'))
  })

  await expect.poll(() => pages.evaluate((element) => {
    const rendered = element.querySelectorAll('canvas').length
    return rendered > 0
  })).toBe(true)
  const initialScrollTop = await pages.evaluate((element) => element.scrollTop)
  expect(initialScrollTop).toBeGreaterThan(0)

  const samples = await pages.evaluate(async (element) => {
    const result: number[] = []
    for (let index = 0; index < 30; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      result.push(element.scrollTop)
    }
    return result
  })
  const endScrollTop = samples.at(-1)
  expect(endScrollTop).toBeDefined()
  expect(Math.abs((endScrollTop ?? 0) - initialScrollTop)).toBeLessThan(32)
  expect(Math.min(...samples)).toBeGreaterThan(initialScrollTop - 32)
  await expect(block.locator('.pdf-excerpt-block__page-canvas-host canvas').first())
    .toBeVisible()
})

test('shows the current page and jumps within the PDF view', async ({ page }) => {
  test.setTimeout(60_000)
  const pageCount = 28
  const block = await openPdf(page, {
    ...BOOKMARK_BLOCK,
    attrs: {
      ...BOOKMARK_BLOCK.attrs,
      endPage: pageCount,
    },
  }, multiPagePdfBase64(pageCount))
  const pages = block.locator('.pdf-excerpt-block__pages')
  const navigation = block.getByRole('navigation', { name: 'PDF 页码导航' })
  const current = navigation.locator('.pdf-excerpt-block__page-navigation-current')
  const input = navigation.getByRole('textbox', { name: /跳转到 PDF 页码/ })
  const titleBar = block.locator('.tu-block-chrome-header')
  const titleInput = titleBar.getByRole('textbox', { name: 'PDF 标题' })
  const meta = titleBar.locator('.pdf-excerpt-block__meta')
  const toolbar = titleBar.locator('.tu-block-chrome-header__trailing')

  await expect(navigation).toBeVisible()
  await expect(current).toHaveText('1')
  await expect(navigation).toContainText('/ 28')
  await expect(navigation.getByRole('button', { name: '上一页' })).toBeDisabled()
  await expect(meta).toHaveText('bookmarks.pdf · 全文')
  await expect(block.locator('.resizable-block-wrapper__header-meta')).toHaveCount(0)
  await expect(block.locator('.tu-block-chrome-header')).toHaveCount(1)
  await expect(titleBar.locator('.tu-block-chrome-header__center').getByRole('navigation', { name: 'PDF 页码导航' })).toHaveCount(1)
  await expect(toolbar.getByRole('button', { name: '添加书签' })).toHaveCount(1)
  const titleBox = await titleInput.boundingBox()
  const metaBox = await meta.boundingBox()
  const pagesBox = await pages.boundingBox()
  expect(titleBox).not.toBeNull()
  expect(metaBox).not.toBeNull()
  expect(titleBox?.y ?? 0).toBeLessThan((metaBox?.y ?? 0) + (metaBox?.height ?? 0))
  expect((titleBox?.y ?? 0) + (titleBox?.height ?? 0)).toBeGreaterThan(metaBox?.y ?? 0)
  expect(metaBox?.x ?? 0).toBeGreaterThan((titleBox?.x ?? 0) + (titleBox?.width ?? 0) - 2)
  const navigationRowBox = await navigation.boundingBox()
  expect((navigationRowBox?.y ?? 0) + (navigationRowBox?.height ?? 0))
    .toBeLessThanOrEqual((pagesBox?.y ?? 0) + 1)
  const navigationBox = await navigation.boundingBox()
  const wrapperBox = await block.locator('.resizable-block-wrapper').boundingBox()
  expect(navigationBox).not.toBeNull()
  expect(pagesBox).not.toBeNull()
  expect(wrapperBox).not.toBeNull()
  expect((navigationBox?.y ?? 0) + (navigationBox?.height ?? 0))
    .toBeLessThanOrEqual((pagesBox?.y ?? 0) + 1)
  const navigationCenter = (navigationBox?.x ?? 0) + (navigationBox?.width ?? 0) / 2
  const toolbarCenter = (wrapperBox?.x ?? 0) + (wrapperBox?.width ?? 0) / 2
  expect(Math.abs(navigationCenter - toolbarCenter)).toBeLessThan(50)

  await block.locator('.pdf-excerpt-block__main').click()
  await expect.poll(() => pages.evaluate((element) => element.scrollHeight > element.clientHeight * 10))
    .toBe(true)
  await input.fill('17')
  await input.press('Enter')
  await expect(current).toHaveText('17')
  await expect.poll(() => pages.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  await pages.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await expect(current).toHaveText('28')

  await navigation.getByRole('button', { name: '上一页' }).click()
  await expect(current).toHaveText('27')
  await navigation.getByRole('button', { name: '下一页' }).click()
  await expect(current).toHaveText('28')
  await expect(navigation.getByRole('button', { name: '下一页' })).toBeDisabled()
})

test('scrolls the PDF pages with the mouse wheel after clicking the PDF', async ({ page }) => {
  test.setTimeout(60_000)
  const pageCount = 12
  const block = await openPdf(page, {
    ...BOOKMARK_BLOCK,
    attrs: {
      ...BOOKMARK_BLOCK.attrs,
      endPage: pageCount,
    },
  }, multiPagePdfBase64(pageCount))
  const pages = block.locator('.pdf-excerpt-block__pages')

  const initialMetrics = await pages.evaluate((element) => ({
    clientWidth: element.clientWidth,
    offsetWidth: element.offsetWidth,
    overflowY: getComputedStyle(element).overflowY,
  }))
  expect(initialMetrics.overflowY).toBe('scroll')
  await block.locator('.pdf-excerpt-block__main').click()
  await expect(block.locator('.pdf-excerpt-block--wheel-active')).toHaveCount(1)
  await expect(block.locator('.pdf-excerpt-block__pages--wheel-active')).toHaveCount(1)
  const activeMetrics = await pages.evaluate((element) => ({
    clientWidth: element.clientWidth,
    offsetWidth: element.offsetWidth,
    overflowY: getComputedStyle(element).overflowY,
  }))
  expect(activeMetrics).toEqual(initialMetrics)
  await expect.poll(() => pages.evaluate((element) => (
    element.scrollHeight > element.clientHeight
  ))).toBe(true)
  await pages.hover()
  await page.mouse.wheel(0, 600)
  await expect.poll(() => pages.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
})

test('limits page jumps to the excerpt range and explains invalid input', async ({ page }) => {
  test.setTimeout(60_000)
  const block = await openPdf(page, {
    ...BOOKMARK_BLOCK,
    attrs: {
      ...BOOKMARK_BLOCK.attrs,
      viewMode: 'excerpt',
      startPage: 2,
      endPage: 4,
    },
  }, multiPagePdfBase64(8))
  const navigation = block.getByRole('navigation', { name: 'PDF 页码导航' })
  const input = navigation.getByRole('textbox', { name: /跳转到 PDF 页码/ })

  await expect(navigation.locator('.pdf-excerpt-block__page-navigation-current')).toHaveText('2')
  await expect(navigation).toContainText('/ 8')
  await input.fill('1')
  await input.press('Enter')
  await expect(navigation.getByRole('alert')).toHaveText('仅可跳转到第 2–4 页')
  await expect(navigation.locator('.pdf-excerpt-block__page-navigation-current')).toHaveText('2')
  await expect(input).toHaveAttribute('aria-invalid', 'true')

  await input.fill('3.5')
  await expect(input).toHaveValue('3.5')
  await navigation.getByRole('button', { name: '跳转' }).click()
  await expect(navigation.getByRole('alert')).toHaveText('请输入第 2–4 页范围内的整数')

  await input.fill('4')
  await input.press('Enter')
  await expect(navigation.locator('.pdf-excerpt-block__page-navigation-current')).toHaveText('4')
  await expect(navigation.getByRole('alert')).toHaveCount(0)
  await expect(navigation.getByRole('button', { name: '下一页' })).toBeDisabled()
})

test('renders the active page promptly after a fast scroll', async ({ page }) => {
  test.setTimeout(60_000)
  const pageCount = 80
  const block = await openPdf(page, {
    ...BOOKMARK_BLOCK,
    attrs: {
      ...BOOKMARK_BLOCK.attrs,
      endPage: pageCount,
    },
  }, multiPagePdfBase64(pageCount))
  const pages = block.locator('.pdf-excerpt-block__pages')

  await block.locator('.pdf-excerpt-block__main').click()
  await expect.poll(() => pages.evaluate((element) => (
    element.scrollHeight > element.clientHeight * 10
  ))).toBe(true)
  await expect.poll(() => pages.locator('canvas').count(), { timeout: 8_000 })
    .toBeGreaterThan(0)

  await pages.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
    element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) * 0.82)
    element.dispatchEvent(new Event('scroll'))
  })

  const activePage = pages.locator('[aria-current="page"]')
  await expect(activePage.locator('canvas')).toHaveCount(1, { timeout: 8_000 })
  await expect(activePage.locator('canvas')).toHaveCount(1)
})

test('restores last reading position per PDF block and ignores expired entries', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const pageCount = 8
  const block = await openPdf(page, {
    ...BOOKMARK_BLOCK,
    attrs: {
      ...BOOKMARK_BLOCK.attrs,
      endPage: pageCount,
    },
  }, multiPagePdfBase64(pageCount))
  const pages = block.locator('.pdf-excerpt-block__pages')
  const current = block.getByRole('navigation', { name: 'PDF 页码导航' })
    .locator('.pdf-excerpt-block__page-navigation-current')

  await block.locator('.pdf-excerpt-block__main').click()
  await expect.poll(() => pages.evaluate((element) => (
    element.scrollHeight > element.clientHeight * 4
  ))).toBe(true)
  await pages.evaluate((element) => {
    element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) * 0.6)
    element.dispatchEvent(new Event('scroll'))
  })
  await expect(current).not.toHaveText('1')
  await page.waitForTimeout(300)
  await expect.poll(() => page.evaluate(() => {
    const raw = window.localStorage.getItem('tu:pdf-reading-positions')
    return raw ? JSON.parse(raw)['pdf-bookmark-block'] : null
  })).toBeTruthy()
  const saved = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tu:pdf-reading-positions')
    return raw ? JSON.parse(raw)['pdf-bookmark-block'] : null
  }) as { pageNumber: number; pageOffset: number; updatedAt: number; fileId: string }
  expect(saved.pageNumber).toBeGreaterThan(1)
  expect(saved.fileId).toBe('pdf-bookmark-file')
  expect(saved.updatedAt).toBeGreaterThan(0)

  await page.reload()
  const reloaded = page.locator('.pdf-excerpt-block-nv')
  await expect(reloaded.getByRole('navigation', { name: 'PDF 页码导航' })
    .locator('.pdf-excerpt-block__page-navigation-current'))
    .toHaveText(String(saved.pageNumber), { timeout: 15_000 })

  await page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem('tu:mock-state') || '{}')
    state.contents['p-pdf-bookmark'].document.content[0].attrs.blockId = 'pdf-bookmark-other-block'
    window.localStorage.setItem('tu:mock-state', JSON.stringify(state))
  })
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('tu:pdf-reading-positions')
    const all = raw ? JSON.parse(raw) : {}
    all['pdf-bookmark-other-block'] = {
      ...all['pdf-bookmark-block'],
      updatedAt: 1,
    }
    window.localStorage.setItem('tu:pdf-reading-positions', JSON.stringify(all))
  })
  await page.reload()
  const other = page.locator('.pdf-excerpt-block-nv').getByRole('navigation', {
    name: 'PDF 页码导航',
  }).locator('.pdf-excerpt-block__page-navigation-current')
  await expect(other)
    .toHaveText('1', { timeout: 15_000 })
})
