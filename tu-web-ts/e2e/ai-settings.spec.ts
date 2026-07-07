import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tu:data-source', 'mock')
    window.localStorage.removeItem('tu:mock-ai-run-logs')
    if (!window.sessionStorage.getItem('tu:ai-settings-e2e-init')) {
      window.localStorage.removeItem('tu:mock-ai-settings')
      window.sessionStorage.setItem('tu:ai-settings-e2e-init', '1')
    }
  })
})

test('settings page scrolls in a small viewport', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 360 })
  await page.goto('/settings')

  const scrollState = await page.locator('.settings-page').evaluate((element) => ({
    overflowY: window.getComputedStyle(element).overflowY,
    canScroll: element.scrollHeight > element.clientHeight,
  }))

  expect(scrollState).toEqual({ overflowY: 'auto', canScroll: true })
})

test('saves AI agent settings without revealing the API key', async ({ page }) => {
  await page.goto('/settings')

  await page.getByLabel('启用 AI Agent').check()
  await page.getByLabel('Base URL').fill('https://api.example.com/v1')
  await page.getByLabel('Model').fill('gpt-test')
  await page.getByLabel('API Key').fill('sk-secret')
  await page.getByRole('button', { name: '保存配置' }).click()

  await expect(page.getByText('Key 已配置')).toBeVisible()
  await expect(page.getByLabel('API Key')).toHaveValue('••••••••••••••••')

  await page.reload()
  await page.goto('/settings')
  await expect(page.getByLabel('Base URL')).toHaveValue('https://api.example.com/v1')
  await expect(page.getByLabel('Model')).toHaveValue('gpt-test')
  await expect(page.getByLabel('API Key')).toHaveValue('••••••••••••••••')
  await expect(page.getByText('Key 已配置')).toBeVisible()
})

test('retains and deletes the configured AI agent key', async ({ page }) => {
  await page.goto('/settings')

  await page.getByLabel('启用 AI Agent').check()
  await page.getByLabel('Base URL').fill('https://api.example.com/v1')
  await page.getByLabel('Model').fill('gpt-test')
  await page.getByLabel('API Key').fill('sk-secret')
  await page.getByRole('button', { name: '保存配置' }).click()

  await page.getByLabel('Base URL').fill('https://api2.example.com/v1')
  await page.getByRole('button', { name: '保存配置' }).click()
  await expect(page.getByText('Key 已配置')).toBeVisible()
  await expect(page.getByLabel('Base URL')).toHaveValue('https://api2.example.com/v1')

  await page.getByRole('button', { name: '删除 Key' }).click()
  await expect(page.getByText('Key 未配置')).toBeVisible()
  await expect(page.getByLabel('API Key')).toHaveValue('')
})

test('persists http timeout settings', async ({ page }) => {
  await page.goto('/settings')

  await page.getByLabel('启用 AI Agent').check()
  await page.getByLabel('Base URL').fill('https://api.example.com/v1')
  await page.getByLabel('Model').fill('gpt-test')
  await page.getByLabel('API Key').fill('sk-secret')
  await page.getByLabel('读超时').fill('600')
  await page.getByRole('button', { name: '保存配置' }).click()

  await page.reload()
  await page.goto('/settings')
  await expect(page.getByLabel('读超时')).toHaveValue('600')
})

test('connection test does not create an agent run log', async ({ page }) => {
  await page.goto('/settings')

  await page.getByLabel('启用 AI Agent').check()
  await page.getByLabel('Base URL').fill('https://api.example.com/v1')
  await page.getByLabel('Model').fill('gpt-test')
  await page.getByLabel('API Key').fill('sk-secret')
  await page.getByRole('button', { name: '保存配置' }).click()
  await page.getByRole('button', { name: '测试连接' }).click()

  await expect(page.getByText('连接成功')).toBeVisible()
  await expect(page.getByText('暂无 Agent 记录')).toBeVisible()
})
