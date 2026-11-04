import type { PlaceFact, PlaceTool, PlaceToolGroup } from '../places/placeTypes'
import { ProjectTasksPage } from '../projects/pages/ProjectTasksPage'
import { ProjectBoardsPage } from '../projects/pages/ProjectBoardsPage'
import { BoardTimeline } from '../projects/timeline/BoardTimeline'
import { ProjectRunsTool } from '../projects/place/ProjectRunsTool'
import { ProjectRunControls } from '../projects/place/ProjectRunControls'
import { ProjectAutomationTool } from '../projects/place/projectToolViews'
import { runsCount, tasksCount } from '../projects/place/projectPlaceCounts'
import { filesToolGroup } from '../storage/pages/filesToolGroup'
import type { FilesToolCounts } from '../storage/pages/filesToolCounts'
import { PersonalProjectsFact } from '../projects/place/PersonalProjectsFact'
import { ChatAgentsFact } from './ChatAgentsFact'
import { ChatAgentsTool } from './ChatAgentsTool'

/** Your space's sections after Overview and Conversations (spec §7). */
export const SPACE_SECTION_ORDER = ['tasks', 'boards', 'runs', 'automation', 'workflows', 'skills', 'files', 'artefacts', 'knowledge', 'workspaces', 'agents', 'secrets']

/** The personal project behind Chat: it holds the person's own tasks, boards and routines. */
export interface PersonalProject {
  id: string
  key: string
  tasks: { status: string; runState: string | null }[]
  boards: { id: string }[]
}

export interface ChatSpace {
  userId: string
  project: PersonalProject | undefined
  runs: unknown[] | undefined
  automationOn: boolean | undefined
  /** The site holding the person's own storage; null until it has been placed on one. */
  siteLabel: string | null
  filesCounts: FilesToolCounts
  /** Workflows in the person's own storage. */
  workflows?: PlaceTool
  /** Skills found in the person's own storage, with the ones that follow them. */
  skills?: PlaceTool
  /** Secrets and variables in the person's own storage. */
  secrets?: PlaceTool
}

/** Chat's facts (spec §7). The Site appears only once the person's storage has been placed on one. */
export function chatFacts(site: { id: string; label: string } | null | undefined): PlaceFact[] {
  return [
    { label: 'Who sees it', value: 'Only you' },
    { label: 'Agents', value: <ChatAgentsFact /> },
    { label: 'Personal projects', value: <PersonalProjectsFact /> },
    ...(site ? [{ label: 'Site', value: site.label }] : []),
    { label: 'Files', value: 'Your personal files' },
  ]
}

/** Agents opens from the fact, not from a row of its own: a personal space has no Agents row. It is the roster of the personal project behind the place. */
export function chatLinkedTools(projectId: string | undefined): PlaceTool[] {
  return [{ id: 'agents', label: 'Agents', render: () => <ChatAgentsTool projectId={projectId} /> }]
}

function loading() {
  return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
}

/**
 * Chat's tools (spec §7): Work, Agents at work, and Files. A personal
 * project has no people or settings of its own, so those tools are not here; its agents are the Agents tool.
 * The person is their space's only admin.
 */
export function chatToolGroups(space: ChatSpace): PlaceToolGroup[] {
  const { project } = space
  const tasks = project ? tasksCount(project.tasks) : undefined
  const runs = runsCount(space.runs)
  return [
    {
      label: 'Work',
      tools: [
        {
          id: 'tasks', label: 'Tasks', count: tasks?.count, tone: tasks?.needsYou ? 'needs' : undefined,
          render: () => (project ? <ProjectTasksPage projectKey={project.key} /> : loading()),
        },
        {
          id: 'boards', label: 'Boards', count: project ? String(project.boards.length) : undefined,
          render: () => (project ? <ProjectBoardsPage projectKey={project.key} renderTimeline={b => <BoardTimeline projectId={b.projectId} boardId={b.id} />} /> : loading()),
        },
      ],
    },
    {
      label: 'Agents at work',
      tools: [
        {
          id: 'runs', label: 'Runs', count: runs, tone: runs ? 'live' : undefined,
          render: () => (project ? <ProjectRunsTool projectId={project.id} /> : loading()),
        },
        {
          id: 'automation',
          label: 'Automation',
          count: space.automationOn === undefined ? undefined : space.automationOn ? 'On' : 'Off',
          tone: space.automationOn ? 'live' : undefined,
          render: () => (project ? <ProjectAutomationTool projectId={project.id} isProjectAdmin /> : loading()),
        },
        ...(space.workflows ? [space.workflows] : []),
        ...(space.skills ? [space.skills] : []),
      ],
      footer: project ? <ProjectRunControls projectId={project.id} isProjectAdmin personal /> : undefined,
    },
    filesToolGroup({ owner: { ownerType: 'user', ownerId: space.userId }, siteLabel: space.siteLabel, counts: space.filesCounts, personal: true }),
    ...(space.secrets ? [{ label: null, tools: [space.secrets] }] : []),
  ]
}
