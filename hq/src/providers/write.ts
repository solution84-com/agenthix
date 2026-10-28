/**
 * The one way a provider is written (models from one place, part 1, M2): add, replace a key, rename, remove and
 * revoke, and supplying Agenthix Cloud. Every write names one of three actors, and anything else is refused:
 *
 * - `organisation_admin`: a person whose organisation admin role is checked again here, whatever checked it before;
 * - `machine`: whoever can run commands on hq's machine, through hq's control socket (`machineCommands.ts`);
 * - `cloud_controller`: Agenthix Cloud's controller, only on a machine Cloud runs, and only for Agenthix Cloud.
 *
 * A key is checked with its vendor before it is stored, encrypted under SECRETS_MASTER_KEY, and never answered: an
 * answer carries its last four characters at most. Every write is a record and is announced to every organisation
 * admin. A removal that leaves no provider of a type is allowed, with a warning first (ADR-0160). Writes run one at a
 * time. A key that works fills the organisation's defaults that are still empty.
 */
import { AI_PROVIDER_VENDOR_INFO, PROVIDER_WRITERS, type AiProviderVendor, type ProviderActor, type ProviderRecordAction } from '@agenthix/core'
import { encryptSecret } from '../server/crypto/secretCrypto'
import { checkBaseUrl } from '../shared/modelProviders'
import { vendorChecks, type CheckResult } from './checks'
import { impactOf, impactSentences, type ProviderImpact } from './impact'
import { announceProviderChange, syncProviderNotices } from './notices'
import { fillEmptyDefaults } from '../setup/setupDefaults'
import { keyHintOf, providerKeyProblem, vendorMessage } from './secrecy'
import { providerStore, type ProviderRow } from './store'

export type RefusalCode = 'not_allowed' | 'not_found' | 'conflict' | 'usage' | 'refused_by_vendor'

export class ProviderRefusal extends Error {
  constructor(readonly code: RefusalCode, message: string) {
    super(message)
  }
}

/** A provider as a write answers it: never its key. */
export type WrittenProvider = Pick<ProviderRow, 'id' | 'name' | 'vendor' | 'baseUrl' | 'keyHint' | 'state' | 'stateDetail'>

const NAME_MAX = 80
const CLOUD_NOT_AVAILABLE = 'Agenthix Cloud does not offer models and voice to this HQ yet.'

const written = (p: ProviderRow): WrittenProvider =>
  ({ id: p.id, name: p.name, vendor: p.vendor, baseUrl: p.baseUrl, keyHint: p.keyHint, state: p.state, stateDetail: p.stateDetail })

let chain: Promise<unknown> = Promise.resolve()
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work)
  chain = next.catch(() => {})
  return next
}

type Authority = { actor: ProviderActor; byUserId: string | null; byName: string }

/** The actor, checked: an admin's role from the database, the controller's machine from hq's own settings. */
async function authorise(actor: ProviderActor, vendor: AiProviderVendor | null): Promise<Authority> {
  const kind = (actor as { kind?: unknown }).kind
  if (!(PROVIDER_WRITERS as readonly unknown[]).includes(kind)) throw new ProviderRefusal('not_allowed', 'Only an organisation admin, HQ\'s machine or Agenthix Cloud on a machine it runs may change providers.')
  if (actor.kind === 'organisation_admin') {
    const admin = (await providerStore().orgAdmins()).find(a => a.id === actor.userId)
    if (!admin) throw new ProviderRefusal('not_allowed', 'Only an organisation admin may change providers.')
    return { actor, byUserId: admin.id, byName: admin.name }
  }
  if (actor.kind === 'cloud_controller') {
    // The same setting as cloud/index.ts's runByCloud, read here so the store depends on nothing of Cloud's.
    if (process.env.HQ_RUN_BY_CLOUD !== 'true') throw new ProviderRefusal('not_allowed', 'Agenthix Cloud does not run this HQ.')
    if (vendor !== 'cloud') throw new ProviderRefusal('not_allowed', 'Agenthix Cloud supplies only itself as a provider.')
    return { actor, byUserId: null, byName: 'Agenthix Cloud' }
  }
  return { actor, byUserId: null, byName: "HQ's machine" }
}

