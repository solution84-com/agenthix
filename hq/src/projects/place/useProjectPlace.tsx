import {
  useQuery, getProjectByKey, getProjectMembers, getProjectPanelRows, getProjectActiveRuns, getAgents, getMyStorageSite,
} from 'wasp/client/operations'
import { useAuth } from 'wasp/client/auth'
import type { ProjectAgent } from '@agenthix/ui/projects'
import type { Place, PlaceAgent, PlaceToolGroup } from '../../places/placeTypes'
import { ProjectTasksPage } from '../pages/ProjectTasksPage'
import { ProjectBoardsPage } from '../pages/ProjectBoardsPage'
import { SprintsTool } from '../sprints/SprintsTool'
import { ProjectTimelineTool } from '../timeline/ProjectTimelineTool'
import { ProjectSettingsPage } from '../pages/ProjectSettingsPage'
import { filesToolGroup, useFilesToolCounts } from '../../storage/pages/filesToolGroup'
import type { FilesToolCounts } from '../../storage/pages/filesToolCounts'
import { useArtefactLinks } from '../../storage/pages/useArtefactLinks'
import { ProjectRunsTool } from '../../runs/pages/ProjectRunsTool'
import { WorkroomTool } from '../workroom/WorkroomTool'
import { RoutinesTool } from '../routines/RoutinesTool'
import { ProjectOverview } from './ProjectOverview'
import { memberAliases, teamRows, type PanelRows } from './teamRows'
import { ProjectAutomationTool } from './projectToolViews'
import { retryUnlessDenied } from './retryUnlessDenied'
import { boardsCount, runsCount, tasksCount } from './projectPlaceCounts'
import { useWorkflowsTool } from '../../workflows/pages/useWorkflowsTool'
import { useSecretsTool } from '../../secrets/pages/useSecretsTool'
import { useGitHubTool } from '../../github/components/useGitHubTool'
import type { PlaceTool } from '../../places/placeTypes'
import { chatLinkedTools, spacePlaceFields } from '../../chat/chatPlace'
import { useSkillsTool } from '../../assets/pages/place/useSkillsTool'
import { ProjectRunControls } from './ProjectRunControls'
import { PERSONAL_SECTION_ORDER, projectPlaceKind, type ProjectPlaceKind } from './placeKind'
import { projectFacts } from './projectPlaceFacts'

/** What the place reads from `getProjectByKey`, cast at the boundary. */
export interface ProjectPlaceData {
  id: string
  name: string
  key: string
  description: string | null
  /** Set on a personal project: only its owner uses it, with any agent, as themselves. */
  personalOwnerId: string | null
  /** Your space: drawn at `/space`, its storage the person's own. */
  personalSpace?: boolean
  defaultAgentId: string | null
  accessLevel: 'OPEN' | 'PRIVATE'
  lead: { userId: string; username: string } | null
  /** `warning`: its machine is nearly out of disk or memory, in a sentence (spec §10). */
  executionSite: { id: string; label: string; warning?: string | null } | null
  product: { id: string; name: string; slug: string } | null
  tasks: { state?: string | null; runState: string | null; archived?: boolean; doneAt?: Date | string | null }[]
  /** Its board rows: a saved board has `view`; one without is a deprecated board that owned its tasks. */
  boards: { id: string; view?: unknown }[]
  agents: (ProjectAgent & { agent: ProjectAgent['agent'] & { avatarUrl: string | null } })[]
}

type Member = { userId: string; role: 'ADMIN' | 'MEMBER' }

/** A project's sections after Overview and Conversations (spec §7). */
const PROJECT_SECTION_ORDER = [
  'tasks', 'boards', 'sprints', 'timeline', 'workroom', 'runs', 'routines', 'automation', 'workflows', 'skills', 'files', 'artefacts', 'knowledge', 'workspaces', 'members', 'github', 'secrets', 'settings',
]

