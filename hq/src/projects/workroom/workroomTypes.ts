/**
 * What a Workroom shows (spec D17–D19, RU1–RU4, the Workroom design): a project's agents at work as scorecards, and
 * the counts above them. Read by `workroomRead.ts`; the browser draws it. Client-safe: no server imports.
 */
import type { NeedsPersonReason, SiteSilence } from '@agenthix/core'

/** The ring on the agent's avatar (D18): what it is doing, the busiest first. Null: no ring. */
export type WorkroomRing = 'RUNNING' | 'NEEDS_YOU' | 'FAILED' | 'WAITING' | null

/** One run at work now: a task's run, or a reply in a conversation. */
export type WorkroomNow = {
  key: string
  kind: 'task' | 'reply'
  /** The task's title; for a reply, the conversation's title when the viewer may read it, else null. */
  title: string | null
  taskId: string | null
  taskKey: string | null
  href: string | null
  sessionId: string | null
  runNumber: number | null
  /** When it started, ISO; null while hq does not know yet. */
  since: string | null
  /** "you", "Kai", "Writer", "its start time": who or what asked for it; null when not known. */
  startedBy: string | null
}

/** Why a task in an agent's line has not started: each says what starts it (the design's *Why runs wait*). */
export type WorkroomLineWhy =
  | { kind: 'next'; after: string | null }
  | { kind: 'after'; title: string }
  | { kind: 'startsAt'; at: string }
  | { kind: 'siteBusy'; siteName: string | null }
  | { kind: 'siteAway'; siteName: string | null }
  | { kind: 'branch' }

export type WorkroomLineItem = { taskId: string; taskKey: string; title: string; href: string; why: WorkroomLineWhy }

/** One thing that waits for a person, drawn as a bar at the card's foot. */
export type WorkroomNeed = {
  taskId: string
  taskKey: string
  title: string
  href: string
  reason: NeedsPersonReason
  /** The stored reason in plain words, when it says more than the reason itself. */
  detail: string | null
  runNumber: number | null
  /** When it began to wait, ISO. */
  since: string
}

export type WorkroomAgent = {
  agentId: string
  name: string
  handle: string
  avatarUrl: string | null
  role: string | null
  ring: WorkroomRing
  ready: number
  inLine: number
  runsToday: number
  /** Dollars, estimated from tokens; 0 when nothing ran or no price is known. */
  spentToday: number
  now: WorkroomNow[]
  line: WorkroomLineItem[]
  needs: WorkroomNeed[]
  finishedToday: number
  lastFinished: { title: string | null; href: string | null; at: string; kind: 'task' | 'reply' } | null
}

export type WorkroomCounts = {
  needsYou: number
  /** Of `needsYou`: asking for an okay or an answer, and failed. */
  needsAsking: number
  needsFailed: number
  running: number
  runningTasks: number
  runningReplies: number
  waiting: number
  finishedToday: number
  spentToday: number
  ready: number
  /** In how many projects something runs (Workrooms only). */
  runningProjects: number
}

export type WorkroomProject = {
  projectId: string
  projectKey: string
  projectName: string
  personal: boolean
  counts: WorkroomCounts
  agents: WorkroomAgent[]
  /** Nothing has ever run here: the Workroom says how work starts. */
  nothingYet: boolean
  /** The sites that did not answer, so today's runs there are not counted. */
  unanswered: SiteSilence[]
}

export type WorkroomsView = { counts: WorkroomCounts; projects: WorkroomProject[]; unanswered: SiteSilence[] }

export type GetWorkroomArgs = { projectId: string; todayFrom?: string }
export type GetWorkroomsArgs = { todayFrom?: string } | undefined
export type ReorderWorkroomAgentsArgs = { projectId: string; agentIds: string[] }
export type StopMyRunsArgs = { projectId?: string; agentId?: string } | undefined
export type StopMyRunsResult = { withdrawn: number; cancelled: number; projects: number }
