/** A board column (adr-0097). Backlog is not one: a task in no column is in the board's Backlog. */
export interface BoardColumnConfig {
  name: string
  label: string
  status: string
  color: string
  order: number
  /**
   * A column no longer starts work (adr-0175): hq ignores it.
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  autoQueue?: boolean
}

/**
 * Project Tasks, a workflow board, or a workflow board with sprints (adr-0097). A board is now a saved view
 * (adr-0176), whose kind is `BoardKind` in ../tasks.
 */
export type BoardWorkflowKind = 'PROJECT_TASKS' | 'WORKFLOW' | 'SPRINTS'

export interface Board {
  id: string
  siteId: string
  projectId: string
  projectKey: string
  projectName: string
  name: string
  kind: BoardWorkflowKind
  archivedAt: string | null
  columns: BoardColumnConfig[]
  taskCount: number
  updatedAt: string
}
