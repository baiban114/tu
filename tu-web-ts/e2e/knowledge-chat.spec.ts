import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
  })
  await page.goto('/')
})

test('asks the local knowledge base and opens a cited source', async ({ page }) => {
  await page.getByRole('link', { name: '知识库问答' }).click()
  await expect(page).toHaveURL(/\/knowledge-chat$/)
  await expect(page.getByText('用户：本地开发用户')).toBeVisible()
  await expect(page.locator('#knowledge-base-select')).toHaveValue('')

  const input = page.getByRole('textbox', { name: '知识库问题' })
  await input.fill('API 文档中介绍了什么？')
  await page.getByRole('button', { name: '发送问题' }).click()

  const reasoningPanel = page.locator('.reasoning-panel').first()
  await expect(reasoningPanel).toHaveJSProperty('open', true)
  const partialReasoning = await reasoningPanel.locator('pre').textContent()
  expect(partialReasoning?.length).toBeGreaterThan(0)
  expect(partialReasoning?.length).toBeLessThan(50)

  await expect(page.getByText('本地测试模式不会调用大模型')).toBeVisible()
  await expect(page.getByText('使用知识库：技术文档')).toBeVisible()
  await expect(page.getByRole('button', { name: /API 文档中介绍了什么/ })).toBeVisible()

  await page.goto('/knowledge-chat')
  await page.getByRole('button', { name: /API 文档中介绍了什么/ }).click()
  await expect(page.getByText('本地测试模式不会调用大模型')).toBeVisible()
  await expect(reasoningPanel).toHaveJSProperty('open', false)
  await reasoningPanel.locator('summary').click()
  await expect(reasoningPanel.locator('pre')).toBeVisible()
  const reasoningStyle = await reasoningPanel.locator('pre').evaluate((element) => {
    const style = window.getComputedStyle(element)
    return { maxHeight: style.maxHeight, overflowY: style.overflowY }
  })
  expect(reasoningStyle).toEqual({ maxHeight: '320px', overflowY: 'auto' })
  const firstSource = page.locator('.source-card').first()
  await expect(firstSource).toBeVisible()
  await firstSource.click()
  await expect(page).toHaveURL(/\/?\?pageId=/)
})

test('starts a new conversation without deleting saved history', async ({ page }) => {
  await page.goto('/knowledge-chat')
  const input = page.getByRole('textbox', { name: '知识库问题' })
  await input.fill('总结当前内容')
  await input.press('Enter')
  await expect(page.getByText('本地测试模式不会调用大模型')).toBeVisible()

  await page.getByRole('button', { name: '新对话' }).click()
  await expect(page.getByText('从你的知识内容中寻找答案')).toBeVisible()
  await expect(page.getByRole('button', { name: /总结当前内容/ })).toBeVisible()
})

test('uses deep mode and shows observable retrieval progress', async ({ page }) => {
  await page.goto('/knowledge-chat')
  await page.getByRole('button', { name: '深度问答' }).click()
  await expect(page.getByRole('button', { name: '深度问答' })).toHaveAttribute('aria-pressed', 'true')

  const input = page.getByRole('textbox', { name: '知识库问题' })
  await input.fill('比较当前资料中的两种方案')
  await page.getByRole('button', { name: '发送问题' }).click()

  const trace = page.locator('.execution-trace').first()
  await expect(trace).toBeVisible()
  await expect(trace.getByText('正在调用模型（第 1 轮）')).toBeVisible()
  await expect(trace.getByText('检索当前知识库完成')).toBeVisible()
  await expect(page.getByText('本地测试模式不会调用大模型')).toBeVisible()
  const reasoningPanel = page.locator('.reasoning-panel').first()
  await expect(reasoningPanel).toBeVisible()
  await expect(reasoningPanel.locator('pre')).toContainText('本地测试模式推理轨迹')
  const traceStyle = await trace.evaluate((element) => {
    const style = window.getComputedStyle(element)
    return { height: style.height, overflow: style.overflow }
  })
  expect(traceStyle).toEqual({ height: '132px', overflow: 'hidden' })
})

test('loads conversations after the first twenty when the sidebar scrolls', async ({ page }) => {
  const sessions = Array.from({ length: 21 }, (_, index) => {
    const number = index + 1
    const timestamp = new Date(Date.UTC(2026, 7, 28, 12, 0, 0) - index * 60_000).toISOString()
    return {
      id: `chat-${number}`,
      title: `历史会话 ${String(number).padStart(2, '0')}`,
      selectedKbId: 'kb-demo-1',
      selectedKbName: '个人笔记',
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [],
    }
  })
  await page.evaluate((value) => {
    localStorage.setItem('tu:knowledge-chat:sessions:dev-local-user', JSON.stringify(value))
  }, sessions)
  await page.goto('/knowledge-chat')

  await expect(page.getByRole('button', { name: /历史会话 20/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /历史会话 21/ })).toHaveCount(0)
  await page.locator('.conversation-list').evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await expect(page.getByRole('button', { name: /历史会话 21/ })).toBeVisible()
})
