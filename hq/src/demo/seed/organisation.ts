import { builtInTaskTypes, idFor, rankBetween } from '@agenthix/core'
import type { SeedOrganisation } from '@agenthix/core'
import { seedPlanning } from './planning'
import type { SeedContext } from './types'

type Column = { id: string; state: string }
type TypeIds = { id: string; columns: Record<string, Column> }

/** The organisation, its people, agents, teams, projects, task types, tasks and routines. Tasks come after their epics. */
export async function seedOrganisation(c: SeedContext): Promise<void> {
  const o = c.seed.organisation
  await seedOrg(c, o)
  await seedPeople(c, o)
  await seedTeamsAndAgents(c, o)
  await seedProjects(c, o)
  const types = await seedTypes(c, o)
  await seedTasks(c, o, types)
  await seedTaskExtras(c, o)
  await seedPlanning(c, o)
  // Where each workspace on the site lives: hq's index of them. The site holds the workspaces' rows, from the same data.
  for (const w of c.seed.site.workspaces) await c.db.workspacePlacement.create({ data: { workspaceId: w.id, siteId: c.siteId } })
}

async function seedOrg(c: SeedContext, o: SeedOrganisation) {
  const { db } = c
  await db.org.updateMany({
    data: {
      name: o.org.name, handle: o.org.handle, mission: o.org.mission, vision: o.org.vision,
      setupCompletedAt: c.at(o.org.setupCompletedAt), timeZone: o.org.timeZone, automationAgentSchedules: o.org.agentSchedules,
    },
  })
}

async function seedPeople(c: SeedContext, o: SeedOrganisation) {
  const { db, deps } = c
  for (const p of o.people) {
    const providerData = JSON.stringify({ hashedPassword: await deps.hashPassword(deps.newPassword()) })
    // No one is a fleet admin: that mark is for the person who runs the machine, and the demo's visitors never do.
    await db.user.create({
      data: {
        id: p.id, displayName: p.displayName,
        pledgeDismissedAt: c.at(-1440),
        auth: { create: { identities: { create: { providerName: 'username', providerUserId: p.username, providerData } } } },
      },
    })
    await db.userSettings.create({ data: { userId: p.id, role: p.role, config: {}, timezone: o.org.timeZone, timezoneChosen: true } })
    await db.userStoragePlacement.create({ data: { userId: p.id, siteId: c.siteId } })
  }
}

async function seedTeamsAndAgents(c: SeedContext, o: SeedOrganisation) {
  const { db, ids } = c
  for (const a of o.agents) {
    await db.agent.create({ data: { id: a.id, name: a.name, handle: a.handle, role: a.role } })
    await c.deps.writeAgentInstructions(db, a.id, a.instructions)
  }
  for (const t of o.teams) {
    await db.team.create({
      data: {
        id: t.id, name: t.name, purpose: t.purpose, createdBy: idFor(ids.people, t.createdBy, 'person'),
        people: { create: t.people.map(p => ({ userId: idFor(ids.people, p, 'person') })) },
      },
    })
    for (const a of t.agents) await db.teamAgent.create({ data: { teamId: t.id, agentId: idFor(ids.agents, a, 'agent') } })
  }
}

async function seedProjects(c: SeedContext, o: SeedOrganisation) {
  const { db, ids } = c
  const agent = (key: string) => (key === 'kernel' ? c.kernelId : idFor(ids.agents, key, 'agent'))
  const admin = o.people.find(p => p.role === 'ADMIN')!.id
  for (const p of o.projects) {
    await db.project.create({
      data: {
        id: p.id, key: p.key, name: p.name, slug: p.slug, description: p.description,
        executionSiteId: c.siteId, leadUserId: idFor(ids.people, p.lead, 'person'), defaultAgentId: agent(p.defaultAgent),
        members: { create: p.members.map(m => ({ userId: idFor(ids.people, m.person, 'person'), role: m.role, ...(m.direct === undefined ? {} : { direct: m.direct }) })) },
        createdAt: c.at(p.createdAt),
        ...(p.private ? { accessLevel: 'PRIVATE' as const } : {}),
        ...(p.personalOwner ? { personalOwnerId: idFor(ids.people, p.personalOwner, 'person') } : {}),
        ...(p.agentSchedules ? { agentSchedules: true } : {}),
      },
    })
    if (p.teams.length) await db.projectTeam.createMany({ data: p.teams.map(t => ({ projectId: p.id, teamId: idFor(ids.teams, t.team, 'team'), role: t.role, addedById: admin })) })
    if (p.agents.length) await db.projectAgent.createMany({ data: p.agents.map(a => ({ projectId: p.id, agentId: agent(a) })) })
    if (p.pinnedBy.length) await db.pin.createMany({ data: p.pinnedBy.map((who, position) => ({ userId: idFor(ids.people, who, 'person'), kind: 'PROJECT' as const, itemId: p.id, position })) })
  }
}

async function makeType(c: SeedContext, projectId: string, t: { name: string; icon: string; kind: string; columns: { name: string; colour: string; state: string; defaultForState: boolean }[] }, order: number): Promise<TypeIds> {
  const made = await c.db.taskType.create({
    data: {
      projectId, name: t.name, icon: t.icon, kind: t.kind as 'TASK', order,
      columns: { create: t.columns.map((col, i) => ({ name: col.name, colour: col.colour, state: col.state as 'TODO', defaultForState: col.defaultForState, order: i })) },
    },
    include: { columns: true },
  })
  return { id: made.id, columns: Object.fromEntries(made.columns.map(col => [col.name, { id: col.id, state: col.state }])) }
}

