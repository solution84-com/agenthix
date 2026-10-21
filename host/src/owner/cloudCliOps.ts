/**
 * The machine admin's Cloud commands on the owner socket (`agenthix cloud …`, `console remote off`,
 * `console reset-code`): never a controller's to ask.
 *
 * - `hq.cloudConnection`: the organisation's connection to Cloud, asked of hq over its control socket, as the Fleet
 *   Console's *Connect* button asks it over the console link.
 * - `console.remoteOff`: remote access off at once, the same as Cloud's `remoteAccess.off`; off is always reachable.
 * - `console.resetCode`: forgets a fleet admin's authenticator in the Fleet Console here, by the id hq gives for their
 *   username, so they set up one again.
 */
import type { HqCloudState } from '@agenthix/core'
import type { Context } from '../service/context'
import { installed } from '../service/context'
import { askConsoleRemote } from '../remoteAccess/consoleRemote'
import { turnRemoteAccessOff } from '../remoteAccess/handlers'
import { Refusal } from './results'

export type CloudCliRequest =
  | { op: 'hq.cloudConnection'; action: 'connect' | 'state' | 'disconnect' }
  | { op: 'console.remoteOff' }
  | { op: 'console.resetCode'; user: string }

export type CloudConnectionAnswer =
  | { state: HqCloudState & { runByCloud: boolean } }
  | { connecting: NonNullable<HqCloudState['connecting']> }
  | { disconnected: boolean }

async function askHq(ctx: Context, command: string, args: string[]): Promise<Record<string, unknown>> {
  if (!installed(ctx).hq) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ.`)
  const r = await ctx.hqControl.run(command, args)
  if (!r) throw new Refusal('busy', 'HQ is not answering yet. Try again once it is running.')
  if (!r.ok) throw new Refusal(r.code === 'not_found' ? 'not_found' : r.code === 'conflict' ? 'conflict' : 'failed', r.error)
  return r.data ?? {}
}

export async function cloudCliOperation(ctx: Context, request: CloudCliRequest): Promise<unknown> {
  switch (request.op) {
    case 'hq.cloudConnection': {
      const data = await askHq(ctx, 'cloud-connection', [request.action])
      return request.action === 'state' ? { state: data } : data
    }
    case 'console.remoteOff':
      return turnRemoteAccessOff(ctx)
    case 'console.resetCode': {
      const { userId } = await askHq(ctx, 'fleet-admin-id', [request.user])
      if (typeof userId !== 'string') throw new Refusal('failed', 'HQ answered with something the host service does not read.')
      const answer = await askConsoleRemote(ctx, 'remote-authenticator-reset', { userId })
      return { reset: answer.reset === true }
    }
  }
}
