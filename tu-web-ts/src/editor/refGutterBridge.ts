import type { InjectionKey, Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'

export interface RefGutterHostContext {
  hostBlockId: string
  refId: string
  refType: 'block' | 'page'
  contentParentLevel: number
}

export interface RefGutterDelegate {
  onLineAnnotate: (host: RefGutterHostContext, innerBlockId: string, innerEditor: Editor) => void
  onMarkExcerpt: (host: RefGutterHostContext, innerBlockId: string, innerEditor: Editor) => void
  onSetBasis: (host: RefGutterHostContext, innerBlockId: string, innerEditor: Editor) => void
  onCreateKnowledgeRelation: (host: RefGutterHostContext, innerBlockId: string, innerEditor: Editor) => void
}

export const REF_GUTTER_HOST_KEY: InjectionKey<Ref<RefGutterHostContext | null>> = Symbol('refGutterHost')
export const REF_GUTTER_DELEGATE_KEY: InjectionKey<RefGutterDelegate | null> = Symbol('refGutterDelegate')