/** The sections of each kind of project place, in order (Your space and a personal project share one menu). */
export function sectionOrderOf(kind: ProjectPlaceKind): string[] {
  return kind === 'shared' ? PROJECT_SECTION_ORDER : PERSONAL_SECTION_ORDER
}

/** What the tools of Your space differ by: its files are the person's own, on the site that holds them. */
type SpaceExtra = { userId: string; siteLabel: string | null }

export function projectTools(project: ProjectPlaceData, extra: {
  isProjectAdmin: boolean
  /** Set for Your space. */
  space?: SpaceExtra
  runs: unknown[] | undefined
  filesCounts: FilesToolCounts
  workflows: PlaceTool | undefined
  skills: PlaceTool | undefined
  secrets: PlaceTool | undefined
  github: PlaceTool | undefined
}): PlaceToolGroup[] {
  const personal = !!project.personalOwnerId
  const { space } = extra
  // Your space is drawn at `/space`, where no address names its project.
  const keyed = space ? project.key : undefined
  const tasks = tasksCount(project.tasks)
  const runs = runsCount(extra.runs)
  const work: PlaceToolGroup = {
    label: 'Work',
    tools: [
      { id: 'tasks', label: 'Tasks', count: tasks, render: () => <ProjectTasksPage projectKey={keyed} /> },
      { id: 'boards', label: 'Boards', count: String(boardsCount(project.boards)), render: () => <ProjectBoardsPage projectKey={keyed} /> },
      ...(personal ? [] : [{ id: 'sprints', label: 'Sprints', render: () => <SprintsTool projectKey={project.key} workroomHref={`/projects/${encodeURIComponent(project.key)}?tool=workroom`} /> }]),
      ...(personal ? [] : [{ id: 'timeline', label: 'Timeline', render: () => <ProjectTimelineTool projectId={project.id} /> }]),
    ],
  }
  const agentsAtWork: PlaceToolGroup = {
    label: 'Agents at work',
    tools: [
      // The Workroom is the live view, so it carries the running count; Runs is the history.
      ...(personal ? [] : [{
        id: 'workroom', label: 'Workroom', count: runs, tone: runs ? 'live' as const : undefined,
        render: () => <WorkroomTool projectId={project.id} projectKey={project.key} projectName={project.name} isProjectAdmin={extra.isProjectAdmin} />,
      }]),
      { id: 'runs', label: 'Runs', count: personal ? runs : undefined, tone: personal && runs ? 'live' : undefined, render: () => <ProjectRunsTool projectKey={project.key} personal={personal} /> },
      {
        id: 'routines', label: 'Routines',
        render: () => (space
          ? <RoutinesTool projectId={project.id} projectKey={project.key} placeName="Your space" place={{ key: null }} space />
          : <RoutinesTool projectId={project.id} projectKey={project.key} placeName={project.name} place={{ key: project.key }} />),
      },
      {
        id: 'automation',
        label: 'Automation',
        render: () => <ProjectAutomationTool projectId={project.id} isProjectAdmin={extra.isProjectAdmin} />,
      },
      ...(extra.workflows ? [extra.workflows] : []),
      ...(extra.skills ? [extra.skills] : []),
    ],
    footer: space ? <ProjectRunControls projectId={project.id} isProjectAdmin personal /> : undefined,
  }
  const settings: PlaceToolGroup = {
    label: null,
    tools: [
      ...(extra.github && !personal ? [extra.github] : []),
      ...(extra.secrets ? [extra.secrets] : []),
      { id: 'settings', label: 'Settings', render: () => <ProjectSettingsPage projectKey={project.key} /> },
    ],
  }
  // A personal project has storage of its own, on the site that holds the person's, and one member for good; Your
  // space works in the person's own storage.
  return [
    work,
    agentsAtWork,
    filesToolGroup({
      owner: space ? { ownerType: 'user', ownerId: space.userId } : { ownerType: 'project', ownerId: project.id },
      siteLabel: space ? space.siteLabel : project.executionSite?.label ?? null,
      counts: extra.filesCounts,
      personal,
    }),
    settings,
  ]
}

