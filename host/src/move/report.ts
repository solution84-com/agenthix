/** How a move goes, told to the pinned Fleet Console, sealed (core's `HostMessage` kind `move`). Never fails a move. */
import type { MoveState } from '@agenthix/core'
import type { Context } from '../service/context'
import { wireOf } from './wire'

export async function report(ctx: Context, transferId: string, state: MoveState, reason: string | null = null): Promise<void> {
  await wireOf(ctx)?.toConsole({ kind: 'move', report: { transferId, state, reason: reason ? reason.slice(0, 400) : null } }).catch(() => {})
}
