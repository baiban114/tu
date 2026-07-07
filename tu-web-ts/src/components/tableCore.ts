import type { MultiTableData, MultiTableField, MultiTableFieldType, TableBlockData } from '@/api/types'

export interface TableColumnDescriptor {
  id: string
  name: string
  index: number
}

export abstract class BaseTableColumnController {
  abstract get columns(): TableColumnDescriptor[]

  abstract insertColumnAt(index: number): TableColumnDescriptor

  abstract deleteColumnAt(index: number): void

  abstract renameColumn(columnId: string, name: string): void

  getColumnIndex(columnId: string): number {
    return this.columns.findIndex((column) => column.id === columnId)
  }

  getColumnId(index: number): string | undefined {
    return this.columns[index]?.id
  }

  protected clampInsertIndex(index: number): number {
    return Math.max(0, Math.min(index, this.columns.length))
  }

  protected clampExistingIndex(index: number): number {
    return Math.max(0, Math.min(index, this.columns.length - 1))
  }
}

export class PlainTableColumnController extends BaseTableColumnController {
  constructor(
    private readonly data: TableBlockData,
    private readonly defaultColumnWidth = 160,
  ) {
    super()
  }

  get columns(): TableColumnDescriptor[] {
    return this.data.headers.map((name, index) => ({
      id: String(index),
      name,
      index,
    }))
  }

  insertColumnAt(index: number): TableColumnDescriptor {
    const targetIndex = this.clampInsertIndex(index)
    const name = `列 ${targetIndex + 1}`
    this.data.headers.splice(targetIndex, 0, name)
    this.data.rows.forEach((row) => row.splice(targetIndex, 0, ''))
    this.data.columnWidths = [...(this.data.columnWidths ?? [])]
    this.data.columnWidths.splice(targetIndex, 0, this.defaultColumnWidth)
    return { id: String(targetIndex), name, index: targetIndex }
  }

  deleteColumnAt(index: number): void {
    if (this.data.headers.length <= 1) return
    const targetIndex = this.clampExistingIndex(index)
    this.data.headers.splice(targetIndex, 1)
    this.data.rows.forEach((row) => row.splice(targetIndex, 1))
    this.data.columnWidths = [...(this.data.columnWidths ?? [])]
    this.data.columnWidths.splice(targetIndex, 1)
  }

  renameColumn(columnId: string, name: string): void {
    const index = this.getColumnIndex(columnId)
    if (index < 0) return
    this.data.headers[index] = name
  }
}

export interface MultiTableColumnControllerOptions {
  createFieldId: () => string
  defaultFieldType?: MultiTableFieldType
  defaultValueForField: (field: Pick<MultiTableField, 'type' | 'options'>) => string | number | boolean | null
}

export class MultiTableColumnController extends BaseTableColumnController {
  constructor(
    private readonly data: MultiTableData,
    private readonly options: MultiTableColumnControllerOptions,
  ) {
    super()
  }

  get columns(): TableColumnDescriptor[] {
    return this.data.fields.map((field, index) => ({
      id: field.id,
      name: field.name,
      index,
    }))
  }

  insertColumnAt(index: number): TableColumnDescriptor {
    const targetIndex = this.clampInsertIndex(index)
    const type = this.options.defaultFieldType ?? 'text'
    const field: MultiTableField = {
      id: this.options.createFieldId(),
      name: `字段 ${this.data.fields.length + 1}`,
      type,
    }
    this.data.fields.splice(targetIndex, 0, field)
    this.data.records.forEach((record) => {
      record.values[field.id] = this.options.defaultValueForField(field)
    })
    return { id: field.id, name: field.name, index: targetIndex }
  }

  deleteColumnAt(index: number): void {
    const field = this.data.fields[index]
    if (!field) return
    this.data.fields.splice(index, 1)
    this.data.records.forEach((record) => {
      delete record.values[field.id]
    })
    const fallbackGroupBy = this.data.fields.find((item) => item.type === 'singleSelect' || item.type === 'lifecycle')?.id
    this.data.views.forEach((view) => {
      if (view.groupByFieldId === field.id) view.groupByFieldId = fallbackGroupBy
    })
  }

  renameColumn(columnId: string, name: string): void {
    const field = this.data.fields.find((item) => item.id === columnId)
    if (!field) return
    field.name = name
  }
}

export interface TableContextMenuState {
  visible: boolean
  x: number
  y: number
}

export const closedTableContextMenu = (): TableContextMenuState => ({
  visible: false,
  x: 0,
  y: 0,
})

import { estimateFixedPanelPosition } from '@/utils/viewportPanel'

export const tableContextMenuPosition = (event: MouseEvent, width = 180, height = 220) => {
  const { left, top } = estimateFixedPanelPosition(event.clientX, event.clientY, width, height)
  return { x: left, y: top }
}

