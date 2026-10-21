/**
 * The operations only Cloud's controller may ask (core's cloudOperations.ts), each with its handler. Reached only from
 * an envelope Cloud's pinned identity sent on its own link to a machine enrolled with Cloud (`dispatch.ts`): a Fleet
 * Console's envelopes and the owner socket take core's closed set alone, which holds none of these. An operation with no
 * entry here is answered `unknown_operation`; the work that builds one adds its entry.
 */
import type { CloudOnlyOperation, CloudOnlyRequest, CloudOnlyResults } from '@agenthix/core'
import type { Context } from '../service/context'
import { backupLocationSet } from '../backups/cloudLocationHandler'
import { HQ_CLOUD_HANDLERS } from './hqOperations'
import { cloudUpgradesSet } from '../upgrades/cloudSet'
import { cloudResizeFinish, cloudResizePrepare } from '../lifecycle/resize'
import { remoteAccessHandlers } from '../remoteAccess/handlers'

export type CloudOnlyRequestOf<O extends CloudOnlyOperation> = Extract<CloudOnlyRequest, { op: O }>

export type CloudOnlyHandler<O extends CloudOnlyOperation> = {
  /** Rebuilds the request field by field, as `parseHostRequest` does; throws `Refusal('malformed', …)` when it is not one. */
  parse: (request: Record<string, unknown>) => CloudOnlyRequestOf<O>
  /** Throws `Refusal` for an answer a person reads; anything else is answered `failed`. */
  run: (ctx: Context, request: CloudOnlyRequestOf<O>) => Promise<CloudOnlyResults[O]>
}

export type CloudOnlyHandlers = { [O in CloudOnlyOperation]?: CloudOnlyHandler<O> }

export const CLOUD_ONLY_HANDLERS: CloudOnlyHandlers = {
  'backup.location.set': backupLocationSet,
  ...HQ_CLOUD_HANDLERS,
  'upgrades.set': cloudUpgradesSet,
  'resize.prepare': cloudResizePrepare,
  'resize.finish': cloudResizeFinish,
  ...remoteAccessHandlers,
}
