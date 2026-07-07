import type { InjectionKey } from 'vue'

export interface EditorSectionHandleBridge {
  onSectionGutterHover: (entryId: string) => void
  onSectionGutterLeave: (event?: MouseEvent) => void
}

export const EDITOR_SECTION_HANDLE_KEY: InjectionKey<EditorSectionHandleBridge> = Symbol('editorSectionHandle')
