import {
  useQuery, getProjectByKey, getProjectMembers, getProjectPanelRows, getProjectActiveRuns, getProjectAutomation, getAgents,
} from 'wasp/client/operations'
import { useAuth } from 'wasp/client/auth'
import type { ProjectAgent } from '@agenthix/ui/projects'
import type { Place, PlaceAgent, PlaceToolGroup } from '../../places/placeTypes'
import { ProjectTasksPage } from '../pages/ProjectTasksPage'
import { ProjectBoardsPage } from '../pages/ProjectBoardsPage'
import { ProjectTimelineTool } from '../timeline/ProjectTimelineTool'
import { BoardTimeline } from '../timeline/BoardTimeline'
import { ProjectSettingsPage } from '../pages/ProjectSettingsPage'
import { filesToolGroup, useFilesToolCounts } from '../../storage/pages/filesToolGroup'
import type { FilesToolCounts } from '../../storage/pages/filesToolCounts'
import { useArtefactLinks } from '../../storage/pages/useArtefactLinks'
import { ProjectRunsTool } from './ProjectRunsTool'
import { ProjectRunControls } from './ProjectRunControls'
import { memberAliases, teamRows, type PanelRows } from './teamRows'
import { ProjectAutomationTool } from './projectToolViews'
import { ProjectMemoryTool } from '../../memory/screen/pages/ProjectMemoryTool'
import { retryUnlessDenied } from './retryUnlessDenied'
import { runsCount, tasksCount } from './projectPlaceCounts'
import { useWorkflowsTool } from '../../workflows/pages/useWorkflowsTool'
import { useSecretsTool } from '../../secrets/pages/useSecretsTool'
import { useGitHubTool } from '../../github/components/useGitHubTool'
import type { PlaceTool } from '../../places/placeTypes'
import { ChatAgentsFact } from '../../chat/ChatAgentsFact'
import { chatLinkedTools } from '../../chat/chatPlace'

/** The project's site, and under it the warning when its machine is nearly out of disk or memory. */
function SiteFact({ site }: { site: ProjectPlaceData['executionSite'] }) {
  if (!site) return <>None</>
  return (
    <>
      {site.label}
      {site.warning && <span role="status" className="mt-0.5 block text-small text-warning">{site.warning}</span>}
    </>
  )
}

/** What the place reads from `getProjectByKey`, cast at the boundary. */
export interface ProjectPlaceData {
  id: string
  name: string
  key: string
  description: string | null
  /** Set on a personal project: only its owner uses it, with any agent, as themselves. */
  personalOwnerId: string | null
  /** Your space, which is shown as Chat rather than as a project. */
  personalSpace?: boolean
  defaultAgentId: string | null
  accessLevel: 'OPEN' | 'PRIVATE'
  lead: { userId: string; username: string } | null
  /** `warning`: its machine is nearly out of disk or memory, in a sentence (spec §10). */
  executionSite: { id: string; label: string; warning?: string | null } | null
  product: { id: string; name: string; slug: string } | null
  tasks: { status: string; runState: string | null }[]
  boards: { id: string }[]
  agents: (ProjectAgent & { agent: ProjectAgent['agent'] & { avatarUrl: string | null } })[]
}

type Member = { userId: string; role: 'ADMIN' | 'MEMBER' }

/** A project's sections after Overview and Conversations (spec §7). Memory is there for its admins only. */
const PROJECT_SECTION_ORDER = [
  'tasks', 'boards', 'timeline', 'runs', 'automation', 'workflows', 'files', 'artefacts', 'knowledge', 'workspaces', 'members', 'github', 'secrets', 'settings', 'memory',
]

/** A personal project's: those of Your space, and Settings. No Members, no Timeline. */
const PERSONAL_SECTION_ORDER = ['tasks', 'boards', 'runs', 'automation', 'workflows', 'files', 'artefacts', 'knowledge', 'workspaces', 'agents', 'secrets', 'settings']

function projectTools(project: ProjectPlaceData, extra: {
  isProjectAdmin: boolean
  runs: unknown[] | undefined
  automationOn: boolean | undefined
  filesCounts: FilesToolCounts
  workflows: PlaceTool | undefined
  secrets: PlaceTool | undefined
  github: PlaceTool | undefined
}): PlaceToolGroup[] {
  const personal = !!project.personalOwnerId
  const tasks = tasksCount(project.tasks)
  const runs = runsCount(extra.runs)
  const work: PlaceToolGroup = {
    label: 'Work',
    tools: [
      { id: 'tasks', label: 'Tasks', count: tasks.count, tone: tasks.needsYou ? 'needs' : undefined, render: () => <ProjectTasksPage /> },
      { id: 'boards', label: 'Boards', count: String(project.boards.length), render: () => <ProjectBoardsPage renderTimeline={b => <BoardTimeline projectId={b.projectId} boardId={b.id} />} /> },
      ...(personal ? [] : [{ id: 'timeline', label: 'Timeline', render: () => <ProjectTimelineTool projectId={project.id} /> }]),
    ],
  }
  const agentsAtWork: PlaceToolGroup = {
    label: 'Agents at work',
    tools: [
      { id: 'runs', label: 'Runs', count: runs, tone: runs ? 'live' : undefined, render: () => <ProjectRunsTool projectId={project.id} /> },
      {
        id: 'automation',
        label: 'Automation',
        count: extra.automationOn === undefined ? undefined : extra.automationOn ? 'On' : 'Off',
        tone: extra.automationOn ? 'live' : undefined,
        render: () => <ProjectAutomationTool projectId={project.id} isProjectAdmin={extra.isProjectAdmin} />,
      },
      ...(extra.workflows ? [extra.workflows] : []),
      ...(extra.isProjectAdmin && !personal
        ? [{ id: 'memory', label: 'Memory', render: () => <ProjectMemoryTool projectId={project.id} /> }]
        : []),
    ],
    footer: <ProjectRunControls projectId={project.id} isProjectAdmin={extra.isProjectAdmin} />,
  }
  const settings: PlaceToolGroup = {
    label: null,
    tools: [
      ...(extra.github && !personal ? [extra.github] : []),
      ...(extra.secrets ? [extra.secrets] : []),
      { id: 'settings', label: 'Settings', render: () => <ProjectSettingsPage /> },
    ],
  }
  // A personal project has storage of its own, on the site that holds the person's, and one member for good.
  return [
    work,
    agentsAtWork,
    filesToolGroup({
      owner: { ownerType: 'project', ownerId: project.id },
      siteLabel: project.executionSite?.label ?? null,
      counts: extra.filesCounts,
      personal,
    }),
    settings,
  ]
}

