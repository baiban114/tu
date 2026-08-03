/** Shared state for HTML5 palette drag (materials / shapes) onto the X6 stage. */

export const X6_MATERIAL_MIME = 'application/x6-material';
export const X6_SHAPE_MIME = 'application/x6-shape';

/** Payload for toolbar shape drag-and-drop onto the board. */
export type ShapeDragPayload =
  | { kind: 'preset'; preset: 'rect' | 'round' | 'ellipse' | 'diamond' }
  | { kind: 'uml-preset' };

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

export function parseShapeDragPayload(raw: string): ShapeDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as ShapeDragPayload;
    if (parsed?.kind === 'uml-preset') return parsed;
    if (
      parsed?.kind === 'preset'
      && (parsed.preset === 'rect'
        || parsed.preset === 'round'
        || parsed.preset === 'ellipse'
        || parsed.preset === 'diamond')
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}
