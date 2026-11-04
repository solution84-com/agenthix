/**
 * The owner socket's operations around the Fleet Console (host-management spec §6, §7, §9). Each stays on the
 * machine: none is in the closed set, so no controller can ask one.
 */
import { formatJoinCode, normalizeJoinCode } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import { installed, type Context } from '../service/context'
import { connectConsole, disconnectConsole } from '../link/manage'
import { consoleHere, installConsoleElsewhere, removeConsoleHere } from '../install/console'
import { refuseOtherPort } from '../install/ports'
import { moveConsolePort } from '../install/consolePort'
import { handoverCode, consoleRunningHere, type HandoverCode } from '../link/consoleMove'
import { askHandoverCode } from '../link/askCode'
import { forgetPin, readPin } from '../link/pin'
import { hostKeys } from '../identity/identity'
import { cmd } from '../cli/words'
import { refuseUnpublishable } from '../move/ports'
import { installationOf, recordPorts } from '../state/installation'
import type { MachineRequest } from './requests'
import { Refusal } from './results'

export type ConsoleRequest = Extract<MachineRequest, { op: 'console.connect' | 'console.disconnect' | 'console.install' | 'console.port' | 'console.remove' | 'hq.consoleCode' | 'hq.fleetAdmin' }>

/**
 * `handover`: the running Fleet Console made the code — here, or on another machine, asked through this machine's
 * envelope (`elsewhere`) — and hands its machines to the new one. `fresh`: none runs here and this machine answers
 * none elsewhere, so HQ made it, and the new one starts with no machines.
 */
export type ConsoleCodeResult = {
  code: string; expiresAt: string; hqAddress: string; machine: string; kind: 'handover' | 'fresh'; elsewhere: boolean
  /** `--no-machines`: this machine left the Fleet Console it answered, for the new one to take it with `console connect`. */
  leftPin?: boolean
}
export type FleetAdminResult = { text: string; data: Record<string, unknown> | null }

function hqAddress(ctx: Context): string {
  const hq = installed(ctx).hq
  if (!hq) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ. These commands run on HQ's own machine.`)
  return hq.settings.address
}

/**
 * Ports given at `console connect` are recorded before the machine joins, so a move of HQ armed while it waits finds
 * them, and put back as they were when it does not join.
 */
async function connectWithPorts(ctx: Context, request: Extract<ConsoleRequest, { op: 'console.connect' }>, progress: (p: Progress) => void, closed?: AbortSignal) {
  const given = { hqPort: request.hqPort, consolePort: request.consolePort }
  if (given.hqPort === undefined && given.consolePort === undefined) return connectConsole(ctx, request.address, request.code, progress, closed)
  refuseUnpublishable(given)
  const before = installationOf(ctx.state).ports
  // What already runs here keeps its ports: moving one is its own command.
  if (installed(ctx).hq) refuseOtherPort('hq', given.hqPort, before.hq)
  if (consoleHere(ctx)) refuseOtherPort('console', given.consolePort, before.console)
  recordPorts(ctx.state, { ...(given.hqPort === undefined ? {} : { hq: given.hqPort }), ...(given.consolePort === undefined ? {} : { console: given.consolePort }) })
  try {
    return await connectConsole(ctx, request.address, request.code, progress, closed)
  } catch (err) {
    recordPorts(ctx.state, before)
    throw err
  }
}

const notAnswering = () => new Refusal('failed', `HQ is not answering on this machine yet. See how it is doing: ${cmd('status')}`)