/**
 * A project as a place (spec §6, §7): its facts, its tools with their counts, the order of its sections, and the agents
 * its conversations may talk to — the project's own.
 */
export function useProjectPlace(key: string | undefined) {
  const { data, isLoading, error } = useQuery(getProjectByKey, key ? { key } : undefined, { enabled: !!key, retry: retryUnlessDenied })
  const project: ProjectPlaceData | undefined = data
  const projectId = project?.id
  const personal = !!project?.personalOwnerId
  const { data: authUser } = useAuth()

  const { data: members } = useQuery(getProjectMembers, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const { data: panelRows } = useQuery(getProjectPanelRows, projectId ? { projectId } : undefined, { enabled: !!projectId && !personal })
  const { data: runs } = useQuery(getProjectActiveRuns, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const { data: automation } = useQuery(getProjectAutomation, projectId ? { projectId } : undefined, { enabled: !!projectId })
  // A personal project's conversations are the person's own, with any agent (spec §7).
  const { data: allAgents } = useQuery(getAgents, undefined, { enabled: personal })
  useArtefactLinks()
  const filesCounts = useFilesToolCounts(project ? { ownerType: 'project', ownerId: project.id } : undefined)
  const workflows = useWorkflowsTool(project ? { type: 'project', id: project.id } : undefined)
  const secrets = useSecretsTool(project ? { type: 'project', id: project.id } : undefined)
  const github = useGitHubTool(project)

  if (!project) return { project, place: undefined, isLoading, error }

  const typedMembers = members as Member[] | undefined
  const isProjectAdmin = !!typedMembers?.some((m) => m.userId === authUser?.id && m.role === 'ADMIN')
  const agents: PlaceAgent[] = personal
    ? (allAgents ?? []).map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl }))
    : project.agents.map((a) => ({ id: a.agent.id, name: a.agent.name, avatarUrl: a.agent.avatarUrl }))
  const defaultAgent = project.agents.find((a) => a.agentId === project.defaultAgentId)?.agent.name
  const basePath = `/projects/${project.key}`

  const place: Place = {
    basePath,
    homePath: basePath,
    breadcrumbs: [{ label: 'Projects', href: '/projects' }, { label: project.name, href: basePath }],
    name: project.name,
    talkLabel: `Talk about ${project.name}`,
    factsHeading: 'About this project',
    description: project.description,
    backHref: '/projects',
    projectId: project.id,
    sessionLocation: { primaryOwnerType: 'project', primaryOwnerId: project.id },
    agents,
    defaultAgentId: project.defaultAgentId,
    composerPlaceholder: 'Talk about this project…',
    noAgentsNotice: 'Add an agent to this project to talk to it',
    facts: personal
      ? [
          { label: 'Who sees it', value: 'Only you' },
          { label: 'Agents', value: <ChatAgentsFact /> },
          { label: 'Site', value: <SiteFact site={project.executionSite} /> },
        ]
      : [
          { label: 'Lead', value: project.lead?.username ?? 'None' },
          { label: 'Site', value: <SiteFact site={project.executionSite} /> },
          { label: 'Default agent', value: defaultAgent ?? 'None' },
          { label: 'Product', value: project.product?.name ?? 'None' },
          { label: 'Access', value: project.accessLevel === 'PRIVATE' ? 'Private' : 'Open' },
        ],
    teamRows: personal ? undefined : teamRows(project.id, panelRows as PanelRows | undefined),
    linkedTools: personal ? chatLinkedTools : memberAliases(project.id),
    toolGroups: projectTools(project, {
      isProjectAdmin,
      runs: runs as unknown[] | undefined,
      automationOn: (automation as { effective?: { enabled: boolean } } | undefined)?.effective?.enabled,
      filesCounts,
      workflows,
      secrets,
      github,
    }),
    sectionOrder: personal ? PERSONAL_SECTION_ORDER : PROJECT_SECTION_ORDER,
  }
  return { project, place, isLoading, error }
}
