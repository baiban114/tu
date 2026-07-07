import { ensurePdfJsConfigured, pdfjsLib, type PdfDocumentProxy } from './pdfjsSetup'

interface CacheEntry {
  promise: Promise<PdfDocumentProxy>
  refs: number
}

const cache = new Map<string, CacheEntry>()

export async function acquirePdfDocument(url: string): Promise<PdfDocumentProxy> {
  ensurePdfJsConfigured()
  let entry = cache.get(url)
  if (!entry) {
    const loadingTask = pdfjsLib.getDocument({
      url,
      rangeChunkSize: 65536,
      disableAutoFetch: false,
      disableStream: false,
    })
    entry = {
      promise: loadingTask.promise,
      refs: 0,
    }
    cache.set(url, entry)
  }
  entry.refs += 1
  return entry.promise
}

export function releasePdfDocument(url: string): void {
  const entry = cache.get(url)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs > 0) return
  cache.delete(url)
  void entry.promise.then((doc) => doc.cleanup()).catch(() => {})
}

export async function loadPdfPageCount(url: string): Promise<number> {
  const doc = await acquirePdfDocument(url)
  try {
    return doc.numPages
  } finally {
    releasePdfDocument(url)
  }
}
