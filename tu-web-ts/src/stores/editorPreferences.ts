import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_SELECTION_TOOLBAR_ENABLED,
  getEditorPreferences,
  updateEditorPreferences,
} from '@/api/editorPreferences'

/**
 * Editor preferences shared across components: read by the editor page (to
 * gate the selection toolbar) and written by the system settings page.
 * Persisted server-side via `/api/editor-preferences` (mock falls back to
 * localStorage inside the API module).
 */
export const useEditorPreferencesStore = defineStore('editorPreferences', () => {
  const selectionToolbarEnabled = ref<boolean>(DEFAULT_SELECTION_TOOLBAR_ENABLED)
  const loaded = ref(false)
  const loading = ref(false)

  /** Loads preferences from the backend. Idempotent unless `force` is set. */
  async function load(force = false) {
    if (loaded.value && !force) return
    loading.value = true
    try {
      const prefs = await getEditorPreferences()
      selectionToolbarEnabled.value = prefs.selectionToolbarEnabled
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /**
   * Updates the selection-toolbar toggle. Persists to the backend; on failure
   * the local state is rolled back so the switch reflects the truth.
   */
  async function setSelectionToolbarEnabled(value: boolean) {
    const previous = selectionToolbarEnabled.value
    selectionToolbarEnabled.value = value
    try {
      const prefs = await updateEditorPreferences({ selectionToolbarEnabled: value })
      selectionToolbarEnabled.value = prefs.selectionToolbarEnabled
      loaded.value = true
    } catch (err) {
      selectionToolbarEnabled.value = previous
      throw err
    }
  }

  return {
    selectionToolbarEnabled,
    loaded,
    loading,
    load,
    setSelectionToolbarEnabled,
  }
})
