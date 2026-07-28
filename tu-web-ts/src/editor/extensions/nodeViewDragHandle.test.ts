/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  isFromNodeViewDragHandle,
  isFromNodeViewNoDragTarget,
  preventNodeViewDragFromInteractive,
  stopNonHandleNodeViewDragEvent,
} from './nodeViewDragHandle'

function mountChrome() {
  const root = document.createElement('div')
  root.innerHTML = `
    <div data-node-view-drag-handle draggable="true" class="header">
      <span class="type">表格</span>
      <input class="title" data-node-view-no-drag type="text" value="标题文字" />
      <button type="button" data-node-view-no-drag>操作</button>
    </div>
    <div class="body">内容</div>
  `
  document.body.appendChild(root)
  return {
    root,
    header: root.querySelector('.header') as HTMLElement,
    type: root.querySelector('.type') as HTMLElement,
    input: root.querySelector('.title') as HTMLInputElement,
    button: root.querySelector('button') as HTMLButtonElement,
    body: root.querySelector('.body') as HTMLElement,
  }
}

describe('nodeViewDragHandle', () => {
  it('allows drag from chrome padding / type badge, not from title input or buttons', () => {
    const { header, type, input, button, body } = mountChrome()

    expect(isFromNodeViewDragHandle({ target: type } as unknown as Event)).toBe(true)
    expect(isFromNodeViewDragHandle({ target: header } as unknown as Event)).toBe(true)
    expect(isFromNodeViewDragHandle({ target: input } as unknown as Event)).toBe(false)
    expect(isFromNodeViewDragHandle({ target: button } as unknown as Event)).toBe(false)
    expect(isFromNodeViewDragHandle({ target: body } as unknown as Event)).toBe(false)

    expect(isFromNodeViewNoDragTarget({ target: input } as unknown as Event)).toBe(true)
    expect(isFromNodeViewNoDragTarget({ target: type } as unknown as Event)).toBe(false)
  })

  it('prevents HTML5 dragstart when selecting text inside title input', () => {
    const { input } = mountChrome()
    const event = new Event('dragstart', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'target', { value: input })

    expect(preventNodeViewDragFromInteractive(event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)

    expect(stopNonHandleNodeViewDragEvent({ event })).toBe(true)
  })

  it('does not block dragstart from the non-interactive handle area', () => {
    const { type } = mountChrome()
    const event = new Event('dragstart', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'target', { value: type })

    expect(preventNodeViewDragFromInteractive(event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    expect(stopNonHandleNodeViewDragEvent({ event })).toBe(false)
  })
})
