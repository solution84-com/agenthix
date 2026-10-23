/**
 * `agenthix console port <port>` (one port plan, Rule 3): the Fleet Console here published on another port of this
 * machine's 127.0.0.1, after the check (Rule 4). The port is recorded, and its container recreated on it; if that
 * fails, the old port is recorded again and the container put back on it.
 */
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import { consoleAddress } from '../compose/console'
import { republishConsole } from '../remoteAccess/publish'
import { installationOf, recordPorts } from '../state/installation'
import { cmd } from '../cli/words'
import { consoleHere } from './console'
import { publishedPortProblem } from './ports'
import { checkPorts, CONSOLE_BIND } from './portCheck'

export type ConsolePortResult = { machine: string; address: string; previous: string | null }

let busy = false

export async function moveConsolePort(ctx: Context, port: number): Promise<ConsolePortResult> {
  if (busy) throw new Refusal('busy', "The Fleet Console's port is already being changed on this machine. Wait for it to finish.")
  busy = true
  try {
    return await move(ctx, port)
  } finally {
    busy = false
  }
}

async function move(ctx: Context, port: number): Promise<ConsolePortResult> {
  const machine = ctx.machine.name
  if (!consoleHere(ctx)) {
    throw new Refusal('not_installed', `No Fleet Console runs on ${machine}, so it has no port to move. Nothing was changed. To run one here: ${cmd('console install <hq address> <code>')}`)
  }
  const range = publishedPortProblem(port, 'console')
  if (range) throw new Refusal('malformed', `${range} Nothing was changed.`)
  const was = installationOf(ctx.state).ports.console
  if (was === port) throw new Refusal('conflict', `The Fleet Console is already on port ${port}. Nothing was changed.`)
  await checkPorts(ctx, [{ port, part: 'console', bind: CONSOLE_BIND, another: 'Choose another port.' }])

  recordPorts(ctx.state, { console: port })
  try {
    await republishConsole(ctx)
  } catch (err) {
    recordPorts(ctx.state, { console: was })
    await republishConsole(ctx).catch(() => {})
    const why = err instanceof Error ? err.message : String(err)
    throw new Refusal('failed', `The Fleet Console could not be started on port ${port} (${why}). It is back on port ${was}.`)
  }
  return { machine, address: consoleAddress(port), previous: was === null ? null : consoleAddress(was) }
}
