/** TipTap NodeView drag-handle root (also mirrored as `data-drag-handle` for PM). */
export const NODE_VIEW_DRAG_HANDLE_SELECTOR = '[data-node-view-drag-handle]'

/**
 * Interactive controls inside a drag-handle row must not start NodeView / HTML5 drag.
 * Selecting text in an focused input is the canonical case.
 */
export const NODE_VIEW_NO_DRAG_SELECTOR =
  'button, input, textarea, select, a, [contenteditable="true"], [data-node-view-no-drag]'

const eventTargetElement = (event: Event): Element | null => {
  const target = event.target
  if (target instanceof Element) return target
  return target instanceof Text ? target.parentElement : null
}

/** True when the event originated from an interactive / no-drag descendant. */
export const isFromNodeViewNoDragTarget = (event: Event): boolean => {
  const target = eventTargetElement(event)
  if (!target) return false
  return Boolean(target.closest(NODE_VIEW_NO_DRAG_SELECTOR))
}

/**
 * True only when the gesture should start a NodeView drag:
 * from a drag-handle, and not from an interactive control inside that handle.
 */
export const isFromNodeViewDragHandle = (event: Event) => {
  const target = eventTargetElement(event)
  if (!target) return false
  const handle = target.closest(NODE_VIEW_DRAG_HANDLE_SELECTOR)
  if (!handle) return false
  const interactive = target.closest(NODE_VIEW_NO_DRAG_SELECTOR)
  return !interactive || !handle.contains(interactive)
}

/**
 * Cancel native HTML5 drag when it would steal text selection / control interaction
 * inside a NodeView drag-handle chrome (e.g. title input on `TuBlockChromeHeader`).
 * Returns true when the drag was prevented.
 */
export const preventNodeViewDragFromInteractive = (event: DragEvent): boolean => {
  if (!isFromNodeViewNoDragTarget(event)) return false
  event.preventDefault()
  event.stopPropagation()
  return true
}

/** TipTap `VueNodeViewRenderer` `stopEvent`: allow drag only from the handle grip area. */
export const stopNonHandleNodeViewDragEvent = ({ event }: { event: Event }) => {
  if (isFromNodeViewDragHandle(event)) return false
  if (event.type === 'dragstart') event.preventDefault()
  return true
}
