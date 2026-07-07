import type { Cell } from '@antv/x6';

export function isCellDeleteProtected(cell: Cell): boolean {
  return cell.getData<Record<string, unknown>>()?.deleteProtected === true;
}

export function filterDeletableCells(cells: Cell[]): Cell[] {
  return cells.filter((cell) => !isCellDeleteProtected(cell));
}
