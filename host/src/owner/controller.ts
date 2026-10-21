/**
 * The closed set as a controller asks it (host-management spec §6), after `link/envelopes.ts` opened and checked
 * the envelope and core's `parseHostRequest` rebuilt the request. The same dispatch as the CLI's requests of the
 * closed set, with the fleet admin named; only what a controller asks differently is here: the site a Fleet Console
 * starts on a machine it connected, and installing HQ, which it may ask only of a machine that runs nothing yet.
 */
import type { HostActor, HostRequest, HostResult } from '@agenthix/core'
import type { Context } from '../service/context'
import { installed } from '../service/context'
import { installManagedSite } from '../install/managedSite'
import type { ConsolePin } from '../link/pin'
import { hostOperation } from './dispatch'
import { Refusal } from './results'
import { awaitingSite } from '../move/record'
import { moveOperation, removeMovedSite } from '../move/operations'
import { removeMovedHq } from '../move/hqSend'

export async function controllerOperation(ctx: Context, request: HostRequest, by: HostActor, pin: ConsolePin): Promise<HostResult> {
  const progress = () => {}
  try {
    let result: unknown
    const waiting = awaitingSite(ctx.state)
    if (request.op === 'install' && request.target === 'site' && waiting) {
      // A machine that waits to receive a site starts none of its own (spec §6 step 5, §13).
      throw new Refusal('conflict', waiting.target === 'hq'
        ? `${ctx.machine.name} is waiting to receive HQ, and starts no site of its own.`
        : `${ctx.machine.name} is waiting to receive the site ${waiting.siteName}, and starts none of its own.`)
    } else if (request.op === 'install' && request.target === 'site') {
      result = await installManagedSite(ctx, request, pin, progress)
    } else if (request.op === 'move') {
      result = await moveOperation(ctx, request, by, pin)
    } else if (request.op === 'remove' && request.target === 'site') {
      result = await removeMovedSite(ctx)
    } else if (request.op === 'remove' && request.target === 'hq') {
      result = await removeMovedHq(ctx)
    } else {
      if (request.op === 'install' && (installed(ctx).site || installed(ctx).hq)) {
        throw new Refusal('conflict', `${ctx.machine.name} already carries a site; HQ comes only to a machine that runs nothing yet.`)
      }
      result = await hostOperation(ctx, request, progress, by)
    }
    return { ok: true, op: request.op, result } as HostResult
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, op: request.op, refusal: { code: err.code, message: err.message } }
    return { ok: false, op: request.op, refusal: { code: 'failed', message: err instanceof Error ? err.message : String(err) } }
  }
}
