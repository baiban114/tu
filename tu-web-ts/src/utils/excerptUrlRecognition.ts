import {
  BOOK_RESOURCE_TYPE_CODE,
  DOCUMENT_RESOURCE_TYPE_CODE,
  WEB_LINK_RESOURCE_TYPE_CODE,
  type ResourceItem,
} from '@/api/externalResource';
import {
  buildExcerptTitle,
  formatExcerptLocator,
  parseExternalUrl,
  toBasePageUrl,
} from '@/utils/externalUrlResource';

export interface ExcerptUrlRecognitionResult {
  ok: boolean;
  message?: string;
  title?: string;
  locator?: string;
  noteAppend?: string;
  /** Page base URL when recognition succeeded for a web-link item. */
  baseUrl?: string;
}

/** Canonical page URL for a web-link resource entity. */
export function getWebLinkItemBaseUrl(
  item: Pick<ResourceItem, 'identityValue' | 'sourceUrl'>,
): string | null {
  const raw = (item.identityValue || item.sourceUrl || '').trim();
  if (!raw) return null;

  const parsed = parseExternalUrl(raw);
  if (parsed) return parsed.baseUrl;

  try {
    return toBasePageUrl(new URL(raw));
  } catch {
    return null;
  }
}

/**
 * Derive excerpt form fields from a pasted HTTP(S) URL for the given resource item.
 * Web-link items require the URL page to match the entity; book items accept any URL with a hash anchor.
 */
export function recognizeExcerptFieldsFromUrl(
  rawUrl: string,
  typeCode: string | undefined,
  item: Pick<ResourceItem, 'identityValue' | 'sourceUrl'>,
): ExcerptUrlRecognitionResult {
  const parsed = parseExternalUrl(rawUrl);
  if (!parsed) {
    return { ok: false, message: '无法识别：请输入有效的 http(s) 链接' };
  }

  if (typeCode === WEB_LINK_RESOURCE_TYPE_CODE) {
    const itemBase = getWebLinkItemBaseUrl(item);
    if (!itemBase) {
      return { ok: false, message: '当前实体缺少页面 URL，无法比对' };
    }
    if (parsed.baseUrl !== itemBase) {
      return {
        ok: false,
        message: `链接页面与当前实体不一致。当前页面：${itemBase}`,
      };
    }
    if (!parsed.anchor) {
      return {
        ok: false,
        message: '该链接无 # 锚点，请粘贴带章节或段落定位的完整链接',
      };
    }

    return {
      ok: true,
      title: buildExcerptTitle(parsed.anchor),
      locator: formatExcerptLocator(parsed.anchor),
      noteAppend: `来源链接：${parsed.href}`,
      baseUrl: parsed.baseUrl,
    };
  }

  if (typeCode === BOOK_RESOURCE_TYPE_CODE || typeCode === DOCUMENT_RESOURCE_TYPE_CODE) {
    if (!parsed.anchor) {
      return {
        ok: false,
        message: '文档/图书节选请手动填写页码；若粘贴网页链接，请使用带 # 定位的地址',
      };
    }

    return {
      ok: true,
      title: buildExcerptTitle(parsed.anchor),
      locator: formatExcerptLocator(parsed.anchor),
      noteAppend: `来源链接：${parsed.href}`,
    };
  }

  return { ok: false, message: '当前资源类型不支持链接识别' };
}
