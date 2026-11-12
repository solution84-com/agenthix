/**
 * Integration tests (ADR-0094 — real test DB): every action that shapes an agent is the organisation
 * admin's (R-195, SC-310, SC-390), and each refusal comes before anything is read or written. An agent
 * belongs to the organisation, not to a project (ADR-0062), so there is no membership boundary to
 * check — the organisation role floor is the whole of it.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createSession } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { createAgent as createAgentAction, updateAgent, stopAgent, deleteAgent, uploadAgentImage, applyAgentPreset } from '../actions'
import { contextWithRole, contextWithoutRole, opContext } from './definitionFixtures'

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='

const entryPoints: [string, (agentId: string, ctx: any) => Promise<unknown>][] = [
  ['createAgent', (_id, ctx) => createAgentAction({ name: 'New', handle: 'new-agent' }, ctx)],
  ['updateAgent (rename)', (id, ctx) => updateAgent({ id, name: 'Renamed' }, ctx)],
  ['stopAgent', (id, ctx) => stopAgent({ id }, ctx)],
  ['deleteAgent', (id, ctx) => deleteAgent({ id }, ctx)],
  ['uploadAgentImage', (id, ctx) => uploadAgentImage({ agentId: id, type: 'avatar', dataUrl: PNG_DATA_URL }, ctx)],
  ['applyAgentPreset', (id, ctx) => applyAgentPreset({ agentId: id, imageType: 'avatar', filename: 'preset.png' }, ctx)],
]

async function setup() {
  const agent = await createAgent({ handle: 'subject', name: 'Subject' })
  await createSession({ agentId: agent.id })
  const agentsBefore = await prisma.agent.findMany({ orderBy: { id: 'asc' } })
  const untouched = async () => {
    expect(await prisma.agent.findMany({ orderBy: { id: 'asc' } })).toEqual(agentsBefore)
    expect(await prisma.agentSession.count()).toBe(1)
    expect(siteStore.stopAgent).not.toHaveBeenCalled()
    expect(siteStore.deleteSessionsBy).not.toHaveBeenCalled()
    expect(siteStore.cancelRun).not.toHaveBeenCalled()
  }
  return { agent, untouched }
}

describe.each(entryPoints)('%s needs the ADMIN role', (_name, call) => {
  it.each(['MEMBER'] as const)('refuses a %s with 403 naming ADMIN, and changes nothing', async (role) => {
    const { agent, untouched } = await setup()
    const { ctx } = await contextWithRole(role)
    await expect(call(agent.id, ctx)).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    await untouched()
  })

  it('refuses a person with no organisation role', async () => {
    const { agent, untouched } = await setup()
    const { ctx } = await contextWithoutRole()
    await expect(call(agent.id, ctx)).rejects.toMatchObject({ statusCode: 403 })
    await untouched()
  })

  it('refuses a caller who is not signed in with 401', async () => {
    const { agent, untouched } = await setup()
    await expect(call(agent.id, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    await untouched()
  })
})
