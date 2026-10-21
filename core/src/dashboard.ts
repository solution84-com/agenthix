import type { SiteSilence } from './protocol/combinedRead.js'

export interface DashboardSnapshotProject {
  id: string
  key: string
  name: string
  description: string | null
  boardCount: number
  taskCount: number
  doneTaskCount: number
  updatedAt: string
}

export interface DashboardSnapshotAgent {
  id: string
  handle: string
  name: string
  avatarUrl: string | null
  tokens: number
  estimatedCost: number
  runCount: number
  activeSessionCount: number
}

export type DashboardSnapshotActivityType =
  | 'task_closed'
  | 'session_started'
  | 'run_completed'
  | 'project_created'
  | 'agent_added'
  | 'other'

export interface DashboardSnapshotActivity {
  id: string
  timestamp: string
  summary: string
  type: DashboardSnapshotActivityType
  relatedId?: string
}

export interface DashboardSnapshot {
  /** Stable site identity. The only HQ-display fields (slug, friendly name) live in HQ's own registry, not on the snapshot. */
  siteId: string
  capturedAt: string
  totals: {
    agents: number
    projects: number
    tasks: number
    activeSessions: number
  }
  taskCounts: {
    idle: number
    running: number
    blocked: number
    done: number
    failed: number
    total: number
  }
  runs: {
    total: number
    completed: number
    failed: number
    running: number
  }
  financial: {
    totalTokens: number
    estimatedCost: number
  }
  recentProjects: DashboardSnapshotProject[]
  topAgents: DashboardSnapshotAgent[]
  recentActivity: DashboardSnapshotActivity[]
  /**
   * The sites whose figures are missing from the run-derived fields above
   * (`runs`, `financial`, and each `topAgents[].tokens`/`runCount`), each with
   * the reason it could not be asked.
   *
   * Run data lives on the Execution Sites, and an organisation can run more
   * than one, so those fields are the sum of the sites that answered and are
   * only true of them. Always present — empty when every site answered — so a
   * view cannot render the totals without also having the list of what they
   * leave out. "No runs" and "cannot ask" must never look the same.
   */
  unanswered: SiteSilence[]
}