async function found(id: string): Promise<ProviderRow> {
  const p = await providerStore().byId(id)
  if (!p) throw new ProviderRefusal('not_found', 'There is no such provider.')
  return p
}

function nameOf(raw: string | undefined, fallback: string): string {
  const name = (raw ?? '').trim() || fallback
  if (name.length > NAME_MAX || /\p{Cc}/u.test(name)) throw new ProviderRefusal('usage', `A provider's name is one line of at most ${NAME_MAX} characters.`)
  return name
}

function refusedByVendor(label: string, result: Exclude<CheckResult, { ok: true }>, key: string | null): ProviderRefusal {
  const said = vendorMessage(result.detail, key)
  const lead = result.kind === 'auth' ? `${label} refused this key` : result.kind === 'quota' ? `${label} says this account is out of credit` : `${label} could not be checked`
  return new ProviderRefusal('refused_by_vendor', `${lead}: ${said} Nothing was saved.`)
}

async function finish(by: Authority, p: Pick<ProviderRow, 'id' | 'name' | 'vendor' | 'baseUrl'>, action: ProviderRecordAction, lines: string[]): Promise<void> {
  const store = providerStore()
  await store.record({ providerId: p.id, providerName: p.name, action, actor: by.actor.kind, byUserId: by.byUserId, detail: lines.join(' ') || null })
  await announceProviderChange({ action, by: by.byName, byUserId: by.byUserId, provider: p, lines })
  await syncProviderNotices()
}

const addressLine = (p: Pick<ProviderRow, 'baseUrl'>) => (p.baseUrl ? [`Its address: ${p.baseUrl}.`] : [])

export async function addProvider(
  actor: ProviderActor, input: { vendor: AiProviderVendor; key?: string | null; name?: string; baseUrl?: string | null },
): Promise<{ provider: WrittenProvider }> {
  const by = await authorise(actor, input.vendor)
  const info = AI_PROVIDER_VENDOR_INFO[input.vendor]
  if (!info) throw new ProviderRefusal('usage', 'There is no such vendor.')
  if (input.vendor === 'cloud') throw new ProviderRefusal('usage', 'Agenthix Cloud is connected, not added with a key.')
  const name = nameOf(input.name, info.label)
  let baseUrl: string | null = null
  if (info.hasAddress) {
    const checked = checkBaseUrl(input.baseUrl ?? '')
    if ('problem' in checked) throw new ProviderRefusal('usage', checked.problem)
    baseUrl = checked.baseUrl
  } else if (input.baseUrl) {
    throw new ProviderRefusal('usage', `${info.label} takes no address.`)
  }
  const key = (input.key ?? '').trim() || null
  if (!key && !info.hasAddress) throw new ProviderRefusal('usage', `${info.label} needs its API key.`)
  const problem = key ? providerKeyProblem(key) : null
  if (problem) throw new ProviderRefusal('usage', problem)
  if ((await providerStore().list()).some(p => p.vendor === input.vendor)) {
    throw new ProviderRefusal('conflict', `The organisation has ${info.label} already. Replace its key instead.`)
  }

  const result = await vendorChecks().check({ vendor: input.vendor, key, baseUrl })
  if (!result.ok) throw refusedByVendor(info.label, result, key)

  return oneAtATime(async () => {
    const now = new Date()
    let created: ProviderRow
    try {
      created = await providerStore().create({
        name, vendor: input.vendor, credentialKind: 'api_key', baseUrl, keyHint: keyHintOf(key), secret: key ? encryptSecret(key) : null,
        state: 'works', stateDetail: null, lastCheckedAt: now, lastWorkedAt: now,
      })
    } catch (err) {
      if ((err as { code?: unknown }).code === 'P2002') throw new ProviderRefusal('conflict', `The organisation has ${info.label} already. Replace its key instead.`)
      throw err
    }
    await finish(by, created, 'added', [...addressLine(created), ...(created.keyHint ? [`Key ending …${created.keyHint}.`] : [])])
    await fillEmptyDefaults()
    return { provider: written(created) }
  })
}

