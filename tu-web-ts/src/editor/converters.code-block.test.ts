import { describe, expect, it } from 'vitest'
import { pageContentToTipTap, tipTapToPageContent } from './converters'

describe('fenced code block markdown', () => {
  it('parses ```lang fenced block as codeBlock node', () => {
    const doc = pageContentToTipTap({
      content: '```java\npublic class Main {\n}\n```',
      embeds: [],
      annotations: [],
    })
    const codeBlock = doc.content?.find((node) => node.type === 'codeBlock')
    expect(codeBlock).toBeTruthy()
    expect(codeBlock?.attrs?.language).toBe('java')
    expect(codeBlock?.content?.[0]?.text).toBe('public class Main {\n}')
  })

  it('roundtrips fenced code block markdown', () => {
    const source = 'before\n\n```java\nSystem.out.println("hi");\n```\n\nafter'
    const doc = pageContentToTipTap({
      content: source,
      embeds: [],
      annotations: [],
    })
    const roundtrip = tipTapToPageContent(doc)
    expect(roundtrip.content).toContain('```java')
    expect(roundtrip.content).toContain('System.out.println("hi");')
    expect(roundtrip.content).toContain('before')
    expect(roundtrip.content).toContain('after')
  })

  it('parses fenced block without language', () => {
    const doc = pageContentToTipTap({
      content: '```\nplain code\n```',
      embeds: [],
      annotations: [],
    })
    const codeBlock = doc.content?.find((node) => node.type === 'codeBlock')
    expect(codeBlock?.attrs?.language).toBeFalsy()
    expect(codeBlock?.content?.[0]?.text).toBe('plain code')
  })
})
