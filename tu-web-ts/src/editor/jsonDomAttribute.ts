import type { Attribute } from '@tiptap/core'

function cloneDefault<T>(defaultValue: T): T {
  if (Array.isArray(defaultValue)) {
    return [...defaultValue] as T
  }
  if (defaultValue && typeof defaultValue === 'object') {
    return { ...(defaultValue as object) } as T
  }
  return defaultValue
}

/**
 * TipTap attribute that round-trips object/array values through HTML clipboard
 * as a JSON `data-*` attribute (same pattern as heading `sourceBinding`).
 *
 * Without this, TipTap's default DOM serialization turns objects into
 * `"[object Object]"`, so paste loses block/section metadata.
 */
export function jsonDomAttribute<T>(
  attrKey: string,
  dataAttrName: string,
  defaultValue: T,
): Attribute {
  return {
    default: defaultValue,
    parseHTML: (element) => {
      const raw = element.getAttribute(dataAttrName)
      if (raw == null || raw === '') return cloneDefault(defaultValue)
      try {
        return JSON.parse(raw) as T
      } catch {
        return cloneDefault(defaultValue)
      }
    },
    renderHTML: (attributes) => {
      const value = (attributes as Record<string, unknown>)[attrKey]
      if (value == null) return {}
      if (typeof value !== 'object') return {}
      try {
        const serialized = JSON.stringify(value)
        if (serialized === JSON.stringify(defaultValue)) return {}
        return { [dataAttrName]: serialized }
      } catch {
        return {}
      }
    },
  }
}
