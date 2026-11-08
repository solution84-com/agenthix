import type { ComponentType } from 'react'
import {
  LayoutDashboard, MessagesSquare, GanttChart, Play, Folder, Diamond, BookOpen, Users, Settings, Brain, Activity, Gauge,
  ScrollText, Circle, Timer, Workflow, Sparkles, GitBranch, KeyRound,
} from 'lucide-react'
import type { PlaceNavKind } from '../../layouts/placeNavTypes'
import { PLACE_ICONS } from './placeIcons'

type Icon = ComponentType<{ size?: number; className?: string }>

const SECTION_ICONS: Record<string, Icon> = {
  overview: LayoutDashboard,
  conversations: MessagesSquare,
  // The same icons as the rail's places of the same kind.
  tasks: PLACE_ICONS.tasks,
  boards: PLACE_ICONS.boards,
  sprints: Timer,
  timeline: GanttChart,
  runs: Play,
  automation: PLACE_ICONS.routines,
  routines: PLACE_ICONS.routines,
  workroom: PLACE_ICONS.workrooms,
  workflows: Workflow,
  skills: Sparkles,
  github: GitBranch,
  secrets: KeyRound,
  files: Folder,
  artefacts: Diamond,
  knowledge: BookOpen,
  workspaces: PLACE_ICONS.workspaces,
  members: Users,
  settings: Settings,
  memory: Brain,
  // Your space's own section.
  agents: PLACE_ICONS.agents,
}

// An agent's page has sections of its own, and a Projects section where a project has none.
const AGENT_ICONS: Record<string, Icon> = {
  now: Activity,
  projects: PLACE_ICONS.projects,
  usage: Gauge,
  instructions: ScrollText,
}

/** The section's icon in the collapsed panel (the spec's list, from lucide). */
export function sectionIcon(kind: PlaceNavKind, id: string): Icon {
  return (kind === 'agent' ? AGENT_ICONS[id] : undefined) ?? SECTION_ICONS[id] ?? Circle
}

/** A count short enough for a badge: its leading number ("1 needs you · 12" is 1), or none. */
export function badgeOf(count: string | undefined): string | null {
  const n = count?.match(/^\d+/)?.[0]
  return n && n !== '0' ? n : null
}
