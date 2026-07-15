import { inject, ref, unref, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import {
  REF_GUTTER_DELEGATE_KEY,
  REF_GUTTER_HOST_KEY,
  type RefGutterDelegate,
  type RefGutterHostContext,
} from '@/editor/refGutterBridge'

type ExposedTuEditor = {
  editor?: Ref<Editor | undefined>
}

export type { ExposedTuEditor }

export function useRefGutterForwarding() {
  const refGutterHost = inject<Ref<RefGutterHostContext | null> | null>(REF_GUTTER_HOST_KEY, null)
  const refGutterDelegate = inject<RefGutterDelegate | null>(REF_GUTTER_DELEGATE_KEY, null)
  const nestedEditorRef = ref<ExposedTuEditor | null>(null)

  const resolveHost = (): RefGutterHostContext | null => {
    if (!refGutterHost) return null
    return unref(refGutterHost)
  }

  const resolveInnerEditor = (): Editor | null => {
    const editorRef = nestedEditorRef.value?.editor
    return unref(editorRef) ?? null
  }

  const forwardLineAnnotate = (innerBlockId: string) => {
    const host = resolveHost()
    const innerEditor = resolveInnerEditor()
    if (!host || !refGutterDelegate || !innerEditor) return
    refGutterDelegate.onLineAnnotate(host, innerBlockId, innerEditor)
  }

  const forwardMarkExcerpt = (innerBlockId: string) => {
    const host = resolveHost()
    const innerEditor = resolveInnerEditor()
    if (!host || !refGutterDelegate || !innerEditor) return
    refGutterDelegate.onMarkExcerpt(host, innerBlockId, innerEditor)
  }

  const forwardSetBasis = (innerBlockId: string) => {
    const host = resolveHost()
    const innerEditor = resolveInnerEditor()
    if (!host || !refGutterDelegate || !innerEditor) return
    refGutterDelegate.onSetBasis(host, innerBlockId, innerEditor)
  }

  const forwardCreateKnowledgeRelation = (innerBlockId: string) => {
    const host = resolveHost()
    const innerEditor = resolveInnerEditor()
    if (!host || !refGutterDelegate || !innerEditor) return
    refGutterDelegate.onCreateKnowledgeRelation(host, innerBlockId, innerEditor)
  }

  return {
    nestedEditorRef,
    hasRefGutterHost: Boolean(refGutterHost),
    forwardLineAnnotate,
    forwardMarkExcerpt,
    forwardSetBasis,
    forwardCreateKnowledgeRelation,
  }
}
