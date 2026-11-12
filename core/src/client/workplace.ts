/**
 * The rest of what a client reads of the workplace: the organisation before and after sign-in, Home's signals,
 * notifications, pins and the project cards.
 */
import type { SiteSilence } from '../protocol/combinedRead.js'
import type { HqVersions } from './protocol.js'
import type { PictureRecipeView } from './pictures.js'

// ── The organisation ──

export type OrgCard = {
  name: string
  handle: string | null
  vision: string
  avatarUrl: string | null
  coverUrl: string | null
}

export type SignInShowsChoice = 'cover' | 'name' | 'nothing'

/** What the sign-in page may show: every field the admin's choice leaves out is null. */
export type PublicOrgIdentity = { shows: SignInShowsChoice } & { [K in keyof OrgCard]: OrgCard[K] | null }

/** `GET /api/org/public-identity`, with no session: the organisation as its admin chose to show it, and hq's versions. */
export type PublicIdentityAnswer = PublicOrgIdentity & HqVersions

/** `getOrgIdentity`: the whole identity, for a signed-in member. */
export type OrgIdentity = {
  id: string
  name: string
  handle: string | null
  vision: string
  mission: string
  avatarUrl: string | null
  coverUrl: string | null
  /** The recipes the avatar and the cover were drawn from (since 1.22); null for an upload. */
  avatarRecipe?: PictureRecipeView | null
  coverRecipe?: PictureRecipeView | null
  /** When the organisation began on Agenthix: "on Agenthix since March 2026". */
  since: Date | null
  /** How much of this the sign-in page shows to someone not signed in. */
  signInShows: SignInShowsChoice
}

// ── Home ──

export type HomeSignalsArgs = {
  /** The end of the caller's day, as their device keeps time (ISO). */
  until: string
}

export type HomeSignals = {
  notificationsNeedingYou: number
  agentsAtWork: number
  comingUpToday: number
}

// ── Notifications ──

/** A notification as the panel shows it: in two lines, with the task it is about when it is about one. */
export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  actionLabel: string | null
  actionUrl: string | null
  status: string
  createdAt: Date
  /** False for a persistent notification only its subject being addressed clears: no Dismiss. */
  dismissible: boolean
  task: { key: string; title: string; agent: { name: string; avatarUrl: string | null } | null } | null
  /** Line 2: why it is here, in one line — after the command, when there is one. */
  detail: string
  /** A tool request's first command: line 2 reads "Wants to run <command> <detail>". */
  command: string | null
}

// ── Pins ──

export const PIN_KINDS = ['PROJECT', 'BOARD', 'AGENT'] as const
export type PinKindName = (typeof PIN_KINDS)[number]

/** A pin as the navigation shows it: the item resolved to its name, its link and, for an agent, its avatar. */
export type PinnedItem = {
  id: string
  kind: PinKindName
  itemId: string
  name: string
  href: string
  avatarUrl: string | null
}

/** `pinItem` and `unpinItem`. */
export type PinArgs = { kind: PinKindName; itemId: string }

// ── Projects ──

export type ProjectCardLine = {
  projectId: string
  needsYouCount: number
  runningCount: number
  lastRunAt: string | null
  /** Its tasks not done and not archived (since 1.13). */
  openCount?: number
  /** When anything in it last changed: a task, the project itself, or a run (since 1.13). */
  lastActivityAt?: string | null
}

/** `isMember` is false for an open project the person has not joined: its card opens the preview. */
export type ProjectCard = ProjectCardLine & { isMember: boolean }

/** `getProjectCards`: each project's line, and the sites that did not answer for theirs. */
export type ProjectCardsView = { cards: ProjectCard[]; unanswered: SiteSilence[] }
