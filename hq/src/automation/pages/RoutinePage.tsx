import { Navigate, useParams } from 'react-router'
import { useQuery, getRoutine } from 'wasp/client/operations'
import type { RoutineDetail } from '../../shared/routineTypes'
import { routineHref } from '../../projects/routines/routineAddresses'

/**
 * A routine's own address, for links (a notification's among them): it opens the routine's page in the Routines of
 * its project, or of the person's own space.
 */
export function RoutinePage() {
  const { routineId } = useParams<{ routineId: string }>()
  const { data, error } = useQuery(getRoutine, routineId ? { routineId } : undefined, { enabled: !!routineId })
  const routine = data as RoutineDetail | undefined
  if (error) return <p role="alert" className="px-6 py-6 text-body text-danger">{(error as Error).message}</p>
  if (!routine) return <p className="px-6 py-6 text-body text-text-muted">Loading…</p>
  return <Navigate to={routineHref({ key: routine.isPersonal ? null : routine.projectKey }, routine.id)} replace />
}
