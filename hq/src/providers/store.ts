/**
 * The provider store's database side (models from one place, part 1): the only code that reads or writes the
 * organisation's `AiProvider` rows and their records. Writes come only from `write.ts` and `health.ts`; reads give a
 * `ProviderRow`, which has no credential in it. The one way to the key is `credentialOf`, for hq's own use when it
 * calls the vendor, and never for an answer to anyone.
 *
 * Behind an interface so the write and health rules are tested against an in-memory store (`useProviderStore`); the
 * database itself is tested in `store.integration.test.ts`.
 */
import { prisma } from 'wasp/server'
import type {
  AiProviderCredentialKind, AiProviderState, AiProviderUse, AiProviderVendor, ProviderRecordAction, ProviderRecordActorKind,
} from '@agenthix/core'
import { decryptStoredSecret } from '../server/crypto/secretCrypto'
import { peopleByIds } from '../server/identity/people'

export type ProviderRow = {
  id: string
  name: string
  vendor: AiProviderVendor
  credentialKind: AiProviderCredentialKind
  baseUrl: string | null
  keyHint: string | null
  state: AiProviderState
  stateSince: Date
  stateDetail: string | null
  lastCheckedAt: Date | null
  lastWorkedAt: Date | null
  failuresInRow: number
  lastFailedAt: Date | null
  createdAt: Date
}

export type NewProvider = Pick<ProviderRow, 'name' | 'vendor' | 'credentialKind' | 'baseUrl' | 'keyHint' | 'state' | 'stateDetail'> & {
  /** Already encrypted (secretCrypto); null for no key. */
  secret: string | null
  lastCheckedAt: Date | null
  lastWorkedAt: Date | null
}

export type ProviderPatch = Partial<Omit<ProviderRow, 'id' | 'vendor' | 'credentialKind' | 'createdAt'>> & { secret?: string | null }

export type NewRecord = {
  providerId: string
  providerName: string
  action: ProviderRecordAction
  actor: ProviderRecordActorKind
  byUserId: string | null
  detail: string | null
}

export type Person = { id: string; name: string }

export interface ProviderStore {
  /** The organisation's providers, oldest first; never a person's own subscription. */
  list(): Promise<ProviderRow[]>
  byId(id: string): Promise<ProviderRow | null>
  create(p: NewProvider): Promise<ProviderRow>
  update(id: string, patch: ProviderPatch): Promise<ProviderRow>
  remove(id: string): Promise<void>
  record(r: NewRecord): Promise<void>
  /** The key and address, decrypted, for hq's own call to the vendor. */
  credentialOf(id: string): Promise<{ key: string | null; baseUrl: string | null } | null>
  usesOf(id: string): Promise<AiProviderUse>
  /** Active people holding the organisation admin role. */
  orgAdmins(): Promise<Person[]>
}

const ROW = {
  id: true, name: true, vendor: true, credentialKind: true, baseUrl: true, keyHint: true, state: true, stateSince: true,
  stateDetail: true, lastCheckedAt: true, lastWorkedAt: true, failuresInRow: true, lastFailedAt: true, createdAt: true,
} as const

const ORGANISATION = { ownerUserId: null }

export const prismaProviderStore: ProviderStore = {
  list: () => prisma.aiProvider.findMany({ where: ORGANISATION, select: ROW, orderBy: { createdAt: 'asc' } }),
  byId: id => prisma.aiProvider.findFirst({ where: { id, ...ORGANISATION }, select: ROW }),
  create: p => prisma.aiProvider.create({ data: { ...p, stateSince: new Date() }, select: ROW }),
  update: (id, patch) => prisma.aiProvider.update({ where: { id }, data: patch, select: ROW }),
  async remove(id) {
    await prisma.aiProvider.deleteMany({ where: { id, ...ORGANISATION } })
  },
  async record(r) {
    await prisma.aiProviderRecord.create({ data: r })
  },
  async credentialOf(id) {
    const row = await prisma.aiProvider.findFirst({ where: { id, ...ORGANISATION }, select: { secret: true, baseUrl: true } })
    if (!row) return null
    return { key: row.secret ? decryptStoredSecret(row.secret, 'provider key') : null, baseUrl: row.baseUrl }
  },
  async usesOf(id) {
    const [org, agents] = await Promise.all([
      prisma.org.findFirst({
        select: { defaultConversationProviderId: true, defaultSttProviderId: true, defaultTtsProviderId: true },
      }),
      prisma.agent.findMany({
        where: { modelChoices: { OR: [{ conversationProviderId: id }, { sttProviderId: id }, { ttsProviderId: id }] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])
    const defaults: AiProviderUse['defaults'] = []
    if (org?.defaultConversationProviderId === id) defaults.push('conversation')
    if (org?.defaultSttProviderId === id) defaults.push('stt')
    if (org?.defaultTtsProviderId === id) defaults.push('tts')
    return { defaults, agents }
  },
  async orgAdmins() {
    const rows = await prisma.userSettings.findMany({
      where: { role: 'ADMIN', user: { deactivatedAt: null, erasedAt: null } },
      select: { userId: true },
    })
    const people = await peopleByIds(rows.map(r => r.userId))
    return rows.map(r => ({ id: r.userId, name: people.get(r.userId)?.name ?? '' }))
  },
}

let installed: ProviderStore = prismaProviderStore

export function providerStore(): ProviderStore {
  return installed
}

/** Tests install an in-memory store; `null` puts the database back. */
export function useProviderStore(store: ProviderStore | null): void {
  installed = store ?? prismaProviderStore
}
