import { useMemo } from 'react'
import { useQuery, getTaskThreadMarks } from 'wasp/client/operations'
import type { BoardCardData, ShowAlsoGroup } from '@agenthix/ui/board'
import type { TaskThreadMark } from '../../shared/conversations/protocol'

/** The cards with their task's conversation mark and this viewer's unread count; a card without a conversation is as it was. */
export function withThreadMarks<T extends BoardCardData>(cards: T[], marks: TaskThreadMark[]): T[] {
  if (marks.length === 0) return cards
  const unread = new Map(marks.map((m) => [m.taskId, m.unread]))
  return cards.map((c) => (unread.has(c.id) ? { ...c, threadUnread: unread.get(c.id) } : c))
}

/** The board's cards marked with their tasks' conversations. */
export function useThreadMarkedCards(projectId: string | undefined, cards: BoardCardData[], backlog: BoardCardData[], showAlso: ShowAlsoGroup[]) {
  const { data } = useQuery(getTaskThreadMarks, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const marks = data ?? []
  return useMemo(() => ({
    cards: withThreadMarks(cards, marks),
    backlog: withThreadMarks(backlog, marks),
    showAlso: showAlso.map((g) => ({ ...g, tasks: withThreadMarks(g.tasks, marks) })),
  }), [cards, backlog, showAlso, data]) // eslint-disable-line react-hooks/exhaustive-deps
}
