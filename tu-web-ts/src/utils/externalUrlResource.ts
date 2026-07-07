export type ExternalUrlRegistrationMode = 'resource' | 'excerpt';

export interface ParsedExternalUrl {
  /** Normalized full URL (preserves hash when present). */
  href: string;
  /** Page-level URL used as web-link resource identity (origin + path + search, no hash). */
  baseUrl: string;
  /** Fragment without leading `#`, when this URL targets an in-page anchor. */
  anchor: string | null;
  mode: ExternalUrlRegistrationMode;
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

/** Build canonical page URL without hash. */
export function toBasePageUrl(url: URL): string {
  const clone = new URL(url.href);
  clone.hash = '';
  clone.pathname = normalizePathname(clone.pathname);
  return clone.href;
}

/**
 * Classify a pasted/inserted HTTP(S) URL.
 * - Hash fragment (including `:~:text=` highlights) → excerpt under the base page resource.
 * - Otherwise → standalone web-link resource for the whole page.
 */
export function parseExternalUrl(raw: string): ParsedExternalUrl | null {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const anchorRaw = url.hash.length > 1 ? url.hash.slice(1) : null;
  const anchor = anchorRaw ? decodeURIComponent(anchorRaw) : null;
  const baseUrl = toBasePageUrl(url);

  return {
    href: url.href,
    baseUrl,
    anchor,
    mode: anchor ? 'excerpt' : 'resource',
  };
}

export function buildExcerptTitle(anchor: string, label?: string): string {
  const fromLabel = label?.trim();
  if (fromLabel) return fromLabel.slice(0, 255);

  const decoded = anchor.trim();
  if (!decoded) return '页面锚点';

  if (decoded.startsWith(':~:text=')) {
    const snippet = decoded.slice(':~:text='.length).split(',')[0]?.trim();
    if (snippet) return snippet.slice(0, 255);
    return '文本片段';
  }

  return decoded.slice(0, 255);
}

export function formatExcerptLocator(anchor: string): string {
  const trimmed = anchor.trim();
  if (!trimmed) return '#';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}
