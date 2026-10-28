/**
 * The provider store against the real test database (models from one place, part 1): what is stored for a key, the
 * operations' refusal of anyone but an organisation admin, what a removal touches and leaves empty, the records,
 * and what organisation admins are told. The vendor is a fake: no test calls one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createUserWithRole } from '../../test/factories'
import { FakeVendorChecks } from './fakeVendorChecks'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')

import { useVendorChecks } from '../checks'
import { reportOutcome, settled } from '../health'
import {
  addAiProvider, getAiProviderImpact, getAiProviders, removeAiProvider, replaceAiProviderKey, revokeAiProvider,
} from '../operations'
import { PROVIDER_NOTIFICATION_TYPES } from '../../notifications/notificationKinds'

const KEY = 'sk-test-fake-0000000000a3f9'
const ctx = (user?: { id: string }) => ({ user }) as any
let vendor: FakeVendorChecks

beforeEach(() => {
  vendor = new FakeVendorChecks()
  useVendorChecks(vendor)
})
afterEach(() => useVendorChecks(null))

async function setUp() {
  const sam = await createUserWithRole('ADMIN', { displayName: 'Sam' })
  const ana = await createUserWithRole('ADMIN', { displayName: 'Ana' })
  const member = await createUserWithRole('MEMBER')
  await prisma.org.upsert({ where: { id: 'org' }, create: { id: 'org', name: 'Fernhill', setupCompletedAt: new Date() }, update: {} })
  return { sam, ana, member }
}

describe('providers', () => {
  it('refuses a member and anyone signed out, every operation @SC-1172 @SC-1188', async () => {
    const { member } = await setUp()
    await expect(getAiProviders(undefined as any, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(addAiProvider({ vendor: 'anthropic', key: KEY }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(addAiProvider({ vendor: 'anthropic', key: KEY }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.aiProvider.count()).toBe(0)
  })

  it('stores the key encrypted, never reads it back, records the write and tells every organisation admin @SC-1170 @SC-1171 @SC-1175', async () => {
    const { sam, ana } = await setUp()
    const { provider } = await addAiProvider({ vendor: 'anthropic', key: KEY }, ctx(sam))
    const row = await prisma.aiProvider.findUniqueOrThrow({ where: { id: provider.id } })
    expect(row.secret).not.toContain(KEY)
    expect(row.keyHint).toBe('a3f9')
    const listed = await getAiProviders(undefined as any, ctx(ana))
    expect(JSON.stringify(listed)).not.toContain(KEY.slice(0, -4))
    expect(listed).toEqual([expect.objectContaining({ name: 'Anthropic', types: ['llm'], keyHint: 'a3f9', state: 'works' })])
    expect(await prisma.aiProviderRecord.findMany()).toEqual([expect.objectContaining({ action: 'added', actor: 'organisation_admin', byUserId: sam.id })])
    const told = await prisma.notification.findMany({ where: { type: PROVIDER_NOTIFICATION_TYPES.changed } })
    expect(told.map(n => n.userId).sort()).toEqual([sam.id, ana.id].sort())
    expect(told[0].title).toBe('Sam added Anthropic')
  })

  it("a vendor's refusal stores nothing and is a 422 with its words @SC-1170", async () => {
    const { sam } = await setUp()
    vendor.answer(KEY, { ok: false, kind: 'auth', detail: 'invalid x-api-key' })
    await expect(addAiProvider({ vendor: 'anthropic', key: KEY }, ctx(sam))).rejects.toMatchObject({ statusCode: 422 })
    expect(await prisma.aiProvider.count()).toBe(0)
  })

  it('says what a removal touches, and on revoke leaves the defaults and agents empty @SC-1174', async () => {
    const { sam } = await setUp()
    const { provider: stt } = await addAiProvider({ vendor: 'assemblyai', key: 'aai-test-fake-000011' }, ctx(sam))
    await prisma.org.update({ where: { id: 'org' }, data: { defaultSttProviderId: stt.id, defaultSttModel: 'universal-streaming' } })
    const agent = await createAgent({ name: 'Kernel helper', handle: 'helper' })
    await prisma.agentModelChoices.create({ data: { agentId: agent.id, sttProviderId: stt.id } })

    const impact = await getAiProviderImpact({ id: stt.id }, ctx(sam))
    expect(impact).toMatchObject({ defaults: [{ slot: 'stt', to: null }], agents: [{ id: agent.id, name: 'Kernel helper' }], goesDown: ['stt'] })

    await revokeAiProvider({ id: stt.id }, ctx(sam))
    expect(await prisma.aiProvider.count()).toBe(0)
    expect((await prisma.org.findUniqueOrThrow({ where: { id: 'org' } })).defaultSttProviderId).toBeNull()
    expect((await prisma.agentModelChoices.findUniqueOrThrow({ where: { agentId: agent.id } })).sttProviderId).toBeNull()
    expect((await prisma.aiProviderRecord.findMany({ orderBy: { at: 'asc' } })).map(r => r.action)).toEqual(['added', 'revoked'])
  })

  it('removes the last provider of a type, which then reads as not set up (ADR-0160) @SC-1174', async () => {
    const { sam } = await setUp()
    const { provider: stt } = await addAiProvider({ vendor: 'assemblyai', key: 'aai-test-fake-000011' }, ctx(sam))
    await removeAiProvider({ id: stt.id }, ctx(sam))
    expect(await prisma.aiProvider.count()).toBe(0)
  })

  it('a key refused on a call and confirmed by a check tells organisation admins once, and clears when replaced @SC-1177', async () => {
    const { sam, ana } = await setUp()
    const { provider } = await addAiProvider({ vendor: 'anthropic', key: KEY }, ctx(sam))
    vendor.answer(KEY, { ok: false, kind: 'auth', detail: 'invalid x-api-key' })
    await reportOutcome(provider.id, { ok: false, kind: 'auth' })
    await settled()
    const open = await prisma.notification.findMany({ where: { type: PROVIDER_NOTIFICATION_TYPES.notWorking, status: { in: ['unread', 'read'] } } })
    expect(open.map(n => n.userId).sort()).toEqual([sam.id, ana.id].sort())
    expect(open[0]).toMatchObject({ title: 'Anthropic refused its key', dismissible: false })
    expect(open[0].body).toContain('invalid x-api-key')

    await replaceAiProviderKey({ id: provider.id, key: 'sk-test-fake-1111111111b4c5' }, ctx(ana))
    expect(await prisma.notification.count({ where: { type: PROVIDER_NOTIFICATION_TYPES.notWorking, status: { in: ['unread', 'read'] } } })).toBe(0)
  })
})
