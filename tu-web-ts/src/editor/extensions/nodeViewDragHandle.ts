const DRAG_HANDLE_SELECTOR = '[data-node-view-drag-handle]'
const INTERACTIVE_SELECTOR = 'button, input, textarea, select, a, [contenteditable="true"], [data-node-view-no-drag]'

const eventTargetElement = (event: Event): Element | null => {
  const target = event.target
  if (target instanceof Element) return target
  return target instanceof Text ? target.parentElement : null
}

export const isFromNodeViewDragHandle = (event: Event) => {
  const target = eventTargetElement(event)
  if (!target) return false
  const handle = target.closest(DRAG_HANDLE_SELECTOR)
  if (!handle) return false
  const interactive = target.closest(INTERACTIVE_SELECTOR)
  return !interactive || !handle.contains(interactive)
}

export const stopNonHandleNodeViewDragEvent = ({ event }: { event: Event }) => {
  if (isFromNodeViewDragHandle(event)) return false
  if (event.type === 'dragstart') event.preventDefault()
  return true
}
