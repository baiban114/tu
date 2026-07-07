/** Shared state for HTML5 material drag from the library onto the X6 stage. */

let dragStart: { x: number; y: number } | null = null;
let dragMoved = false;

const MOVE_THRESHOLD_PX = 6;

export function beginMaterialDrag(event: DragEvent) {
  dragStart = { x: event.clientX, y: event.clientY };
  dragMoved = false;
}

export function trackMaterialDrag(event: DragEvent) {
  if (!dragStart || dragMoved) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  if (dx * dx + dy * dy >= MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
    dragMoved = true;
  }
}

export function endMaterialDrag() {
  dragStart = null;
}

/** Whether the last drag session moved enough to count as a drop placement (not a click). */
export function didMaterialDragMove(): boolean {
  return dragMoved;
}

export function resetMaterialDrag() {
  dragStart = null;
  dragMoved = false;
}
