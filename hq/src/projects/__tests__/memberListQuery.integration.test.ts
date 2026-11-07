/**
 * A project's Members as one list (getProjectMemberList), against the real test database: its people, agents and
 * teams merged, each with where it comes from (adr-0103), filtered, sorted and paged; members only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, ensureExecutionSite } from '../../test/factories'
import { as, setting, makeTeam } from '../../org/teams/__tests__/teamHarness'
import { makeTask } from './projectsHarness'

const channel = vi.hoisted(() => ({ isOnline: vi.fn(), request: vi.fn() }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: channel }))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { addTeamToProject } from '../../org/teams/projectTeamActions'
import { addProjectMember } from '../memberActions'
import { getProjectMemberList } from '../memberListQuery'

beforeEach(async () => {
  channel.isOnline.mockReset().mockReturnValue(false)
  await ensureExecutionSite({ siteId: 'site-1' })
})

/** A private project: its admin, an org admin, Dana only through Studio, Lee both ways, a direct agent and Studio's agent. */
async function project() {
  const s = await setting()
  const dana = await createUser({ displayName: 'Dana Fox' })
  const lee = await createUser({ displayName: 'Lee Park' })
  const reviewer = await createAgent({ name: 'Reviewer', handle: 'reviewer' })
  const writer = await createAgent({ name: 'Writer', handle: 'writer' })
  await addProjectMember({ projectId: s.project.id, userId: lee.id, role: 'ADMIN' }, as(s.projectAdmin))
  await prisma.projectAgent.create({ data: { projectId: s.project.id, agentId: reviewer.id } })
  const studio = await makeTeam(s.orgAdmin, [dana, lee], [writer], 'Studio')
  await addTeamToProject({ projectId: s.project.id, teamId: studio.id, role: 'MEMBER' }, as(s.projectAdmin))
  return { ...s, dana, lee, reviewer, writer, studio }
}

const list = (projectId: string, user: { id: string }, args: Record<string, unknown> = {}) =>
  getProjectMemberList({ projectId, ...args } as any, as(user))

describe('getProjectMemberList', () => {
  it('merges people, agents and teams into one list, each saying where it comes from', async () => {
    const p = await project()
    const view = await list(p.project.id, p.projectAdmin)
    expect(view.totals).toEqual({ everyone: 7, people: 4, agents: 2, teams: 1 })
    expect(view.canManagePeople).toBe(true)
    expect(view.canAssignAgents).toBe(true)
    const byName = new Map(view.rows.map(r => [r.name, r]))
    expect(byName.get('Dana Fox')).toMatchObject({ kind: 'person', role: 'MEMBER', ownRole: null, teams: [{ id: p.studio.id, name: 'Studio', role: 'MEMBER' }] })
    expect(byName.get('Lee Park')).toMatchObject({ kind: 'person', role: 'ADMIN', ownRole: 'ADMIN', teams: [{ name: 'Studio' }] })
    expect(byName.get('Writer')).toMatchObject({ kind: 'agent', direct: false, teams: [{ name: 'Studio' }] })
    expect(byName.get('Reviewer')).toMatchObject({ kind: 'agent', direct: true, teams: [] })
    expect(byName.get('Studio')).toMatchObject({ kind: 'team', role: 'MEMBER', peopleCount: 2, agentCount: 1 })
  })

  it('filters, searches and narrows to a team, counting what matches', async () => {
    const p = await project()
    const agents = await list(p.project.id, p.projectAdmin, { filter: 'agents' })
    expect(agents.rows.map(r => r.name)).toEqual(['Reviewer', 'Writer'])
    const searched = await list(p.project.id, p.projectAdmin, { search: 'park' })
    expect(searched.rows.map(r => r.name)).toEqual(['Lee Park'])
    expect(searched.counts).toEqual({ everyone: 1, people: 1, agents: 0, teams: 0 })
    const team = await list(p.project.id, p.projectAdmin, { teamId: p.studio.id })
    expect(team.rows.map(r => r.name)).toEqual(['Studio', 'Dana Fox', 'Lee Park', 'Writer'])
  })

  it('sorts by what needs someone first, and pages', async () => {
    const p = await project()
    await makeTask(p.project.id, { onBehalfOfUserId: p.dana.id, runState: 'RUN_BLOCKED', runStateReason: 'wants to run a command' })
    const needs = await list(p.project.id, p.projectAdmin, { sort: 'needs' })
    expect(needs.rows[0].name).toBe('Dana Fox')
    const first = await list(p.project.id, p.projectAdmin, { limit: 3 })
    const next = await list(p.project.id, p.projectAdmin, { offset: 3, limit: 3 })
    expect(first.total).toBe(7)
    expect([...first.rows, ...next.rows].map(r => r.id)).toHaveLength(6)
    expect(new Set([...first.rows, ...next.rows].map(r => r.id)).size).toBe(6)
  })

  it('gives a member who may not manage no add or change, and refuses someone not in the project as not found', async () => {
    const p = await project()
    const asDana = await list(p.project.id, p.dana)
    expect(asDana.canManagePeople).toBe(false)
    expect(asDana.canAssignAgents).toBe(false)
    expect(asDana.rows.filter(r => r.kind === 'person' && r.isMe).map(r => r.name)).toEqual(['Dana Fox'])
    const stranger = await createUser()
    await expect(list(p.project.id, stranger)).rejects.toMatchObject({ statusCode: 404 })
    await expect(list(p.project.id, p.projectAdmin, { sort: 'age' })).rejects.toMatchObject({ statusCode: 400 })
  })
})
