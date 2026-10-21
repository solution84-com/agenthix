/**
 * The connection to Agenthix Cloud from hq's machine (`agenthix cloud connect|disconnect`), for a machine admin who
 * can run commands there, through hq's control socket: the same proof of control as `fleet-admin`. The same
 * connection the Fleet Console makes, recorded as made from hq's machine.
 *
 * - `cloud-connection connect`: asks Cloud for a connection and answers the code to check and the page to approve it
 *   on; hq then waits for the approval as it does for the Fleet Console's.
 * - `cloud-connection state`: the connection, a request waiting, how the last one ended, and whether Cloud runs hq.
 * - `cloud-connection disconnect`: ends it; refused on a machine Cloud runs, whose connection is Cloud's.
 */
import type { CommandResult } from '../auth/machine/hqMachineCommands'
import { CloudCallError } from './cloudClient'
import { CloudConnectionError } from './cloudConnection'
import { cloudConnection, runByCloud } from '.'

const USAGE = 'Usage: cloud-connection connect | state | disconnect'
const BAD_URL = 'CLOUD_URL is not an https address, so HQ does not know where Agenthix Cloud is.'

export async function cloudConnectionCommand(args: string[]): Promise<CommandResult> {
  const [verb, ...rest] = args
  if (rest.length || (verb !== 'connect' && verb !== 'state' && verb !== 'disconnect')) return { ok: false, error: USAGE, code: 'usage' }
  const c = cloudConnection()
  if (!c) return { ok: false, error: BAD_URL }
  try {
    if (verb === 'state') {
      const state = { ...(await c.state()), runByCloud: runByCloud() }
      return { ok: true, text: state.connection ? `Connected as ${state.connection.name}.` : state.connecting ? 'Waiting for approval.' : 'Not connected.', data: state }
    }
    if (verb === 'connect') {
      const connecting = await c.connect(null)
      return { ok: true, text: `Approve the connection at ${connecting.verificationUri} and check it shows ${connecting.userCode}.`, data: { connecting } }
    }
    if (runByCloud()) return { ok: false, error: 'HQ runs on Agenthix Cloud, so its connection to Cloud stays while Cloud runs it.', code: 'conflict' }
    const disconnected = await c.disconnect(null)
    return { ok: true, text: disconnected ? 'Disconnected from Agenthix Cloud.' : 'HQ was not connected to Agenthix Cloud; nothing changed.', data: { disconnected } }
  } catch (err) {
    if (err instanceof CloudConnectionError) return { ok: false, error: err.message, code: 'conflict' }
    if (err instanceof CloudCallError) return { ok: false, error: err.message }
    throw err
  }
}