export async function consoleOperation(ctx: Context, request: ConsoleRequest, progress: (p: Progress) => void, closed?: AbortSignal): Promise<unknown> {
  switch (request.op) {
    case 'console.connect':
      return connectWithPorts(ctx, request, progress, closed)
    case 'console.disconnect':
      return disconnectConsole(ctx)
    case 'console.install':
      return installConsoleElsewhere(ctx, request.address, request.code, progress, request.consolePort)
    case 'console.port':
      return moveConsolePort(ctx, request.port)
    case 'console.remove':
      return removeConsoleHere(ctx, request.confirmed === true)
    case 'hq.consoleCode': {
      const address = hqAddress(ctx)
      if (request.noMachines) return freshCodeWithoutMachines(ctx, address, request.confirmed === true)
      const handover = (made: HandoverCode & { ok: true }, elsewhere: boolean): ConsoleCodeResult => {
        const code = normalizeJoinCode(made.code)
        if (!code) throw new Refusal('failed', 'The Fleet Console answered with something that is not a code. Nothing was made.')
        return { code: formatJoinCode(code), expiresAt: made.expiresAt, hqAddress: address, machine: ctx.machine.name, kind: 'handover', elsewhere }
      }
      if (await consoleRunningHere(ctx)) {
        const made = await handoverCode(ctx)
        if (!made.ok) throw new Refusal('failed', `The Fleet Console here could not make a code: ${made.error} Nothing was made; try again once it is connected to HQ (${cmd('status')}).`)
        return handover(made, false)
      }
      // This machine answers a Fleet Console on another machine: it asks that one, so every machine follows the move.
      const pin = readPin(ctx.state)
      if (pin && !pin.local) {
        const made = await askHandoverCode({ state: ctx.state, keys: () => hostKeys(ctx.state), link: ctx.link })
        if (!made.ok) throw new Refusal('failed', made.error)
        return handover(made, true)
      }
      // Paired with the Fleet Console here, which is not running: HQ's own code would leave every machine behind.
      if (pin?.local) {
        throw new Refusal('conflict', `The Fleet Console on ${ctx.machine.name} is not running, and it is the one that hands every machine over. Start it first, then run ${cmd('hq console-code')} again. Nothing was made.`)
      }
      const r = await ctx.hqControl.consoleCode()
      if (!r) throw notAnswering()
      if (!r.ok) throw new Refusal('failed', r.error)
      const code = normalizeJoinCode(r.code)
      if (!code) throw new Refusal('failed', 'HQ answered with something that is not a code. Nothing was made.')
      const result: ConsoleCodeResult = {
        code: formatJoinCode(code), expiresAt: r.expiresAt, hqAddress: address, machine: ctx.machine.name, kind: 'fresh', elsewhere: false,
      }
      return result
    }
    case 'hq.fleetAdmin': {
      hqAddress(ctx)
      const r = await ctx.hqControl.fleetAdmin(request.user, request.remove === true)
      if (!r) throw notAnswering()
      if (!r.ok) throw new Refusal(r.code === 'not_found' ? 'not_found' : 'failed', r.error)
      const result: FleetAdminResult = { text: r.text, data: r.data ?? null }
      return result
    }
  }
}

/**
 * `hq console-code --no-machines`: when the Fleet Console this machine answers ran elsewhere and is lost, nothing can
 * ask it for a handover code, so hq makes its own. Never the default, and refused unless the person agreed: every
 * machine must connect again with `console connect`, this one too, so this machine leaves its pin once the code is made.
 */
async function freshCodeWithoutMachines(ctx: Context, address: string, confirmed: boolean): Promise<ConsoleCodeResult> {
  if (await consoleRunningHere(ctx)) {
    throw new Refusal('conflict', `The Fleet Console runs here, on ${ctx.machine.name}: ${cmd('hq console-code')} makes a code every machine follows. Nothing was made.`)
  }
  if (!confirmed) {
    throw new Refusal('conflict', `Not made: a code with no machines means every machine must connect again with ${cmd('console connect')}, ${ctx.machine.name} too. Agree to that first. Nothing was made.`)
  }
  const r = await ctx.hqControl.consoleCode()
  if (!r) throw notAnswering()
  if (!r.ok) throw new Refusal('failed', r.error)
  const code = normalizeJoinCode(r.code)
  if (!code) throw new Refusal('failed', 'HQ answered with something that is not a code. Nothing was made.')
  const leftPin = readPin(ctx.state) !== null
  forgetPin(ctx.state)
  ctx.link?.stop()
  return { code: formatJoinCode(code), expiresAt: r.expiresAt, hqAddress: address, machine: ctx.machine.name, kind: 'fresh', elsewhere: false, leftPin }
}
