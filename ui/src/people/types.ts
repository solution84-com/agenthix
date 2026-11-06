import type { ReactNode } from 'react'
import type { NowItemData, TaskCountsData } from '../agents/projectAgentTypes'

/**
 * What the People views read, as the operations answer. The server types live in hq; the presenters take these
 * shapes and nothing else. Dates arrive as `Date` from Wasp, or as ISO strings in tests.
 */
export type PersonData = {
  userId: string
  name: string
  /** The login name, without the @; null once erased. */
  handle: string | null
  avatarUrl: string | null
  state: 'active' | 'left' | 'erased'
}

/** The organisation's roles (adr-0102). */
export type OrgRoleData = 'ADMIN' | 'MEMBER'
/** A project's roles (adr-0102): a Viewer reads it and changes nothing. */
export type ProjectRoleData = 'ADMIN' | 'MEMBER' | 'VIEWER'
type When = string | Date

export type PersonNowData = {
  state: 'needsYou' | 'running' | 'idle'
  lead: NowItemData | null
  needsYouCount: number
  runningCount: number
}

export type ProjectPersonRowData = {
  person: PersonData
  role: ProjectRoleData
  joinedAt: When
  now: PersonNowData
  items: NowItemData[]
  tasks: TaskCountsData
  lastActiveAt: When | null
}

export type ProjectPersonDetailData = ProjectPersonRowData & {
  canManage: boolean
  isMe: boolean
  timezone: string | null
  orgRole: OrgRoleData | null
  orgJoinedAt: When | null
  viewerIsOrgAdmin: boolean
}

export type PickablePersonData = {
  person: PersonData
  orgRole: OrgRoleData
  projectCount: number
  isMember: boolean
}

/** What happens to a person's open tasks when they leave a project: another member takes them, or they wait. */
export type OpenTasksChoice = { kind: 'person'; userId: string } | { kind: 'wait' }

export type AgentFaceData = { id: string; name: string; handle: string; role: string | null; avatarUrl: string | null }

export type ProjectPreviewData = {
  project: {
    id: string
    key: string
    name: string
    description: string | null
    accessLevel: 'OPEN' | 'PRIVATE'
    startedAt: When
    product: { id: string; name: string; slug: string } | null
    site: { id: string; label: string } | null
    lead: PersonData | null
    defaultAgentId: string | null
  }
  isMember: boolean
  canJoin: boolean
  people: PersonData[]
  agents: AgentFaceData[]
  /** Counts only: what anyone who may see the project is shown of its work. */
  taskCount: number
  openTaskCount: number
  runningCount: number
  doneCount: number
  boardCount: number
  lastRunAt: When | null
}

export type PersonCardData = {
  person: PersonData
  orgRole: OrgRoleData | null
  timezone: string | null
  viewerTimezone: string | null
  sharedProjects: { id: string; key: string; name: string }[]
  here: { projectId: string; role: ProjectRoleData; tasks: TaskCountsData } | null
  isMe: boolean
  viewerIsOrgAdmin: boolean
}

/** How a presenter draws a person's picture: hq resolves the stored path to one that loads. */
export type RenderPersonAvatar = (person: Pick<PersonData, 'userId' | 'name' | 'avatarUrl'>, size: 'sm' | 'md' | 'lg') => ReactNode
