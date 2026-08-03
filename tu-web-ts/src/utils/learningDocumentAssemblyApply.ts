import type { AssemblyInsert, LearningDocumentAssemblyPlan } from '@/api/aiLearningDocument'
import { createPage, savePageContent } from '@/api/page'
import type { PageItem } from '@/api/page'
import { toV2PageContent } from '@/editor/pageDocument'
import { assemblyInsertsToDocument } from '@/utils/learningDocumentAssembly'

export async function createLearningDocumentPageFromPlan(options: {
  kbId: string
  plan: LearningDocumentAssemblyPlan
  selectedInserts: AssemblyInsert[]
  refreshPageTree: () => Promise<void>
  selectPage: (pageId: string) => Promise<void>
}): Promise<PageItem> {
  const title = options.plan.topic.trim() || '学习文档'
  const page = await createPage(options.kbId, null, title, 'document')
  const document = assemblyInsertsToDocument(options.selectedInserts)
  await savePageContent(page.id, toV2PageContent(document, [], {}))
  await options.refreshPageTree()
  await options.selectPage(page.id)
  return page
}
