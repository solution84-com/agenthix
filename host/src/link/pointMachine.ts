/**
 * `agenthix console hq-address <address>` (host-management spec §13): a machine that was offline while hq moved is
 * pointed at its new address. The move check runs first, on the machine credential; only when it passes does the
 * pin move, and nothing else is sent to an address that fails it. A Fleet Console running on this machine (one
 * installed here with `console install`) is pointed too, by its own command line, which runs the check on its own
 * credential.
 */
import type { MoveCheckOutcome } from '@agenthix/core'
import { runMoveCheck, type MoveCheckOptions } from '@agenthix/core/host-crypto'
import type { Progress } from '../sockets/lineServer'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { CHECK_STEP, checkStepOutcome, checking, notChanged, type MachineConsole } from '../cli/hqAddressWords'
import { consoleHere } from '../install/console'
import { movePin } from './addressFollow'
import { readPin } from './pin'
import { hqAddressProblem } from './socket'

export const CONSOLE_HQ_ADDRESS_COMMAND = (address: string) => ['node', '/app/dist/cli.js', 'hq-address', address]

export type PointMachineResult = {
  machine: string
  address: string
  previous: string
  console: MachineConsole
  /** The site here, when it was added by a Fleet Console and still uses another address. */
  siteNeedsAddress: string | null
}

type Check = (o: MoveCheckOptions) => Promise<MoveCheckOutcome>

export async function pointMachine(ctx: Context, raw: string, progress: (p: Progress) => void, check: Check = runMoveCheck): Promise<PointMachineResult> {
  const address = raw.trim().replace(/\/+$/, '')
  const pin = readPin(ctx.state)
  if (!pin) {
    throw new Refusal('not_installed', `${ctx.machine.name} is not connected to a Fleet Console, so it reaches no HQ. To connect it: ${cmd('console connect <hq address> <code>')}`)
  }
  if (pin.local) {
    throw new Refusal('conflict', `HQ runs on ${ctx.machine.name}, so this machine reaches it here. To change HQ's address: ${cmd('hq address <address>')}`)
  }
  const problem = hqAddressProblem(address)
  if (problem) throw new Refusal('malformed', `HQ cannot be reached at ${address}: ${problem}.`)
  const who = { kind: 'machine', name: ctx.machine.name } as const

  progress({ event: 'note', text: `This machine reaches HQ at ${pin.hqAddress}${ctx.link?.connected() ? '' : ', and is not connected to it now'}.` })
  progress({ event: 'note', text: checking(address, who) })
  progress({ event: 'step', step: CHECK_STEP })
  const outcome = await check({ address, credential: pin.machineCredential, subject: 'host' })
  progress({ event: 'stepDone', outcome: checkStepOutcome(outcome) })
  if (outcome !== 'passed') throw new Refusal('conflict', notChanged(outcome, address, who, pin.hqAddress))

  movePin(ctx.state, address)
  ctx.link?.stop()
  ctx.link?.start()

  const site = installed(ctx).site?.settings
  return {
    machine: ctx.machine.name,
    address,
    previous: pin.hqAddress,
    console: await pointConsoleHere(ctx, address),
    siteNeedsAddress: site?.hqUrl && site.hqUrl !== address ? site.name : null,
  }
}

/** The Fleet Console installed on this machine, pointed by its own command line; what became of it. */
async function pointConsoleHere(ctx: Context, address: string): Promise<MachineConsole> {
  const here = consoleHere(ctx)
  if (!here) return 'elsewhere'
  if (here.settings.onHqMachine) return 'onHqMachine'
  const r = await ctx.docker.exec(ctx.names.consoleContainer, CONSOLE_HQ_ADDRESS_COMMAND(address), '', 60_000).catch(() => null)
  let answer: { outcome?: unknown } | null = null
  try {
    answer = r && r.code === 0 ? (JSON.parse(r.stdout.trim().split('\n').pop() ?? '') as { outcome?: unknown }) : null
  } catch {
    answer = null
  }
  // It keeps the address it followed in its own state, across restarts, while its compose file is unchanged.
  return answer?.outcome === 'passed' ? 'here' : 'notFollowed'
}
