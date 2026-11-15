/**
 * A project as a client reads it from hq: its own fields, the list of projects the person may see, and one
 * project opened with its boards, tasks, agents, site and lead. Dates are `Date`, as superjson carries them.
 */
import type { BoardFields } from './boards.js'
import type { AgentRef, TaskFields } from './tasks.js'

export type ProjectAccessLevel = 'OPEN' | 'PRIVATE'
export type ProjectRole = 'ADMIN' | 'MEMBER' | 'VIEWER'

/** A project's own fields, as hq stores them. */
export type ProjectFields = {
  id: string
  name: string
  slug: string | null
  key: string
  description: string | null
  executionSiteId: string | null
  productId: string | null
  programId: string | null
  defaultAgentId: string | null
  accessLevel: ProjectAccessLevel
  /** The project's own run limits; null: the organisation's. */
  runTimeLimitMinutes: number | null
  runTurnLimit: number | null
  /** Archive its finished tasks after this many days; 0: never; null: the organisation's default. */
  archiveFinishedAfterDays: number | null
  /** Set only on a person's personal project: that person. */
  personalOwnerId: string | null
  /** Whether this is the person's space (Your space), as against one of their other personal projects. */
  personalSpace: boolean
  leadUserId: string | null
  createdAt: Date
  updatedAt: Date
}

/** The product or program a project is filed under. */
export type ProjectGroupRef = { id: string; name: string; slug: string }

/** A project in the list (`getProjects`). An open project is listed to everyone; `isMember` says if the reader is in it. */
export type ProjectListItem = ProjectFields & {
  boards: Array<{ id: string }>
  tasks: Array<{
    id: string
    runState: TaskFields['runState']
    state: TaskFields['state']
    executionState: TaskFields['executionState']
  }>
  product: ProjectGroupRef | null
  program: ProjectGroupRef | null
  isMember: boolean
  /** The reader's role in it; null when they are not a member. */
  myRole: ProjectRole | null
}

/** A task in an opened project: its agent. */
export type ProjectTask = TaskFields & { assignedAgent: AgentRef | null }

/** An agent on the project: `direct` is false when it is there only through teams. */
export type ProjectAgentLink = {
  projectId: string
  agentId: string
  direct: boolean
  createdAt: Date
  agent: AgentRef & { avatarUrl: string | null }
}

/** The project's site as a member is given it: its name as shown, and a warning when it is nearly out of room. */
export type ProjectSiteShown = { id: string; label: string; warning: string | null }

/** A person, as they are named wherever they appear. */
export type PersonSummaryView = {
  userId: string
  name: string
  /** The login name, without the @; null once erased. */
  handle: string | null
  avatarUrl: string | null
  /** Their cover; null for an erased person. */
  coverUrl?: string | null
  state: 'active' | 'left' | 'erased'
}

/** A project's lead: a label in its facts, granting nothing. */
export type ProjectLeadView = { userId: string; username: string; person: PersonSummaryView }

/** One project opened (`getProject`, `getProjectByKey`). */
export type ProjectDetail = ProjectFields & {
  boards: BoardFields[]
  tasks: ProjectTask[]
  agents: ProjectAgentLink[]
  product: ProjectGroupRef | null
  program: ProjectGroupRef | null
  executionSite: ProjectSiteShown | null
  /** Null when none is chosen, or the one chosen has left the project. */
  lead: ProjectLeadView | null
}

// ── Arguments ──

export type ProjectIdArgs = { projectId: string }
export type ProjectKeyArgs = { key: string }
