/**
 * What Cloud's controller asks, once `envelopes.ts` opened its envelope against the pinned Cloud identity. Recorded as
 * `by: { kind: 'cloud' }` whatever the request claims. The operations a Fleet Console may ask go through core's
 * `parseHostRequest` and the same dispatch as the CLI's requests of the closed set; Cloud's own go through the
 * handler registry (`handlers.ts`). On a machine not enrolled with Cloud, nothing is done.
 */
import {
  CLOUD_ONLY_OPERATIONS, parseHostRequest, type CloudOnlyOperation, type CloudResult, type HostActor,
} from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { hostOperation } from '../owner/dispatch'
import { Refusal } from '../owner/results'
import { enrolledWithCloud } from '../link/cloudController'
import { CLOUD_ONLY_HANDLERS, type CloudOnlyHandler, type CloudOnlyHandlers } from './handlers'
import { CLOUD_NOT_AVAILABLE, cloudFeatureOn } from './flag'

export const CLOUD_ACTOR: HostActor = { kind: 'cloud' }

function opOf(request: unknown): string | null {
  const op = request && typeof request === 'object' && !Array.isArray(request) ? (request as { op?: unknown }).op : undefined
  return typeof op === 'string' && op.length <= 64 ? op : null
}

const isCloudOnly = (op: string | null): op is CloudOnlyOperation => (CLOUD_ONLY_OPERATIONS as readonly (string | null)[]).includes(op)

function failed<O extends CloudResult['op']>(op: O | null, err: unknown): CloudResult {
  if (err instanceof Refusal) return { ok: false, op, refusal: { code: err.code, message: err.message } }
  return { ok: false, op, refusal: { code: 'failed', message: err instanceof Error ? err.message : String(err) } }
}

async function runCloudOnly<O extends CloudOnlyOperation>(ctx: Context, op: O, handler: CloudOnlyHandler<O>, raw: Record<string, unknown>): Promise<CloudResult> {
  try {
    const request = handler.parse(raw)
    if (request.op !== op) throw new Refusal('malformed', 'The request is not one the host service reads.')
    return { ok: true, op, result: await handler.run(ctx, request) } as CloudResult
  } catch (err) {
    return failed(op, err)
  }
}

export async function cloudOperation(ctx: Context, raw: unknown, handlers: CloudOnlyHandlers = CLOUD_ONLY_HANDLERS): Promise<CloudResult> {
  const op = opOf(raw)
  if (!cloudFeatureOn()) return { ok: false, op: null, refusal: { code: 'conflict', message: CLOUD_NOT_AVAILABLE } }
  if (!enrolledWithCloud(ctx.state)) {
    return { ok: false, op: null, refusal: { code: 'conflict', message: 'This machine is not enrolled with Agenthix Cloud.' } }
  }
  if (isCloudOnly(op)) {
    // Indexed by a union of keys, the entry's type cannot follow `op`; `runCloudOnly` keeps the two together.
    const handler = handlers[op] as CloudOnlyHandler<typeof op> | undefined
    if (!handler) return { ok: false, op, refusal: { code: 'unknown_operation', message: 'This version of the host service does not do that yet.' } }
    return runCloudOnly(ctx, op, handler, raw as Record<string, unknown>)
  }
  const parsed = parseHostRequest(raw)
  if (!parsed.ok) return { ok: false, op: null, refusal: parsed.refusal }
  const request = parsed.request
  try {
    // As from a Fleet Console: hq comes only to a machine that runs nothing yet.
    if (request.op === 'install' && (installed(ctx).site || installed(ctx).hq)) {
      throw new Refusal('conflict', `${ctx.machine.name} already carries a site; HQ comes only to a machine that runs nothing yet.`)
    }
    return { ok: true, op: request.op, result: await hostOperation(ctx, request, () => {}, CLOUD_ACTOR) } as CloudResult
  } catch (err) {
    return failed(request.op, err)
  }
}
