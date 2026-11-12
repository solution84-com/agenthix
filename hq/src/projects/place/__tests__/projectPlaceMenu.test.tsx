import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/client/operations', () => ({}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: null }) }))
const { none } = vi.hoisted(() => ({ none: () => null }))
vi.mock('../../pages/ProjectTasksPage', () => ({ ProjectTasksPage: none }))
vi.mock('../../pages/ProjectBoardsPage', () => ({ ProjectBoardsPage: none }))
vi.mock('../../sprints/SprintsTool', () => ({ SprintsTool: none }))
vi.mock('../../timeline/ProjectTimelineTool', () => ({ ProjectTimelineTool: none }))
vi.mock('../../pages/ProjectSettingsPage', () => ({ ProjectSettingsPage: none }))
vi.mock('../../../runs/pages/ProjectRunsTool', () => ({ ProjectRunsTool: none }))
vi.mock('../../workroom/WorkroomTool', () => ({ WorkroomTool: none }))
vi.mock('../../routines/RoutinesTool', () => ({ RoutinesTool: none }))
vi.mock('../ProjectOverview', () => ({ ProjectOverview: none }))
vi.mock('../ProjectRunControls', () => ({ ProjectRunControls: none }))
vi.mock('../projectToolViews', () => ({ ProjectAutomationTool: none }))
vi.mock('../teamRows', () => ({ teamRows: () => [], memberAliases: () => [] }))
vi.mock('../../../workflows/pages/useWorkflowsTool', () => ({ useWorkflowsTool: none }))
vi.mock('../../../secrets/pages/useSecretsTool', () => ({ useSecretsTool: none }))
vi.mock('../../../github/components/useGitHubTool', () => ({ useGitHubTool: none }))
vi.mock('../../../assets/pages/place/useSkillsTool', () => ({ useSkillsTool: none }))
vi.mock('../../../storage/pages/useArtefactLinks', () => ({ useArtefactLinks: none }))
vi.mock('../../../chat/ChatAgentsTool', () => ({ ChatAgentsTool: none }))
vi.mock('../../../chat/ChatAgentsFact', () => ({ ChatAgentsFact: none }))
vi.mock('../PersonalProjectsFact', () => ({ PersonalProjectsFact: none }))
vi.mock('../../../sites/scheduled/SiteScheduleFact', () => ({ SiteScheduleFact: none }))
vi.mock('../../../storage/pages/filesToolGroup', () => ({
  useFilesToolCounts: () => ({}),
  filesToolGroup: ({ owner }: { owner: { ownerType: string } }) => ({
    label: 'Files',
    tools: ['files', 'artefacts', 'knowledge', 'workspaces'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1), owner: owner.ownerType, render: () => null })),
  }),
}))

import { projectTools, sectionOrderOf, type ProjectPlaceData } from '../useProjectPlace'
import { projectPlaceKind, type ProjectPlaceKind } from '../placeKind'
import { chatLinkedTools } from '../../../chat/chatPlace'
import { placeSections } from '../../../places/placeSections'
import { testPlace } from '../../../places/__tests__/placeFixture'
import type { PlaceTool } from '../../../places/placeTypes'

const tool = (id: string, label: string): PlaceTool => ({ id, label, render: () => null })

function project(kind: ProjectPlaceKind): ProjectPlaceData {
  return {
    id: 'p1', name: 'My Project', key: 'MP', description: null, personalOwnerId: kind === 'shared' ? null : 'u1',
    personalSpace: kind === 'space', defaultAgentId: null, accessLevel: 'PRIVATE', lead: null, executionSite: null,
    product: null, tasks: [], boards: [], agents: [],
  }
}

/** The side menu of each kind of project place, as the person sees it: Overview, Conversations, then its sections. */
function menu(kind: ProjectPlaceKind) {
  const p = project(kind)
  const personal = kind !== 'shared'
  const place = testPlace({
    teamRows: personal ? undefined : [tool('members', 'Members')],
    linkedTools: personal ? chatLinkedTools(p.id) : [],
    toolGroups: projectTools(p, {
      isProjectAdmin: true,
      space: kind === 'space' ? { userId: 'u1', siteLabel: null } : undefined,
      runs: [], filesCounts: {},
      workflows: tool('workflows', 'Workflows'), skills: tool('skills', 'Skills'),
      secrets: tool('secrets', 'Vault'), github: tool('github', 'GitHub'),
    }),
    sectionOrder: sectionOrderOf(kind),
  })
  return placeSections(place).map((s) => s.label)
}

const PERSONAL_MENU = [
  'Overview', 'Conversations', 'Tasks', 'Boards', 'Runs', 'Routines', 'Automation', 'Workflows', 'Skills',
  'Files', 'Artefacts', 'Knowledge', 'Workspaces', 'Agents', 'Vault', 'Settings',
]

describe('the side menu of a project place @SC-2114 @SC-2118', () => {
  it('names the kind: shared, personal, or Your space', () => {
    expect(projectPlaceKind({ personalOwnerId: null })).toBe('shared')
    expect(projectPlaceKind({ personalOwnerId: 'u1', personalSpace: false })).toBe('personal')
    expect(projectPlaceKind({ personalOwnerId: 'u1', personalSpace: true })).toBe('space')
  })

  it('gives Your space and a personal project one menu, with Settings', () => {
    expect(menu('space')).toEqual(PERSONAL_MENU)
    expect(menu('personal')).toEqual(PERSONAL_MENU)
  })

  it('is a shared project’s, less Sprints, Timeline, Workroom, Members and GitHub, in the same order', () => {
    const shared = menu('shared')
    for (const left of ['Sprints', 'Timeline', 'Workroom', 'Members', 'GitHub']) expect(shared).toContain(left)
    const withoutTeam = shared.filter((l) => !['Sprints', 'Timeline', 'Workroom', 'GitHub', 'Memory'].includes(l))
    expect(withoutTeam).toEqual(PERSONAL_MENU.map((l) => (l === 'Agents' ? 'Members' : l)))
  })

  it('keeps the run controls under Agents at work in Your space only', () => {
    const footer = (kind: ProjectPlaceKind) => projectTools(project(kind), {
      isProjectAdmin: true, space: kind === 'space' ? { userId: 'u1', siteLabel: null } : undefined,
      runs: [], filesCounts: {}, workflows: undefined, skills: undefined, secrets: undefined, github: undefined,
    }).find((g) => g.label === 'Agents at work')?.footer
    expect(footer('space')).toBeTruthy()
    expect(footer('personal')).toBeUndefined()
  })

  it("draws Your space's files from the person's own storage, a personal project's from its own", () => {
    const owner = (kind: ProjectPlaceKind) => (projectTools(project(kind), {
      isProjectAdmin: true, space: kind === 'space' ? { userId: 'u1', siteLabel: null } : undefined,
      runs: [], filesCounts: {}, workflows: undefined, skills: undefined, secrets: undefined, github: undefined,
    }).find((g) => g.label === 'Files')?.tools[0] as unknown as { owner: string }).owner
    expect(owner('space')).toBe('user')
    expect(owner('personal')).toBe('project')
  })
})
