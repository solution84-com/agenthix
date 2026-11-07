import { AcrossListPage } from '../screen/AcrossListPage'
import { WorkspacesAcrossView } from '../screen/WorkspacesAcrossView'

/** Workspaces, a rail place: the code and files agents work on, in every project and in Chat. */
export function WorkspacesListPage() {
  return (
    <AcrossListPage what="workspace" title="Workspaces" subtitle="Code and files agents work on, in every project and in Chat">
      <WorkspacesAcrossView />
    </AcrossListPage>
  )
}
