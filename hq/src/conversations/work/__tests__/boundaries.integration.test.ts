/**
 * The boundaries a person and an agent share, and the three checks that admit work to one (conversation layer
 * spec, Commissioning outside the place), against the real test database: the person is a member there, the
 * agent is assigned there, and the tool is allowed there with the boundary's override on top — each refusal in
 * the lead's words.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { admitToBoundary, admittedBoundaries, personalBoundary, placesNamed, sharedBoundaries, unassignedProjects } from '../boundaries'
import type { SharedBoundary } from '../../contract'

let person: { id: string }
let agent: { id: string }
let shop: { id: string; key: string; name: string }

beforeEach(async () => {
  person = await createUserWithRole('MEMBER')
  agent = await createAgent({ name: 'Developer' })
  shop = await createProject({ name: 'Shop' })
  await joinProjectAs(shop.id, person.id, 'MEMBER')
  await prisma.projectAgent.create({ data: { projectId: shop.id, agentId: agent.id } })
})

const asBoundary = (p: { id: string; key: string; name: string }): SharedBoundary => ({ key: p.key, type: 'project', id: p.id, name: p.name })
const admit = (boundary: SharedBoundary, tool = 'start_work', personId = person.id) =>
  admitToBoundary({ personId, agentId: agent.id, boundary, tool })

describe('the boundaries a person and an agent share @SC-961', () => {
  it("are the person's own space, then each project they work in that the agent is assigned to", async () => {
    const finance = await createProject({ name: 'Finance' })
    await joinProjectAs(finance.id, person.id, 'ADMIN')
    await prisma.projectAgent.create({ data: { projectId: finance.id, agentId: agent.id } })
    const shared = await sharedBoundaries(person.id, agent.id)
    expect(shared.map(b => b.name)).toEqual(['your space', 'Finance', 'Shop'])
    expect(shared[0]).toEqual({ key: 'personal', type: 'user', id: person.id, name: 'your space' })
    expect(shared[2]).toEqual(asBoundary(shop))
  })

  it('leave out a project the person only reads, one they are not in, one the agent is not on, and a personal project', async () => {
    const readOnly = await createProject({ name: 'Read only' })
    await joinProjectAs(readOnly.id, person.id, 'VIEWER')
    await prisma.projectAgent.create({ data: { projectId: readOnly.id, agentId: agent.id } })
    const notIn = await createProject({ name: 'Not in' })
    await prisma.projectAgent.create({ data: { projectId: notIn.id, agentId: agent.id } })
    const noAgent = await createProject({ name: 'No agent' })
    await joinProjectAs(noAgent.id, person.id, 'MEMBER')
    await createProject({ name: 'Own', personalOwnerId: person.id })
    expect((await sharedBoundaries(person.id, agent.id)).map(b => b.name)).toEqual(['your space', 'Shop'])
  })

  it("are found by key without case, a project's whether or not it is shared, and the person's own space as personal", async () => {
    const finance = await createProject({ name: 'Finance' })
    expect(await placesNamed(person.id, shop.key.toLowerCase())).toEqual([asBoundary(shop)])
    expect(await placesNamed(person.id, finance.key)).toEqual([asBoundary(finance)])
    expect(await placesNamed(person.id, 'Personal')).toEqual([personalBoundary(person.id)])
    expect(await placesNamed(person.id, 'NOPE')).toEqual([])
  })

  it('are found by name too, without case, as "the … project" or quoted', async () => {
    for (const words of ['Shop', 'shop', 'the Shop project', '"Shop"']) {
      expect(await placesNamed(person.id, words)).toEqual([asBoundary(shop)])
    }
  })

  it('by a name several projects share: those the person works in, or all of them when none', async () => {
    const mine = await createProject({ name: 'Twin' })
    await createProject({ name: 'Twin' })
    await joinProjectAs(mine.id, person.id, 'MEMBER')
    expect(await placesNamed(person.id, 'Twin')).toEqual([asBoundary(mine)])
    const third = await createProject({ name: 'Triplet' })
    const fourth = await createProject({ name: 'Triplet' })
    expect((await placesNamed(person.id, 'Triplet')).map(b => b.id).sort()).toEqual([third.id, fourth.id].sort())
  })

  it('leave apart the projects the person works in that the agent is not assigned to', async () => {
    const walkthrough = await createProject({ name: 'Walkthrough' })
    await joinProjectAs(walkthrough.id, person.id, 'ADMIN')
    await createProject({ name: 'Not in' })
    const viewer = await createProject({ name: 'Viewer' })
    await joinProjectAs(viewer.id, person.id, 'VIEWER')
    await createProject({ name: 'Own', personalOwnerId: person.id })
    expect(await unassignedProjects(person.id, agent.id)).toEqual([asBoundary(walkthrough)])
  })
})

describe('admission to a boundary @SC-961', () => {
  it('admits work in a shared project and in the person\'s own space', async () => {
    expect(await admit(asBoundary(shop))).toEqual({ ok: true })
    expect(await admit(personalBoundary(person.id))).toEqual({ ok: true })
  })

  it('refuses a project the person is not a member of, or only reads, in words the lead can say', async () => {
    const finance = await createProject({ name: 'Finance' })
    await prisma.projectAgent.create({ data: { projectId: finance.id, agentId: agent.id } })
    expect(await admit(asBoundary(finance))).toEqual({ ok: false, reason: "you're not a member of Finance" })
    await joinProjectAs(finance.id, person.id, 'VIEWER')
    expect(await admit(asBoundary(finance))).toEqual({ ok: false, reason: 'you can only read Finance, not start work there' })
  })

  it("refuses someone else's space, and a person who has left the organisation", async () => {
    const other = await createUserWithRole('MEMBER')
    expect(await admit(personalBoundary(other.id))).toEqual({ ok: false, reason: "that space is someone else's" })
    await prisma.user.update({ where: { id: person.id }, data: { deactivatedAt: new Date() } })
    expect(await admit(asBoundary(shop))).toEqual({ ok: false, reason: "you're no longer in the organisation" })
  })

  it('refuses a project the agent is not assigned to', async () => {
    const finance = await createProject({ name: 'Finance' })
    await joinProjectAs(finance.id, person.id, 'MEMBER')
    expect(await admit(asBoundary(finance))).toEqual({
      ok: false,
      reason: "Developer isn't assigned to Finance; a project admin can assign Developer there: in Finance, open Members, select ＋ Add, then An agent, and Assign beside Developer",
    })
  })

  it("refuses starting work where the boundary's override sets the start-work tool to Never, and only there", async () => {
    await prisma.agentOverride.create({
      data: { boundaryType: 'project', boundaryId: shop.id, agentId: agent.id, allowedTools: [{ name: 'start_work', state: 'never' }] },
    })
    expect(await admit(asBoundary(shop))).toEqual({ ok: false, reason: "Developer isn't allowed to start work in Shop" })
    expect(await admit(personalBoundary(person.id))).toEqual({ ok: true })
    expect((await admittedBoundaries(person.id, agent.id)).map(b => b.name)).toEqual(['your space'])
  })

  it("checks another tool by its own name, the agent's own Never binding everywhere", async () => {
    await prisma.agent.update({ where: { id: agent.id }, data: { allowedTools: [{ name: 'create_task', state: 'never' }] } })
    expect(await admit(asBoundary(shop), 'create_task')).toEqual({ ok: false, reason: "Developer isn't allowed to use create_task in Shop" })
    expect(await admit(asBoundary(shop))).toEqual({ ok: true })
  })
})
