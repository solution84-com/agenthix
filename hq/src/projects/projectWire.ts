/**
 * A project, and a board's own fields, as the client protocol declares them (`@agenthix/core/client`): built
 * field by field from hq's rows, so a column added to the database reaches no client until it is declared there.
 */
import type { Board, Project, ProjectAgent, Task } from 'wasp/entities'
import type {
  AgentRef, BoardFields, ProjectAgentLink, ProjectDetail, ProjectFields, ProjectGroupRef, ProjectLeadView,
  ProjectListItem, ProjectRole, ProjectSiteShown, ProjectTask,
} from '@agenthix/core'
import { wireColumns } from './boardColumns'
import { agentRef, taskFields } from './taskWire'

export function projectFields(p: Project): ProjectFields {
  return {
    id: p.id, name: p.name, slug: p.slug, key: p.key, description: p.description,
    executionSiteId: p.executionSiteId, productId: p.productId, programId: p.programId,
    defaultAgentId: p.defaultAgentId, accessLevel: p.accessLevel, runTimeLimitMinutes: p.runTimeLimitMinutes,
    runTurnLimit: p.runTurnLimit, archiveFinishedAfterDays: p.archiveFinishedAfterDays,
    personalOwnerId: p.personalOwnerId, personalSpace: p.personalSpace, leadUserId: p.leadUserId, createdAt: p.createdAt, updatedAt: p.updatedAt,
  }
}

export function boardFields(b: Board): BoardFields {
  return {
    id: b.id, name: b.name, projectId: b.projectId, kind: b.kind, templateId: b.templateId,
    columns: wireColumns(b.columns), archivedAt: b.archivedAt, createdAt: b.createdAt, updatedAt: b.updatedAt,
  }
}

const groupRef = (g: ProjectGroupRef | null): ProjectGroupRef | null => (g ? { id: g.id, name: g.name, slug: g.slug } : null)

type ListedProject = Project & {
  boards: Array<{ id: string }>
  tasks: Array<Pick<Task, 'id' | 'status' | 'runState'>>
  product: ProjectGroupRef | null
  program: ProjectGroupRef | null
}

export function projectListItem(p: ListedProject, isMember: boolean, myRole: ProjectRole | null): ProjectListItem {
  return {
    ...projectFields(p),
    boards: p.boards.map(b => ({ id: b.id })),
    tasks: p.tasks.map(t => ({ id: t.id, status: t.status, runState: t.runState })),
    product: groupRef(p.product),
    program: groupRef(p.program),
    isMember,
    myRole,
  }
}

type OpenedProject = Project & {
  boards: Board[]
  tasks: Array<Task & { assignedAgent: AgentRef | null }>
  agents: Array<ProjectAgent & { agent: AgentRef & { avatarUrl: string | null } }>
  product: ProjectGroupRef | null
  program: ProjectGroupRef | null
}

function projectAgentLink(l: OpenedProject['agents'][number]): ProjectAgentLink {
  const { agent } = l
  return {
    projectId: l.projectId, agentId: l.agentId, direct: l.direct, createdAt: l.createdAt,
    agent: { id: agent.id, name: agent.name, handle: agent.handle, avatarUrl: agent.avatarUrl },
  }
}

function leadView(lead: ProjectLeadView | null): ProjectLeadView | null {
  if (!lead) return null
  const { person } = lead
  return {
    userId: lead.userId,
    username: lead.username,
    person: { userId: person.userId, name: person.name, handle: person.handle, avatarUrl: person.avatarUrl, state: person.state },
  }
}

/** `tasks` as the caller has them already, with a person's reason in place of a held task's stored one. */
export function projectDetail(
  p: OpenedProject,
  shown: { tasks: OpenedProject['tasks']; executionSite: ProjectSiteShown | null; lead: ProjectLeadView | null },
): ProjectDetail {
  return {
    ...projectFields(p),
    boards: p.boards.map(boardFields),
    tasks: shown.tasks.map((t): ProjectTask => ({ ...taskFields(t), assignedAgent: agentRef(t.assignedAgent) })),
    agents: p.agents.map(projectAgentLink),
    product: groupRef(p.product),
    program: groupRef(p.program),
    executionSite: shown.executionSite
      ? { id: shown.executionSite.id, label: shown.executionSite.label, warning: shown.executionSite.warning }
      : null,
    lead: leadView(shown.lead),
  }
}
