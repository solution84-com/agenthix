import type { BoardCardData, BoardColumnInfo, BoardListItem } from '@agenthix/ui/board'

let n = 0
export function card(over: Partial<BoardCardData> = {}): BoardCardData {
  n += 1
  return {
    id: `t${n}`, taskKey: `WEB-${n}`, title: `Task ${n}`, priority: 'MEDIUM', status: 'TODO', column: null, boardId: 'b1',
    runState: 'RUN_NONE', runStateReason: null, assignedAgent: null, needsYou: false, ...over,
  }
}

export const COLUMNS: BoardColumnInfo[] = [
  { name: 'todo', label: 'To do', status: 'TODO', order: 0, autoQueue: true },
  { name: 'doing', label: 'In progress', status: 'IN_PROGRESS', order: 1 },
  { name: 'done', label: 'Done', status: 'DONE', order: 2 },
]

export function boardItem(over: Partial<BoardListItem> = {}): BoardListItem {
  return {
    id: 'b1', name: 'Product', kind: 'WORKFLOW', archivedAt: null, backlogCount: 2, needsYouCount: 0, currentSprint: null,
    columns: COLUMNS.map(c => ({ ...c, count: 1 })), ...over,
  }
}
