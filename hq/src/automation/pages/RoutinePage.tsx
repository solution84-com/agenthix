import { Navigate, useParams } from 'react-router'
import { useQuery, getRoutine } from 'wasp/client/operations'
import type { RoutineDetail } from '../../shared/routineTypes'
import { routineAddress } from './routineAddress'

/**
 * A routine's old address keeps working for links (a notification's among them): it opens the routine inside the
 * Automation tool of its project, or of the person's own Chat (every screen reviewed spec §3).
 */
export function RoutinePage() {
  const { routineId } = useParams<{ routineId: string }>()
  const { data, error } = useQuery(getRoutine, routineId ? { routineId } : undefined, { enabled: !!routineId })
  const routine = data as RoutineDetail | undefined
  if (error) return <p role="alert" className="px-6 py-6 text-body text-danger">{(error as Error).message}</p>
  if (!routine) return <p className="px-6 py-6 text-body text-text-muted">Loading…</p>
  return <Navigate to={routineAddress({ key: routine.isPersonal ? null : routine.projectKey }, routine.id)} replace />
}
