/**
 * `provider add|list|remove` on hq's control socket (models from one place, part 1, N2): the machine admin's way to
 * the provider store, with the actor *machine*, the same checks, records and announcements as an organisation admin's.
 * The host service sends the key inside the request on the socket, which it got from the person's standard input:
 * it is never an argument of any command line.
 *
 * - `provider add <vendor> <key> [<name> [<address>]]`: an empty key for a custom endpoint that needs none; an empty
 *   name for the vendor's;
 * - `provider list`: every provider, its types, state and the key's last four characters;
 * - `provider remove <vendor or id>`: refused when it would leave no LLM, STT or TTS provider.
 *
 * And Agenthix Cloud on a machine it runs: once its controller has connected hq (`cloud-organisation-connect`), Cloud
 * is supplied as a provider with the actor *Cloud's controller*.
 */
import { isAiProviderVendor, providerTypesOf } from '@agenthix/core'
import type { CommandResult } from '../auth/machine/hqMachineCommands'
import { Logger } from '../server/utils/logger'
import { STATE_WORDS } from './health'
import { impactSentences } from './impact'
import { providerStore, type ProviderRow } from './store'
import { ProviderRefusal, addProvider, removeProvider, supplyCloudProvider, type RefusalCode } from './write'

const logger = new Logger('Providers')
const MACHINE = { kind: 'machine' } as const

const USAGE = 'Usage: provider add <vendor> <key> [<name> [<address>]] | provider list | provider remove <vendor or id>'

const CODE: Partial<Record<RefusalCode, 'not_found' | 'conflict' | 'usage'>> = {
  not_found: 'not_found', conflict: 'conflict', usage: 'usage',
}

function refused(err: unknown): CommandResult {
  if (err instanceof ProviderRefusal) return { ok: false, error: err.message, ...(CODE[err.code] ? { code: CODE[err.code] } : {}) }
  throw err
}

const listed = (p: ProviderRow) => ({
  id: p.id, name: p.name, vendor: p.vendor, types: [...providerTypesOf(p.vendor)], state: p.state, keyHint: p.keyHint, baseUrl: p.baseUrl,
})

function line(p: ProviderRow): string {
  const types = providerTypesOf(p.vendor).map(t => t.toUpperCase()).join(' ')
  const key = p.keyHint ? `key ending …${p.keyHint}` : 'no key'
  return `${p.name} (${p.vendor})  ${types}  ${STATE_WORDS[p.state].toLowerCase()}  ${key}${p.baseUrl ? `  ${p.baseUrl}` : ''}`
}

async function add(args: string[]): Promise<CommandResult> {
  const [vendor, key, name, address] = args
  if (!isAiProviderVendor(vendor) || key === undefined) return { ok: false, error: USAGE, code: 'usage' }
  const { provider } = await addProvider(MACHINE, { vendor, key, name: name || undefined, baseUrl: address || null })
  const hint = provider.keyHint ? ` (key ending …${provider.keyHint})` : ''
  return { ok: true, text: `Added ${provider.name}${hint}. Every organisation admin has been told.`, data: { provider } }
}

async function list(): Promise<CommandResult> {
  const providers = await providerStore().list()
  const text = providers.length ? providers.map(line).join('\n') : 'No providers yet.'
  return { ok: true, text, data: { providers: providers.map(listed) } }
}

async function remove(args: string[]): Promise<CommandResult> {
  const [which] = args
  if (!which) return { ok: false, error: USAGE, code: 'usage' }
  const p = (await providerStore().list()).find(r => r.id === which || r.vendor === which)
  if (!p) return { ok: false, error: `There is no provider ${which}. provider list shows them.`, code: 'not_found' }
  const { impact } = await removeProvider(MACHINE, { id: p.id })
  const text = [`Removed ${p.name}. Every organisation admin has been told.`, ...impactSentences(impact)].join(' ')
  return { ok: true, text, data: { impact } }
}

export async function providerCommand(args: string[]): Promise<CommandResult> {
  const [verb, ...rest] = args
  try {
    switch (verb) {
      case 'add': return await add(rest)
      case 'list': return await list()
      case 'remove': return await remove(rest)
      default: return { ok: false, error: USAGE, code: 'usage' }
    }
  } catch (err) {
    return refused(err)
  }
}

/** After Cloud's controller connected hq on a machine Cloud runs: Agenthix Cloud as a provider. Never fails the connect. */
export async function supplyCloudAfterConnect(): Promise<void> {
  try {
    await supplyCloudProvider({ kind: 'cloud_controller' })
  } catch (err) {
    logger.warn(`Agenthix Cloud not added as a provider: ${err instanceof Error ? err.message : String(err)}`)
  }
}
