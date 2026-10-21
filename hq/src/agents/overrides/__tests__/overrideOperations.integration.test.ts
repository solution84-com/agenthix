/**
 * Integration tests (ADR-0094 — real test DB) for the override operations: getAgentOverride and
 * setAgentOverride, on a person's own boundary and on a project's. A project's overrides are its
 * admin's (spec §6.4); a personal project takes none.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUser } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { getAgentOverride, setAgentOverride } from '../overrideOperations'

const ctxFor = (user: { id: string } | undefined) => ({ user, entities: {} }) as any
const values = {
  model: null,
  approval: 'immediate' as const,
  allowedTools: [{ name: 'read_file', state: 'never' as const }],
  allowedBashPatterns: [{ pattern: 'git push', state: 'ask' as const }],
}
const none = { model: null, approval: null, allowedTools: null, allowedBashPatterns: null }

async function projectWith(role: 'ADMIN' | 'MEMBER', opts: { assigned?: boolean; personalOwner?: boolean } = {}) {
  const user = await createUser()
  const agent = await createAgent()
  const project = await createProject(opts.personalOwner ? { personalOwnerId: user.id } : {})
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role } })
  if (opts.assigned !== false) await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
  const args = { boundaryType: 'project' as const, boundaryId: project.id, agentId: agent.id }
  return { user, agent, project, args, ctx: ctxFor(user) }
}

describe('setAgentOverride on a person\'s own boundary @SC-615', () => {
  it('stores the override and reads it back', async () => {
    const user = await createUser()
    const agent = await createAgent()
    const args = { boundaryType: 'user' as const, boundaryId: user.id, agentId: agent.id }

    expect(await getAgentOverride(args, ctxFor(user))).toBeNull()
    expect(await setAgentOverride({ ...args, ...values }, ctxFor(user))).toEqual(values)
    expect(await getAgentOverride(args, ctxFor(user))).toEqual(values)

    const row = await prisma.agentOverride.findFirstOrThrow()
    expect(row).toMatchObject({ boundaryType: 'user', boundaryId: user.id, agentId: agent.id, approval: 'immediate', allowedTools: values.allowedTools, allowedBashPatterns: values.allowedBashPatterns, updatedById: user.id })
  })

  it('replaces the stored override rather than adding a second', async () => {
    const user = await createUser()
    const agent = await createAgent()
    const args = { boundaryType: 'user' as const, boundaryId: user.id, agentId: agent.id }

    await setAgentOverride({ ...args, ...values }, ctxFor(user))
    await setAgentOverride({ ...args, ...none, approval: 'deferred' }, ctxFor(user))

    expect(await prisma.agentOverride.count()).toBe(1)
    expect(await getAgentOverride(args, ctxFor(user))).toEqual({ ...none, approval: 'deferred' })
  })

  it('removes the stored override when every field is cleared', async () => {
    const user = await createUser()
    const agent = await createAgent()
    const args = { boundaryType: 'user' as const, boundaryId: user.id, agentId: agent.id }
    await setAgentOverride({ ...args, ...values }, ctxFor(user))

    expect(await setAgentOverride({ ...args, ...none }, ctxFor(user))).toBeNull()

    expect(await prisma.agentOverride.count()).toBe(0)
  })

  it('refuses another person\'s boundary with 403, for a read and a write', async () => {
    const user = await createUser()
    const other = await createUser()
    const agent = await createAgent()
    const args = { boundaryType: 'user' as const, boundaryId: other.id, agentId: agent.id }

    await expect(setAgentOverride({ ...args, ...values }, ctxFor(user))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getAgentOverride(args, ctxFor(user))).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.agentOverride.count()).toBe(0)
  })

  it('answers 404 for an agent that does not exist, instead of a foreign-key failure', async () => {
    const user = await createUser()
    const args = { boundaryType: 'user' as const, boundaryId: user.id, agentId: 'ghost' }
    await expect(setAgentOverride({ ...args, ...values }, ctxFor(user))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getAgentOverride(args, ctxFor(user))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('answers 401 when nobody is signed in', async () => {
    const user = await createUser()
    const agent = await createAgent()
    const args = { boundaryType: 'user' as const, boundaryId: user.id, agentId: agent.id }
    await expect(getAgentOverride(args, ctxFor(undefined))).rejects.toMatchObject({ statusCode: 401 })
    await expect(setAgentOverride({ ...args, ...values }, ctxFor(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('overrides are validated before they are stored @SC-615', () => {
  it('keeps the last state of a repeated tool, and takes a missing field as the organisation\'s', async () => {
    const user = await createUser()
    const agent = await createAgent()
    const args = { boundaryType: 'user' as const, boundaryId: user.id, agentId: agent.id }

    expect(await setAgentOverride({ ...args, allowedTools: [{ name: 'bash', state: 'ask' }, { name: 'bash', state: 'never' }] }, ctxFor(user)))
      .toEqual({ ...none, allowedTools: [{ name: 'bash', state: 'never' }] })
  })

  it('stores no row for empty lists', async () => {
    const user = await createUser()
    const agent = await createAgent()
    const args = { boundaryType: 'user' as const, boundaryId: user.id, agentId: agent.id }

    expect(await setAgentOverride({ ...args, ...none, allowedTools: [], allowedBashPatterns: [] }, ctxFor(user))).toBeNull()
    expect(await prisma.agentOverride.count()).toBe(0)
  })

  it.each([
    ['an approval that does not exist', { approval: 'yolo' }, /approval/i],
    ['the old autonomy word for bypassing', { approval: 'unrestricted' }, /approval/i],
    ['a tool list that is not a list', { allowedTools: 'read_file' }, /must be a list/],
    ['a tool with no name', { allowedTools: [{ name: '', state: 'never' }] }, /name/],
    ['a tool state that is not Always, Ask or Never', { allowedTools: [{ name: 'read_file', state: 'sometimes' }] }, /Always, Ask or Never/],
    ['a bash pattern with no pattern', { allowedBashPatterns: [{ state: 'never' }] }, /pattern/],
    ['more tools than the limit', { allowedTools: Array.from({ length: 201 }, (_, i) => ({ name: `t${i}`, state: 'never' })) }, /At most 200/],
    ['more bash patterns than the limit', { allowedBashPatterns: Array.from({ length: 101 }, (_, i) => ({ pattern: `p${i}`, state: 'never' })) }, /At most 100/],
    ['a model the agent\'s runtime does not offer', { model: 'gpt-9' }, /not a model/],
    ['a model that costs more than the agent\'s own', { model: 'claude-opus-4-6' }, /same as or less/],
  ])('answers 400 for %s, and stores nothing', async (_name, change, message) => {
    const user = await createUser()
    const agent = await createAgent({ defaultModel: 'claude-sonnet-4-6', runtime: 'claude-sdk' })
    const args = { boundaryType: 'user' as const, boundaryId: user.id, agentId: agent.id }

    await expect(setAgentOverride({ ...args, ...none, ...change } as any, ctxFor(user)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(message) })

    expect(await prisma.agentOverride.count()).toBe(0)
  })

  it('accepts a model that costs the same or less', async () => {
    const user = await createUser()
    const agent = await createAgent({ defaultModel: 'claude-sonnet-4-6', runtime: 'claude-sdk' })
    const args = { boundaryType: 'user' as const, boundaryId: user.id, agentId: agent.id }

    expect(await setAgentOverride({ ...args, ...none, model: 'claude-haiku-4-5' }, ctxFor(user)))
      .toEqual({ ...none, model: 'claude-haiku-4-5' })
  })
})

describe('overrides on a project\'s boundary @SC-616', () => {
  it('lets the project\'s admin set and read them', async () => {
    const { args, ctx, user, project } = await projectWith('ADMIN')

    expect(await setAgentOverride({ ...args, ...values }, ctx)).toEqual(values)
    expect(await getAgentOverride(args, ctx)).toEqual(values)

    expect(await prisma.agentOverride.findFirstOrThrow()).toMatchObject({ boundaryType: 'project', boundaryId: project.id, updatedById: user.id })
  })

  it('lets every member read them, and refuses a member who is not its admin a change with 403', async () => {
    const { args, ctx, project, agent } = await projectWith('MEMBER')
    await expect(setAgentOverride({ ...args, ...values }, ctx)).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.agentOverride.count()).toBe(0)

    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: project.id, agentId: agent.id, approval: 'immediate' } })
    expect(await getAgentOverride(args, ctx)).toEqual({ ...none, approval: 'immediate' })
  })

  it("refuses someone who is not on a private project a read of its overrides", async () => {
    const { args, project } = await projectWith('ADMIN')
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'PRIVATE' } })
    const outsider = await createUser()
    await prisma.userSettings.create({ data: { userId: outsider.id, role: 'ADMIN' } })
    await expect(getAgentOverride(args, ctxFor(outsider))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses someone outside the project with 403, even an organisation admin', async () => {
    const { args } = await projectWith('ADMIN')
    const outsider = await createUser()
    await prisma.userSettings.create({ data: { userId: outsider.id, role: 'ADMIN' } })
    await expect(setAgentOverride({ ...args, ...values }, ctxFor(outsider))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('answers 400 when the agent is not assigned to the project', async () => {
    const { args, ctx } = await projectWith('ADMIN', { assigned: false })
    await expect(setAgentOverride({ ...args, ...values }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    await expect(getAgentOverride(args, ctx)).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.agentOverride.count()).toBe(0)
  })

  it('refuses overrides on a personal project with 400, to its own admin too', async () => {
    const { args, ctx } = await projectWith('ADMIN', { personalOwner: true })
    await expect(setAgentOverride({ ...args, ...values }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    await expect(getAgentOverride(args, ctx)).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.agentOverride.count()).toBe(0)
  })

  it('answers 400 for a boundary type it does not know', async () => {
    const user = await createUser()
    const agent = await createAgent()
    await expect(getAgentOverride({ boundaryType: 'team' as any, boundaryId: 'x', agentId: agent.id }, ctxFor(user)))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})