async function seedTypes(c: SeedContext, o: SeedOrganisation): Promise<Record<string, TypeIds>> {
  const types: Record<string, TypeIds> = {}
  for (const p of o.projects) {
    for (const [order, t] of builtInTaskTypes().entries()) types[`${p.key}:${t.kind}`] = await makeType(c, p.id, t, order)
  }
  for (const t of o.taskTypes) {
    const made = await makeType(c, idFor(c.ids.projects, t.project, 'project'), { ...t, kind: 'CUSTOM' }, 2)
    types[`${t.project}:${t.key}`] = made
    if (t.board) await c.db.board.create({ data: { id: t.board.id, name: t.board.name, projectId: idFor(c.ids.projects, t.project, 'project'), view: 'TYPE', typeId: made.id } })
  }
  for (const m of o.milestones) await c.db.milestone.create({ data: { id: m.id, projectId: idFor(c.ids.projects, m.project, 'project'), name: m.name, date: c.at(m.at) } })
  return types
}

/** The data lists an epic before the tasks in it, as the database needs. */
async function seedTasks(c: SeedContext, o: SeedOrganisation, types: Record<string, TypeIds>) {
  const { db, ids } = c
  let rank: string | null = null
  for (const t of o.tasks) {
    const type = types[`${t.project}:${t.type}`]
    if (!type) throw new Error(`The demo seed's task ${t.key} has a type ${t.type} that its project does not have.`)
    const placed = type.columns[t.column ?? 'Backlog']
    if (!placed) throw new Error(`The demo seed's task ${t.key} is in a column ${t.column} that its type does not have.`)
    rank = rankBetween(rank, null)
    const milestone = t.milestone ? { milestoneId: t.milestone } : {}
    await db.task.create({
      data: {
        id: t.id, projectId: idFor(ids.projects, t.project, 'project'), number: t.number, title: t.title, description: t.description,
        typeId: type.id, columnId: placed.id, state: placed.state as 'TODO', rank,
        assignedAgentId: t.agent ? (t.agent === 'kernel' ? c.kernelId : idFor(ids.agents, t.agent, 'agent')) : null,
        priority: t.priority, onBehalfOfUserId: idFor(ids.people, t.person, 'person'),
        doneAt: t.doneAt !== undefined ? c.at(t.doneAt) : null,
        createdAt: c.at(t.createdAt),
        ...(t.epic ? { epicId: idFor(ids.tasks, t.epic, 'task') } : {}),
        ...(t.planStart !== undefined ? { planStart: c.at(t.planStart) } : {}),
        ...(t.planFinish !== undefined ? { planFinish: c.at(t.planFinish) } : {}),
        ...milestone,
        ...(t.labels ? { labels: t.labels } : {}),
        ...(t.runState ? { runState: t.runState } : {}),
        ...(t.runStateReason ? { runStateReason: t.runStateReason } : {}),
        ...(t.runStartedBy ? { runStartedBy: t.runStartedBy } : {}),
        ...(t.scheduleAt !== undefined ? { runState: 'RUN_NONE' as const, scheduleAt: c.at(t.scheduleAt), scheduleNextDueAt: c.at(t.scheduleAt) } : {}),
      },
    })
  }
}

async function seedTaskExtras(c: SeedContext, o: SeedOrganisation) {
  const { db, ids } = c
  if (o.comments.length) {
    await db.taskComment.createMany({
      data: o.comments.map(m => ({
        taskId: idFor(ids.tasks, m.task, 'task'), content: m.content, createdAt: c.at(m.at),
        ...('person' in m.by
          ? { authorType: 'USER' as const, userId: idFor(ids.people, m.by.person, 'person') }
          : { authorType: 'AGENT' as const, agentId: idFor(ids.agents, m.by.agent, 'agent') }),
      })),
    })
  }
  for (const a of o.attachments) {
    await db.taskAttachment.create({
      data: { taskId: idFor(ids.tasks, a.task, 'task'), uuid: a.uuid, fileName: a.fileName, fileSizeBytes: a.sizeBytes, createdAt: c.at(a.at) },
    })
  }
  for (const r of o.routines) {
    const common = { onBehalfOfUserId: idFor(ids.people, r.person, 'person'), agentId: idFor(ids.agents, r.agent, 'agent') }
    await db.routine.create({
      data: {
        id: r.id, projectId: idFor(ids.projects, r.project, 'project'), title: r.title, instructions: r.instructions, agentId: common.agentId,
        cron: r.cron, timezone: o.org.timeZone, enabled: true, nextDueAt: c.at(r.nextDueAt), onBehalfOfUserId: common.onBehalfOfUserId,
        createdByUserId: common.onBehalfOfUserId,
      },
    })
    for (const run of r.runs) {
      await db.routineRun.create({
        data: { id: run.id, routineId: r.id, number: run.number, dueAt: c.at(run.dueAt), onBehalfOfUserId: common.onBehalfOfUserId, state: 'FINISHED', startedAt: c.at(run.startedAt), endedAt: c.at(run.endedAt) },
      })
    }
  }
}
