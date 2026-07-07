export interface CodeBlockLanguageOption {
  /** `el-select` option value; use {@link CODE_BLOCK_PLAIN_SELECT_VALUE} for plain text. */
  value: string
  label: string
}

/** Non-empty select value for plain text (`language` attr stored as null/empty). */
export const CODE_BLOCK_PLAIN_SELECT_VALUE = 'plaintext'

/** Languages supported for fenced code block rendering. */
export const CODE_BLOCK_LANGUAGE_OPTIONS: CodeBlockLanguageOption[] = [
  { value: CODE_BLOCK_PLAIN_SELECT_VALUE, label: '纯文本' },
  { value: 'java', label: 'Java' },
  { value: 'xml', label: 'XML' },
  { value: 'json', label: 'JSON' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
]

const SUPPORTED_LANG_VALUES = new Set(
  CODE_BLOCK_LANGUAGE_OPTIONS
    .map((item) => item.value)
    .filter((value) => value !== CODE_BLOCK_PLAIN_SELECT_VALUE),
)

export function normalizeCodeBlockLanguage(language: string | null | undefined): string {
  const normalized = String(language ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'plaintext' || normalized === 'text' || normalized === 'plain') {
    return ''
  }
  if (normalized === 'ts') return 'typescript'
  if (normalized === 'js') return 'javascript'
  if (normalized === 'yml') return 'yaml'
  return normalized
}

/** Value for language `el-select`; unknown languages fall back to plain text. */
export function codeBlockSelectValue(language: string | null | undefined): string {
  const normalized = normalizeCodeBlockLanguage(language)
  if (!normalized || !SUPPORTED_LANG_VALUES.has(normalized)) {
    return CODE_BLOCK_PLAIN_SELECT_VALUE
  }
  return normalized
}

/** Map `el-select` / `<select>` value back to stored `language` attr. */
export function codeBlockLanguageFromSelect(selectValue: string | null | undefined): string | null {
  if (
    selectValue == null
    || selectValue === ''
    || selectValue === CODE_BLOCK_PLAIN_SELECT_VALUE
  ) {
    return null
  }
  const normalized = normalizeCodeBlockLanguage(selectValue)
  return normalized || null
}

export function codeBlockLanguageLabel(language: string | null | undefined): string {
  const selectValue = codeBlockSelectValue(language)
  return CODE_BLOCK_LANGUAGE_OPTIONS.find((item) => item.value === selectValue)?.label ?? '纯文本'
}
