import type { ReactNode } from 'react'
import type { Breadcrumb } from '../shared/layouts/ScreenBar'

/** One structured view of a place's state: a section of the place, and a row of its Overview. */
export interface PlaceTool {
  id: string
  label: string
  /** A short count or state beside the tool's name, e.g. "1 needs you · 12" or "On". */
  count?: string
  /** Draws the count as needing the person (warning) or as something live (success). */
  tone?: 'needs' | 'live'
  /** Pictures drawn before the count: People and Agents show up to four. */
  avatars?: ReactNode
  /** Another address for the tool named here (`?tool=people` for Members): it opens that section and has none of its own. */
  aliasOf?: string
  render: () => ReactNode
}

export interface PlaceToolGroup {
  /** Null for the last, unnamed group (Settings). */
  label: string | null
  tools: PlaceTool[]
  /** Drawn under the group's tools: Run all and Stop all, under Agents at work. */
  footer?: ReactNode
}

export interface PlaceFact {
  label: string
  value: ReactNode
}

export interface PlaceAgent {
  id: string
  name: string
  avatarUrl: string | null
}

/**
 * A place — a project, the person's own space, or an agent's page — as its screens need it. The left panel's sections, the
 * Overview, the conversations and the tools are built once and given one of these.
 */
export interface Place {
  /** Where its conversations live: a conversation is `<basePath>/t/<id>`, e.g. `/projects/AGX` or `/chat`. */
  basePath: string
  /** The place's own address, which opens its Overview section: `/projects/AGX`, `/space`. */
  homePath: string
  /** The breadcrumb of the conversations list; a conversation adds its title after it. */
  breadcrumbs: Breadcrumb[]
  /** The place's name, as a small screen's header shows it. */
  name: string
  /** The screen bar's button that opens the Conversations section with its box: "Talk about Agenthix". */
  talkLabel: string
  /** The heading over the facts: "About this project". */
  factsHeading: string
  /** What the place is for, under that heading: a project's description. */
  description?: string | null
  /** Where ‹ goes from the place on a small screen; null opens the navigation drawer instead. */
  backHref: string | null
  /** A project's id, or null for the person's own space. */
  projectId: string | null
  /** Where a new conversation works: the project, or (null) the person's own storage. */
  sessionLocation: { primaryOwnerType: 'project'; primaryOwnerId: string } | null
  /** The agents a conversation here may talk to, and the one the message box starts with. */
  agents: PlaceAgent[]
  defaultAgentId: string | null
  /** The message box's placeholder on the conversations list, e.g. "Talk about this project…". */
  composerPlaceholder: string
  /** Shown when there is no agent to talk to. */
  noAgentsNotice: string
  facts: PlaceFact[]
  /** People and Agents, two rows after the facts with no heading (they are not tools). A personal space has none. */
  teamRows?: PlaceTool[]
  /** Tools opened from a link in the place's facts, not from a row: Chat's Agents. They have no row of their own. */
  linkedTools?: PlaceTool[]
  toolGroups: PlaceToolGroup[]
  /** The tools' ids in the order their sections follow Overview and Conversations (spec §7). */
  sectionOrder: string[]
}
