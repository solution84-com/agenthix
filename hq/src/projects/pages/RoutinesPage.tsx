import { AcrossListPage } from '../screen/AcrossListPage'
import { RoutinesAcrossView } from '../screen/RoutinesAcrossView'

/** Routines, a rail place: work that repeats, in every project and in Chat. A routine is not a task; it makes them. */
export function RoutinesPage() {
  return (
    <AcrossListPage what="routine" title="Routines" subtitle="Work that repeats: each routine makes its next task, in every project and in Chat">
      <RoutinesAcrossView />
    </AcrossListPage>
  )
}
