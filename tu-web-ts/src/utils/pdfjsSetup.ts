import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let configured = false

export function ensurePdfJsConfigured(): void {
  if (configured) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
  configured = true
}

export { pdfjsLib }

export type PdfDocumentProxy = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>
