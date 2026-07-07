import { isMockDataSource } from '@/dev/dataSource'
import { request } from './http'

export const DEFAULT_AI_AGENT_CONNECT_TIMEOUT_SECONDS = 30
export const DEFAULT_AI_AGENT_READ_TIMEOUT_SECONDS = 300
export const DEFAULT_AI_AGENT_REQUEST_TIMEOUT_SECONDS = 300

export interface AiAgentSettings {
  enabled: boolean
  baseUrl: string
  model: string
  apiKeyConfigured: boolean
  connectTimeoutSeconds: number
  readTimeoutSeconds: number
  requestTimeoutSeconds: number
}

export interface UpdateAiAgentSettingsPayload {
  enabled: boolean
  baseUrl: string
  model: string
  apiKey?: string
  connectTimeoutSeconds: number
  readTimeoutSeconds: number
  requestTimeoutSeconds: number
}

export interface AiAgentConnectionTestResult {
  ok: boolean
  message: string
}

const STORAGE_KEY = 'tu:mock-ai-settings'

const defaultSettings = (): AiAgentSettings => ({
  enabled: false,
  baseUrl: '',
  model: '',
  apiKeyConfigured: false,
  connectTimeoutSeconds: DEFAULT_AI_AGENT_CONNECT_TIMEOUT_SECONDS,
  readTimeoutSeconds: DEFAULT_AI_AGENT_READ_TIMEOUT_SECONDS,
  requestTimeoutSeconds: DEFAULT_AI_AGENT_REQUEST_TIMEOUT_SECONDS,
})

const readMockSettings = (): AiAgentSettings => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaultSettings(), ...JSON.parse(raw) } : defaultSettings()
  } catch {
    return defaultSettings()
  }
}

const writeMockSettings = (settings: AiAgentSettings) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getAiAgentSettings(): Promise<AiAgentSettings> {
  if (isMockDataSource()) {
    return Promise.resolve(readMockSettings())
  }
  return request<AiAgentSettings>('/api/ai/settings')
}

export function updateAiAgentSettings(payload: UpdateAiAgentSettingsPayload): Promise<AiAgentSettings> {
  if (isMockDataSource()) {
    const previous = readMockSettings()
    const next: AiAgentSettings = {
      enabled: payload.enabled,
      baseUrl: payload.baseUrl,
      model: payload.model,
      apiKeyConfigured: Boolean(payload.apiKey?.trim()) || previous.apiKeyConfigured,
      connectTimeoutSeconds: payload.connectTimeoutSeconds,
      readTimeoutSeconds: payload.readTimeoutSeconds,
      requestTimeoutSeconds: payload.requestTimeoutSeconds,
    }
    writeMockSettings(next)
    return Promise.resolve(next)
  }
  return request<AiAgentSettings>('/api/ai/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteAiAgentApiKey(): Promise<AiAgentSettings> {
  if (isMockDataSource()) {
    const next = { ...readMockSettings(), apiKeyConfigured: false }
    writeMockSettings(next)
    return Promise.resolve(next)
  }
  return request<AiAgentSettings>('/api/ai/settings/api-key', { method: 'DELETE' })
}

export function testAiAgentConnection(): Promise<AiAgentConnectionTestResult> {
  if (isMockDataSource()) {
    const settings = readMockSettings()
    return Promise.resolve({
      ok: settings.enabled && settings.apiKeyConfigured && Boolean(settings.baseUrl && settings.model),
      message: settings.enabled && settings.apiKeyConfigured && settings.baseUrl && settings.model
        ? '连接成功'
        : 'AI Agent 配置不完整',
    })
  }
  return request<AiAgentConnectionTestResult>('/api/ai/settings/test', { method: 'POST' })
}