/**
 * A project as a place (spec §6, §7): its facts, its tools with their counts, the order of its sections, and the agents
 * its conversations may talk to — the project's own. A personal project and Your space (the personal project behind
 * Chat) are drawn the same way, less what concerns other people; Your space works in the person's own storage.
 */
export function useProjectPlace(key: string | undefined) {
  const { data, isLoading, error } = useQuery(getProjectByKey, key ? { key } : undefined, { enabled: !!key, retry: retryUnlessDenied })
  const project: ProjectPlaceData | undefined = data
  const projectId = project?.id
  const kind = project ? projectPlaceKind(project) : undefined
  const personal = kind === 'personal' || kind === 'space'
  const ownerId = kind === 'space' ? project?.personalOwnerId ?? undefined : undefined
  const { data: authUser } = useAuth()

  const { data: members } = useQuery(getProjectMembers, projectId ? { projectId } : undefined, { enabled: !!projectId && !personal })
  const { data: panelRows } = useQuery(getProjectPanelRows, projectId ? { projectId } : undefined, { enabled: !!projectId && !personal })
  const { data: runs } = useQuery(getProjectActiveRuns, projectId ? { projectId } : undefined, { enabled: !!projectId })
  // A personal project's conversations are the person's own, with any agent (spec §7).
  const { data: allAgents } = useQuery(getAgents, undefined, { enabled: personal })
  const { data: storageSite } = useQuery(getMyStorageSite, undefined, { enabled: kind === 'space' })
  useArtefactLinks()
  const filesCounts = useFilesToolCounts(ownerId ? { ownerType: 'user', ownerId } : project ? { ownerType: 'project', ownerId: project.id } : undefined)
  const storagePlace = ownerId ? { type: 'user' as const, id: ownerId } : project ? { type: 'project' as const, id: project.id } : undefined
  const workflows = useWorkflowsTool(storagePlace)
  const secrets = useSecretsTool(storagePlace)
  const skills = useSkillsTool(project ? {
    projectId: project.id,
    name: kind === 'space' ? 'Your space' : project.name,
    isSpace: kind === 'space',
    agents: (personal ? (allAgents ?? []).map((a) => ({ id: a.id, name: a.name })) : project.agents.map((a) => ({ id: a.agent.id, name: a.agent.name }))),
  } : undefined)
  const github = useGitHubTool(kind === 'shared' ? project : undefined)

  if (!project || !kind) return { project, place: undefined, isLoading, error }

  // A personal project's one member is its person, as its admin, for good.
  const isProjectAdmin = personal
    ? project.personalOwnerId === authUser?.id
    : !!(members as Member[] | undefined)?.some((m) => m.userId === authUser?.id && m.role === 'ADMIN')
  const agents: PlaceAgent[] = personal
    ? (allAgents ?? []).map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl }))
    : project.agents.map((a) => ({ id: a.agent.id, name: a.agent.name, avatarUrl: a.agent.avatarUrl }))
  const defaultAgent = project.agents.find((a) => a.agentId === project.defaultAgentId)?.agent.name
  const basePath = `/projects/${project.key}`
  const site = storageSite as { id: string; label: string } | null | undefined
  const space = kind === 'space' && ownerId ? { userId: ownerId, siteLabel: site?.label ?? null } : undefined

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
    facts: projectFacts(project, defaultAgent),
    teamRows: personal ? undefined : teamRows(project.id, panelRows as PanelRows | undefined),
    linkedTools: personal ? chatLinkedTools(project.id) : memberAliases(project.id),
    toolGroups: projectTools(project, {
      isProjectAdmin,
      space,
      runs: runs as unknown[] | undefined,
      filesCounts,
      workflows,
      skills,
      secrets,
      github,
    }),
    overview: <ProjectOverview project={project} kind={kind} isProjectAdmin={isProjectAdmin} />,
    sectionOrder: sectionOrderOf(kind),
    ...(kind === 'space' ? spacePlaceFields(agents, site) : {}),
  }
  return { project, place, isLoading, error }
}
