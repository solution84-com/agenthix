/**
 * The lead's knowledge tools (agent knowledge spec, part 3): the five, with the reach built from the turn — the
 * conversation's own place, the person whose turn it is, the agent and the conversation — and the change tools only
 * for a turn that answers a person, as remember is.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ findUnique: vi.fn(), actingPerson: vi.fn(), search: vi.fn(async () => 'text') }))
vi.mock('wasp/server', () => ({ prisma: { project: { findUnique: h.findUnique } } }))
vi.mock('../../../server/controlplane/runPerson', () => ({ actingPerson: h.actingPerson }))
vi.mock('../../../knowledge', () => {
  const answer = async () => 'text'
  return { searchKnowledge: h.search, readKnowledge: answer, writeKnowledge: answer, editKnowledge: answer, deleteKnowledge: answer }
})

import type { KnowledgeReach } from '../../../knowledge'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'
import { ControlPlaneError } from '../../../server/controlplane/types'
import { conversationTools } from '../../work/registry'
import { createLeadKnowledgeTools, knowledgeTools, type LeadKnowledgeDeps } from '../leadKnowledgeTools'

const signal = new AbortController().signal
const NAMES = ['search_knowledge', 'read_knowledge', 'write_knowledge', 'edit_knowledge', 'delete_knowledge']
const CHANGES = ['write_knowledge', 'edit_knowledge', 'delete_knowledge']

function setup() {
  const reach: KnowledgeReach = { places: [], userId: 'u1', mayChange: true, callerKey: 'conv-1' }
  const deps = {
    search: vi.fn(async () => 'website-rebuild:processes/release.md:14: Staging deploys go out after the checks pass.'),
    read: vi.fn(async () => '1\tline'),
    write: vi.fn(async () => 'Done.'),
    edit: vi.fn(async () => 'Done. Version 7.'),
    delete: vi.fn(async () => 'Done.'),
    reachOf: vi.fn(async () => reach),
  } satisfies LeadKnowledgeDeps
  const tools = Object.fromEntries(createLeadKnowledgeTools(deps).map(t => [t.name, t]))
  return { deps, tools, reach }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.actingPerson.mockResolvedValue({ userId: 'u1', role: 'MEMBER' })
})

describe('which turns are offered which tools', () => {
  it('are the five, among the lead\'s own tools', () => {
    expect(knowledgeTools.map(t => t.name)).toEqual(NAMES)
    for (const name of NAMES) expect(conversationTools().filter(t => t.name === name)).toHaveLength(1)
  })

  it('a turn answering a person is offered all five', async () => {
    const { tools } = setup()
    for (const name of NAMES) expect(await tools[name]!.offered(turnCapability())).toBe(true)
  })

  it('a turn answering no one is offered search and read, and no change tool', async () => {
    const { tools } = setup()
    const reader = turnCapability({ actingUserId: null, readerUserId: 'u1' })
    expect(await tools.search_knowledge!.offered(reader)).toBe(true)
    expect(await tools.read_knowledge!.offered(reader)).toBe(true)
    for (const name of CHANGES) expect(await tools[name]!.offered(reader)).toBe(false)
  })

  it('a report turn and an expired one are offered none', async () => {
    const { tools } = setup()
    for (const capability of [turnCapability({ trigger: 'REPORT' }), turnCapability({ expiresAt: Date.now() - 1 })]) {
      for (const name of NAMES) expect(await tools[name]!.offered(capability)).toBe(false)
    }
  })

  it("a tool the agent's place never allows is not offered", async () => {
    const { tools } = setup()
    const capability = turnCapability({ permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: ['write_knowledge'] } })
    expect(await tools.write_knowledge!.offered(capability)).toBe(false)
    expect(await tools.edit_knowledge!.offered(capability)).toBe(true)
  })

  it('describe each as the registry does, like its native tool', async () => {
    const { tools } = setup()
    expect(await tools.search_knowledge!.describe(turnCapability())).toMatch(/^Works like Grep/)
    expect(await tools.edit_knowledge!.describe(turnCapability())).toMatch(/^Works like Edit/)
  })
})

describe('running them', () => {
  it("passes the turn's reach and the call's input, and answers the service's text", async () => {
    const { tools, deps, reach } = setup()
    const input = { pattern: 'staging.*(approv|sign.?off)', '-n': true }
    const outcome = await tools.search_knowledge!.run(turnCapability(), input, { signal })
    expect(deps.reachOf).toHaveBeenCalledWith(turnCapability({ expiresAt: expect.any(Number) as unknown as number }), 'search_knowledge')
    expect(deps.search).toHaveBeenCalledWith(reach, input)
    expect(outcome).toEqual({ status: 'done', operationId: 'turn-1', result: 'website-rebuild:processes/release.md:14: Staging deploys go out after the checks pass.' })
  })

  it('a change from a turn answering no one is refused before the service is asked', async () => {
    const { tools, deps } = setup()
    const outcome = await tools.edit_knowledge!.run(turnCapability({ actingUserId: null, readerUserId: 'u1' }), { page: 'org:a.md' }, { signal })
    expect(outcome).toEqual({ status: 'refused', reason: 'edit_knowledge changes knowledge, and this reply acts for no one' })
    expect(deps.edit).not.toHaveBeenCalled()
  })

  it("a refusal of the rules is said in its own words; any other failure plainly, never its detail", async () => {
    const { tools, deps } = setup()
    deps.reachOf.mockRejectedValueOnce(new ControlPlaneError('forbidden', 'The person this run is for is no longer in the organisation'))
    expect(await tools.read_knowledge!.run(turnCapability(), { page: 'org:a.md' }, { signal }))
      .toEqual({ status: 'refused', reason: 'The person this run is for is no longer in the organisation' })
    deps.read.mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.4:4101 /srv/knowledge'))
    expect(await tools.read_knowledge!.run(turnCapability(), { page: 'org:a.md' }, { signal }))
      .toEqual({ status: 'refused', reason: 'read_knowledge failed' })
  })
})

describe("the turn's reach, as wired", () => {
  const reachFor = async (overrides: Parameters<typeof turnCapability>[0]) => {
    const tool = knowledgeTools.find(t => t.name === 'search_knowledge')!
    await tool.run(turnCapability(overrides), { pattern: 'x' }, { signal })
    return (h.search.mock.calls.at(-1) as unknown[] | undefined)?.[0] as KnowledgeReach | undefined
  }

  it("a conversation in the person's own space reaches their space, keyed by the conversation", async () => {
    expect(await reachFor({})).toEqual({
      places: [{ level: 'personal', owner: { ownerType: 'user', ownerId: 'u1' } }],
      userId: 'u1', agent: { agentId: 'agent-1', conversationId: 'conv-1' }, mayChange: true, callerKey: 'conv-1',
    })
  })

  it("a project's conversation reaches that project, under its slug, and nothing else", async () => {
    h.findUnique.mockResolvedValue({ id: 'p1', slug: 'shop', key: 'SHP', personalOwnerId: null, personalSpace: false })
    const reach = await reachFor({ home: 'PROJECT', projectId: 'p1' })
    expect(reach?.places).toEqual([{ level: 'shop', owner: { ownerType: 'project', ownerId: 'p1' } }])
    expect(h.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }))
  })

  it('a turn answering no one reads as its reader, and may not change', async () => {
    h.actingPerson.mockResolvedValue({ userId: 'u2', role: 'MEMBER' })
    const reach = await reachFor({ actingUserId: null, readerUserId: 'u2' })
    expect(reach).toMatchObject({ userId: 'u2', mayChange: false, places: [{ level: 'personal', owner: { ownerType: 'user', ownerId: 'u2' } }] })
  })

  it("a task's thread with no project and no one reaches no place", async () => {
    const reach = await reachFor({ home: 'TASK', taskId: 'task-1', actingUserId: null, readerUserId: null })
    expect(reach?.places).toEqual([])
  })
})
