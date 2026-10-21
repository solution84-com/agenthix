import type { ComponentType } from 'react'
import {
  LayoutDashboard, MessagesSquare, SquareCheck, Kanban, GanttChart, Play, Repeat, Folder, Diamond, BookOpen,
  GitBranch, Users, Settings, Brain, Activity, FolderKanban, Gauge, ScrollText, Bot, Circle,
} from 'lucide-react'
import type { PlaceNavKind } from '../../layouts/placeNavTypes'

type Icon = ComponentType<{ size?: number; className?: string }>

const SECTION_ICONS: Record<string, Icon> = {
  overview: LayoutDashboard,
  conversations: MessagesSquare,
  tasks: SquareCheck,
  boards: Kanban,
  timeline: GanttChart,
  runs: Play,
  automation: Repeat,
  files: Folder,
  artefacts: Diamond,
  knowledge: BookOpen,
  workspaces: GitBranch,
  members: Users,
  settings: Settings,
  memory: Brain,
  // Your space's own section.
  agents: Bot,
}

// An agent's page has sections of its own, and a Projects section where a project has none.
const AGENT_ICONS: Record<string, Icon> = {
  now: Activity,
  projects: FolderKanban,
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
