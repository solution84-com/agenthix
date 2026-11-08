import { AcrossListPage } from '../screen/AcrossListPage'
import { RoutinesAcrossView } from '../screen/RoutinesAcrossView'

/** Routines, a rail place: runs that repeat, in every project the person is in (D20). */
export function RoutinesPage() {
  return (
    <AcrossListPage what="routine" title="Routines" subtitle="Runs that repeat, in every project you are in">
      <RoutinesAcrossView />
    </AcrossListPage>
  )
}