/** Agenthix Cloud as a provider, with no key, once; reads not available yet until hq's calls to it are built. */
export async function supplyCloudProvider(actor: ProviderActor): Promise<{ provider: WrittenProvider }> {
  const by = await authorise(actor, 'cloud')
  if (by.actor.kind === 'machine') throw new ProviderRefusal('not_allowed', "Agenthix Cloud is connected by an organisation admin, or by Cloud on a machine it runs.")
  return oneAtATime(async () => {
    const existing = (await providerStore().list()).find(p => p.vendor === 'cloud')
    if (existing) return { provider: written(existing) }
    const created = await providerStore().create({
      name: AI_PROVIDER_VENDOR_INFO.cloud.label, vendor: 'cloud', credentialKind: 'none', baseUrl: null, keyHint: null, secret: null,
      state: 'not_available', stateDetail: CLOUD_NOT_AVAILABLE, lastCheckedAt: null, lastWorkedAt: null,
    })
    await finish(by, created, 'added', [])
    return { provider: written(created) }
  })
}

export async function replaceProviderKey(actor: ProviderActor, input: { id: string; key: string }): Promise<{ provider: WrittenProvider }> {
  const before = await found(input.id)
  const by = await authorise(actor, before.vendor)
  const label = AI_PROVIDER_VENDOR_INFO[before.vendor].label
  if (before.credentialKind !== 'api_key') throw new ProviderRefusal('usage', `${label} has no key to replace.`)
  const key = input.key.trim()
  const problem = providerKeyProblem(key)
  if (problem) throw new ProviderRefusal('usage', problem)
  const result = await vendorChecks().check({ vendor: before.vendor as Exclude<AiProviderVendor, 'cloud'>, key, baseUrl: before.baseUrl })
  if (!result.ok) throw refusedByVendor(label, result, key)

  return oneAtATime(async () => {
    await found(input.id)
    const now = new Date()
    const after = await providerStore().update(input.id, {
      secret: encryptSecret(key), keyHint: keyHintOf(key), state: 'works', stateSince: now, stateDetail: null,
      failuresInRow: 0, lastFailedAt: null, lastCheckedAt: now, lastWorkedAt: now,
    })
    await finish(by, after, 'key_replaced', [`Key ending …${after.keyHint} replaced key ending …${before.keyHint ?? ''}.`])
    await fillEmptyDefaults()
    return { provider: written(after) }
  })
}

export async function renameProvider(actor: ProviderActor, input: { id: string; name: string }): Promise<{ provider: WrittenProvider }> {
  const before = await found(input.id)
  const by = await authorise(actor, before.vendor)
  const name = nameOf(input.name, '')
  if (!name) throw new ProviderRefusal('usage', 'A provider needs a name.')
  return oneAtATime(async () => {
    const after = await providerStore().update(input.id, { name })
    await finish(by, after, 'renamed', [`Was ${before.name}.`])
    return { provider: written(after) }
  })
}

/** What removing or revoking this provider would touch, for the confirmation before it. */
export async function providerImpact(id: string): Promise<ProviderImpact> {
  const store = providerStore()
  const gone = await found(id)
  const [all, uses] = await Promise.all([store.list(), store.usesOf(id)])
  return impactOf(gone, all, uses)
}

async function takeAway(actor: ProviderActor, id: string, action: 'removed' | 'revoked'): Promise<{ impact: ProviderImpact }> {
  const by = await authorise(actor, (await found(id)).vendor)
  return oneAtATime(async () => {
    const gone = await found(id)
    const impact = await providerImpact(id)
    await providerStore().remove(id)
    const lines = impactSentences(impact)
    if (action === 'revoked' && gone.credentialKind === 'api_key') lines.push(`Revoke the key at ${AI_PROVIDER_VENDOR_INFO[gone.vendor].label} too: HQ cannot.`)
    await finish(by, gone, action, lines)
    return { impact }
  })
}

export function removeProvider(actor: ProviderActor, input: { id: string }): Promise<{ impact: ProviderImpact }> {
  return takeAway(actor, input.id, 'removed')
}

/** At once, for a key that may have leaked: never refused, whatever it leaves without a provider. */
export function revokeProvider(actor: ProviderActor, input: { id: string }): Promise<{ impact: ProviderImpact }> {
  return takeAway(actor, input.id, 'revoked')
}
