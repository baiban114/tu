import { isMockDataSource } from '@/dev/dataSource'
import { request } from './http'

/**
 * Default value when the backend has no record yet. {@code true} preserves the
 * historical behaviour (the selection toolbar always showed) until a user
 * explicitly turns it off from the system settings page.
 */
export const DEFAULT_SELECTION_TOOLBAR_ENABLED = true

export interface EditorPreferences {
  selectionToolbarEnabled: boolean
}

export interface UpdateEditorPreferencesPayload {
  selectionToolbarEnabled: boolean
}

const STORAGE_KEY = 'tu:mock-editor-preferences'

const defaultPreferences = (): EditorPreferences => ({
  selectionToolbarEnabled: DEFAULT_SELECTION_TOOLBAR_ENABLED,
})

const readMockPreferences = (): EditorPreferences => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaultPreferences(), ...JSON.parse(raw) } : defaultPreferences()
  } catch {
    return defaultPreferences()
  }
}

const writeMockPreferences = (preferences: EditorPreferences) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
}

export function getEditorPreferences(): Promise<EditorPreferences> {
  if (isMockDataSource()) {
    return Promise.resolve(readMockPreferences())
  }
  return request<EditorPreferences>('/api/editor-preferences')
}

export function updateEditorPreferences(
  payload: UpdateEditorPreferencesPayload,
): Promise<EditorPreferences> {
  if (isMockDataSource()) {
    const next: EditorPreferences = { selectionToolbarEnabled: payload.selectionToolbarEnabled }
    writeMockPreferences(next)
    return Promise.resolve(next)
  }
  return request<EditorPreferences>('/api/editor-preferences', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
