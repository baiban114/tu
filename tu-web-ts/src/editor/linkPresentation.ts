import { isHttpHref } from '@/editor/linkLabelSuggestQuery'
import type { UrlDisplayMode } from '@/utils/urlDisplay'

function isResourceLocatorHref(href: string | null | undefined): boolean {
  return Boolean(href && href.trim().startsWith('resource:'))
}

/** True when a presentation href can be restored to an inline link. */
export function canRestoreInlineLinkFromHref(href: string | null | undefined): boolean {
  const value = String(href || '').trim()
  if (!value || value.startsWith('file:')) return false
  return isResourceLocatorHref(value) || isHttpHref(value) || value.startsWith('page:')
}

/** Modes available for a link presentation context (inline / iframe / pdf embed). */
export function availableLinkPresentationModes(
  href: string,
  currentMode: UrlDisplayMode,
): UrlDisplayMode[] {
  const modes: UrlDisplayMode[] = ['link']
  if (isHttpHref(href)) {
    modes.push('iframe', 'title')
  }
  // PDF presentation is for resource: locators, or when already rendered as pdfExcerpt.
  if (isResourceLocatorHref(href) || currentMode === 'pdf') {
    modes.push('pdf')
  }
  return modes
}

export function linkPresentationModeLabel(mode: UrlDisplayMode): string {
  switch (mode) {
    case 'link':
      return '链接'
    case 'iframe':
      return 'iframe'
    case 'title':
      return '标题'
    case 'pdf':
      return 'PDF'
    default:
      return mode
  }
}

/** Modes that should be disabled in the shared presentation bar. */
export function disabledLinkPresentationModes(
  href: string,
  currentMode: UrlDisplayMode,
): UrlDisplayMode[] {
  const disabled: UrlDisplayMode[] = []
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(href)) {
    disabled.push('iframe')
  }
  // Only disable「链接」when there is no recoverable locator (legacy PDF without sourceHref).
  if (currentMode === 'pdf' && !canRestoreInlineLinkFromHref(href)) {
    disabled.push('link', 'iframe', 'title')
  }
  return disabled
}
