/** The shapes the Workflows screens read, taken from the server's own types (type-only: nothing of it is bundled). */
import type { WorkspaceOwnerType } from '@prisma/client'
import type { LibraryWorkflow } from '../library'
import type { personRunView } from '../runsView'
import type { WorkflowDetailView, WorkflowVersionDetail } from '../queries'

export type WorkflowPlace = { type: WorkspaceOwnerType; id: string }
export type ListedWorkflow = LibraryWorkflow
export type WorkflowDetail = WorkflowDetailView
export type WorkflowVersionView = WorkflowVersionDetail
export type RunView = ReturnType<typeof personRunView>
export type VersionRow = WorkflowDetail['versions'][number]
