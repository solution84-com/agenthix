/**
 * What the Agents tool and the profile card read, as the operations answer (dates as ISO strings). The server
 * types live in hq; the tool's presenters take these shapes and nothing else.
 */
export type AgentFactsData = {
  id: string
  name: string
  handle: string
  role: string | null
  avatarUrl: string | null
  coverUrl: string | null
  defaultModel: string
  runtime: string
  approval: string
}

export type NowItemData = {
  kind: 'needsYou' | 'running'
  taskId: string
  key: string
  title: string
  projectId: string
  projectName: string
  reason: string | null
  since: string | null
}

export type ComingUpItemData =
  | { kind: 'task'; at: string; taskId: string; key: string; title: string; projectId: string; projectName: string }
  | { kind: 'routine'; at: string; routineId: string; title: string; projectId: string; projectName: string }

export type AgentNowData = {
  state: 'needsYou' | 'running' | 'idle'
  lead: NowItemData | null
  needsYouCount: number
  runningCount: number
  next: ComingUpItemData | null
}

export type TaskCountsData = { todo: number; inProgress: number; done: number; needsYou: number; running: number; total: number }

export type ProjectAgentRowData = {
  agent: AgentFactsData
  /** The project's default agent: removing it asks for a new default. */
  isDefault: boolean
  now: AgentNowData
  tasks: TaskCountsData
  model: { own: string; here: string; narrowed: boolean }
  narrowed: boolean
}

export type ToolPermissionData = { name: string; state: 'always' | 'ask' | 'never' }
export type BashPatternPermissionData = { pattern: string; state: 'always' | 'ask' | 'never' }
/** A project's or a person's narrowing: the agent's own shapes, each null when it leaves the organisation's. */
export type NarrowingData = {
  model: string | null
  approval: string | null
  allowedTools: ToolPermissionData[] | null
  allowedBashPatterns: BashPatternPermissionData[] | null
}

export type RecentRunData = {
  id: string
  sessionId: string
  status: string
  kind: 'conversation' | 'task'
  title: string | null
  taskKey: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
}

export type ProjectAgentDetailData = ProjectAgentRowData & {
  canManage: boolean
  nowItems: NowItemData[]
  comingUp: ComingUpItemData[]
  inThisProject: {
    own: { model: string; approval: string; allowedTools: ToolPermissionData[] | null }
    narrowing: NarrowingData | null
  }
  recentRuns: { runs: RecentRunData[] }
}

export type InstructionFileData = { path: string; text: string | null; modifiedAt: string | null; tooLarge: boolean }

export type PlaceInstructionsData = {
  organisation: { instructions: string } | null
  everyAgent: { file: InstructionFileData; skills: string[] }
  forAgent: { file: InstructionFileData; skills: string[] } | null
}

/** Approval, loosest first: when a person is asked about a tool set to Ask. */
export const APPROVALS = ['bypassed', 'deferred', 'immediate'] as const

/** The approval words a person reads, for the stored values. */
export const APPROVAL_WORDS: Record<string, string> = {
  bypassed: 'Bypassed',
  deferred: 'Deferred',
  immediate: 'Immediate',
}
