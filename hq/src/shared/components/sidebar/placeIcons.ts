import {
  Bot, Briefcase, Folders, House, Kanban, LaptopMinimal, Library, MessageSquare, Repeat, SquareCheckBig, UserRound,
} from 'lucide-react'

/**
 * The places' icons, drawn once: the rail, the phone's drawer and a project's menu use these, so a place across
 * projects and a project's own page of the same kind look alike (Boards, Tasks, Workspaces, Routines, Workroom).
 */
export const PLACE_ICONS = {
  home: House,
  chat: MessageSquare,
  space: UserRound,
  projects: Briefcase,
  boards: Kanban,
  tasks: SquareCheckBig,
  workspaces: Folders,
  routines: Repeat,
  workrooms: LaptopMinimal,
  agents: Bot,
  library: Library,
} as const
