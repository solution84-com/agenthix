import { useQuery, getBoards, getAgents } from 'wasp/client/operations'
import type { RoutineFormBoard } from '@agenthix/ui/tasks'
import { columnsOf } from './boardColumns'

/** The boards (with their columns) and agents a routine's template can name. */
export function useRoutineFormData(projectId: string | undefined): { boards: RoutineFormBoard[]; agents: Array<{ id: string; name: string }> } {
  const { data: boards } = useQuery(getBoards, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const { data: agents } = useQuery(getAgents)
  return {
    // `getBoards` leaves archived boards out. The form's own field is still named `stages` (@agenthix/ui).
    boards: (boards ?? [])
      .map(b => ({ id: b.id, name: b.name, stages: columnsOf(b.columns).map(s => ({ name: s.name, label: s.label ?? s.name })) })),
    agents: (agents ?? []).map(a => ({ id: a.id, name: a.name })),
  }
}
