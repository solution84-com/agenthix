import { ChipColumns } from './ChipColumns'
import { KanbanColumns } from './KanbanColumns'
import { StackedColumns } from './StackedColumns'
import { useBacklogFold } from './useBacklogFold'
import type { ColumnsViewProps } from './columnsModel'

/** A board's columns in the layout the room allows (every screen reviewed spec §3). */
export function BoardColumnsView(props: ColumnsViewProps) {
  const backlogFold = useBacklogFold(props.boardId)
  const p = { ...props, backlogFold }
  if (p.layout === 'columns') return <KanbanColumns {...p} />
  if (p.layout === 'chips') return <ChipColumns {...p} />
  return <StackedColumns {...p} />
}
