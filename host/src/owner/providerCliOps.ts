/**
 * The machine admin's provider commands on the owner socket (`agenthix provider …`; models from one place, part 1):
 * asked of hq over its control socket, where hq's provider store takes them with the actor *machine*. Never a
 * controller's to ask. A key travels in the request on this socket and then inside the program piped to hq-server
 * (`HqControl.runPrivately`), never as any process's argument, and is never logged.
 */
import { isAiProviderVendor, type AiProviderVendor } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import type { HqCommandResult } from '../hq/control'
import { Refusal } from './results'

export type ProviderCliRequest =
  | { op: 'hq.provider'; action: 'add'; vendor: Exclude<AiProviderVendor, 'cloud'>; key: string; name?: string; address?: string }
  | { op: 'hq.provider'; action: 'list' }
  | { op: 'hq.provider'; action: 'remove'; which: string }

const MAX_KEY = 1024
const MAX_NAME = 80
const MAX_ADDRESS = 512
const MAX_WHICH = 128
const CONTROL = /[\u0000-\u001f\u007f]/

const field = (v: unknown, max: number, empty = false): string | null =>
  typeof v === 'string' && (empty || v.length > 0) && v.length <= max && !CONTROL.test(v) ? v : null

/** The request rebuilt field by field, or the name of the first field that is not valid. */
export function parseProviderCliRequest(r: Record<string, unknown>): { ok: true; request: ProviderCliRequest } | { ok: false; field: string } {
  if (r.action === 'list') return { ok: true, request: { op: 'hq.provider', action: 'list' } }
  if (r.action === 'remove') {
    const which = field(r.which, MAX_WHICH)
    return which ? { ok: true, request: { op: 'hq.provider', action: 'remove', which } } : { ok: false, field: 'provider' }
  }
  if (r.action !== 'add') return { ok: false, field: 'action' }
  if (!isAiProviderVendor(r.vendor) || r.vendor === 'cloud') return { ok: false, field: 'vendor' }
  const key = field(r.key, MAX_KEY, true)
  if (key === null) return { ok: false, field: 'key' }
  const name = r.name === undefined ? undefined : field(r.name, MAX_NAME)
  const address = r.address === undefined ? undefined : field(r.address, MAX_ADDRESS)
  if (name === null) return { ok: false, field: 'name' }
  if (address === null) return { ok: false, field: 'address' }
  return { ok: true, request: { op: 'hq.provider', action: 'add', vendor: r.vendor, key, ...(name ? { name } : {}), ...(address ? { address } : {}) } }
}

export async function providerCliOperation(ctx: Context, request: ProviderCliRequest): Promise<{ text: string; data: Record<string, unknown> }> {
  if (!installed(ctx).hq) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ.`)
  let r: HqCommandResult | null
  switch (request.action) {
    case 'add':
      r = await ctx.hqControl.providerAdd({ vendor: request.vendor, key: request.key, name: request.name, address: request.address })
      break
    case 'list':
      r = await ctx.hqControl.providerList()
      break
    case 'remove':
      r = await ctx.hqControl.providerRemove(request.which)
      break
  }
  if (!r) throw new Refusal('busy', 'HQ is not answering yet. Try again once it is running.')
  if (!r.ok) throw new Refusal(r.code === 'not_found' ? 'not_found' : r.code === 'conflict' ? 'conflict' : 'failed', r.error)
  return { text: r.text, data: r.data ?? {} }
}
