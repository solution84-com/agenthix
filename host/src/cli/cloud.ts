/**
 * The commands about Agenthix Cloud (host-management spec §7, pre-release spec part C): `cloud connect|disconnect`,
 * `console remote on|off`, `console reset-code <user>`, for a machine admin who would rather not, or cannot, open the
 * Fleet Console. Each is refused where it does not belong. Connecting is the same connection HQ's *Connect to
 * Agenthix Cloud* makes (Manage organisation › Providers), approved on Cloud with the same code. Remote access is turned on only by Cloud, which issues its
 * certificate (ADR-0132), so `remote on` says where; `off` works at once, whether or not Cloud is reachable.
 */
import { parseRemoteAccessDuration, type HqCloudState } from '@agenthix/core'
import type { Ask } from './backups'
import type { HelpRow } from './commands'
import type { ManagementStatus } from '../link/status'
import type { MachineStatus } from '../status/machineStatus'
import { cmd, wrap } from './words'

export type CloudCommand =
  | { kind: 'cloudConnect' }
  | { kind: 'cloudDisconnect'; yes: boolean }
  | { kind: 'remoteOn'; forMs: number }
  | { kind: 'remoteOff' }
  | { kind: 'resetCode'; user: string; yes: boolean }

type Usage = { kind: 'usage'; message: string }

const notACommand = (words: string[]): Usage => ({ kind: 'usage', message: `There is no command "${words.join(' ')}".` })

/** `cloud <verb>`. */
export function parseCloud(verb: string | undefined, args: string[]): CloudCommand | Usage {
  if (verb === 'connect') return args.length ? { kind: 'usage', message: 'cloud connect takes nothing more.' } : { kind: 'cloudConnect' }
  if (verb === 'disconnect') {
    const yes = args.includes('--yes')
    return args.some(a => a !== '--yes') ? { kind: 'usage', message: 'cloud disconnect takes only --yes.' } : { kind: 'cloudDisconnect', yes }
  }
  return notACommand(['cloud', ...(verb ? [verb] : []), ...args])
}

/** `console remote on|off [--for <time>]` and `console reset-code [--yes] <user>`; null when the words are not these. */
export function parseCloudConsole(verb: string | undefined, args: string[]): CloudCommand | Usage | null {
  if (verb !== 'remote' && verb !== 'reset-code') return null
  if (verb === 'reset-code') {
    const yes = args.includes('--yes')
    const names = args.filter(a => a !== '--yes')
    return names.length === 1 && !names[0].startsWith('--')
      ? { kind: 'resetCode', user: names[0], yes }
      : { kind: 'usage', message: 'Give the name the fleet admin types at sign-in: console reset-code <user>' }
  }
  const [state, ...rest] = args
  if (state === 'off') return rest.length ? { kind: 'usage', message: 'console remote off takes nothing more.' } : { kind: 'remoteOff' }
  if (state !== 'on') return { kind: 'usage', message: 'console remote takes on or off: console remote on [--for <time>]' }
  const i = rest.indexOf('--for')
  const value = i >= 0 ? rest[i + 1] : undefined
  const other = i >= 0 ? [...rest.slice(0, i), ...rest.slice(i + 2)] : rest
  if (other.length || (i >= 0 && (value === undefined || value.startsWith('--')))) {
    return { kind: 'usage', message: 'console remote on takes --for <time>, like 90m or 2h, nothing else.' }
  }
  const length = parseRemoteAccessDuration(value)
  return length.ok ? { kind: 'remoteOn', forMs: length.ms } : { kind: 'usage', message: length.message }
}

export const CLOUD_HELP: HelpRow[] = [
  { group: 'cloud', usage: 'cloud connect', does: 'Connect the organisation to Agenthix Cloud',
    detail: "From HQ's machine, the same connection as Connect to Agenthix Cloud in HQ, under Manage organisation › Providers: it prints a short code and Cloud's page, waits while an organisation admin approves it there after checking the code matches, and says how it ended. Leaving early is fine: HQ keeps waiting for the approval. On a machine Cloud runs, Cloud connects HQ itself." },
  { group: 'cloud', usage: 'cloud disconnect [--yes]', does: 'Disconnect the organisation from Agenthix Cloud',
    detail: "From HQ's machine. People who sign in with Agenthix Cloud are told first and sign in with their password from then on; Cloud's sites leave the fleet and remote access turns off. Asks first; --yes answers for a script. Refused on a machine Cloud runs, whose connection is Cloud's." },
  { group: 'console', usage: 'console remote on | off [--for <time>]', does: 'Remote access to the Fleet Console: who turns it on, and off at once',
    detail: "Remote access exists only on a machine Agenthix Cloud runs, and Cloud turns it on, since it issues the certificate and names the addresses allowed: on says so and changes nothing. off closes it at once, on the Fleet Console's machine, whether or not Cloud can be reached." },
  { group: 'console', usage: 'console reset-code [--yes] <user>', does: "Start a fleet admin's authenticator code over",
    detail: "On the Fleet Console's machine, beside HQ: forgets that fleet admin's authenticator code and its recovery codes, so they set up a new one the next time they open the Fleet Console remotely, from one Cloud hands over. For a lost phone. Asks first; --yes answers for a script." },
]

export type CloudIo = {
  out: (text: string) => void
  err: (text: string) => void
  confirm: (question: string, yes: boolean) => Promise<boolean>
  /** Waits between reads of a connection waiting for approval. */
  pause?: (ms: number) => Promise<void>
  now?: () => number
}

type State = HqCloudState & { runByCloud: boolean }

const POLL_MS = 3_000
const pauseFor = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

const ENDED: Record<NonNullable<HqCloudState['lastAttempt']>, string> = {
  refused: 'The connection was refused on Agenthix Cloud. Nothing was connected.',
  expired: 'It was not approved in time. Run it again for a new code.',
  failed: 'Agenthix Cloud stopped answering before it was approved. Try again in a moment.',
}

async function connect(call: Ask, io: CloudIo): Promise<number> {
  const read = async () => (await call<{ state: State }>({ op: 'hq.cloudConnection', action: 'state' })).state
  const before = await read()
  if (before.connection) {
    io.out(wrap(`HQ is connected to Agenthix Cloud already, as ${before.connection.name}. Nothing was changed.`))
    return 0
  }
  if (before.runByCloud) {
    io.out(wrap('Agenthix Cloud runs HQ here and connects it itself as it sets it up. Nothing was asked.'))
    return 0
  }
  const { connecting } = await call<{ connecting: NonNullable<HqCloudState['connecting']> }>({ op: 'hq.cloudConnection', action: 'connect' })
  io.out(wrap(`Approve the connection on Agenthix Cloud, signed in as an admin of the organisation to connect to, and check that it shows this code:`))
  io.out(`\n  ${connecting.userCode}\n\n  ${connecting.verificationUriComplete}\n`)
  io.out(wrap(`Waiting for approval, until ${new Date(connecting.expiresAt).toLocaleTimeString()}. Leaving now is fine: HQ keeps waiting, and ${cmd('cloud connect')} shows how it ended.`))
  const pause = io.pause ?? pauseFor
  const now = io.now ?? Date.now
  const until = Date.parse(connecting.expiresAt) + POLL_MS
  for (;;) {
    await pause(POLL_MS)
    const state = await read()
    if (state.connection) {
      io.out(wrap(`Connected to Agenthix Cloud as ${state.connection.name}. Every admin in HQ has been told.`))
      return 0
    }
    if (!state.connecting || now() > until) {
      io.err(wrap(state.lastAttempt ? ENDED[state.lastAttempt] : ENDED.expired))
      return 1
    }
  }
}

async function disconnect(call: Ask, io: CloudIo, yes: boolean): Promise<number> {
  const { state } = await call<{ state: State }>({ op: 'hq.cloudConnection', action: 'state' })
  if (state.runByCloud) {
    io.err(wrap('Agenthix Cloud runs HQ here, so its connection to Cloud stays while Cloud runs it. Nothing was changed.'))
    return 1
  }
  if (!state.connection && !state.connecting) {
    io.out(wrap('HQ is not connected to Agenthix Cloud. Nothing was changed.'))
    return 0
  }
  if (state.connection) {
    io.out(wrap(`HQ is connected to Agenthix Cloud as ${state.connection.name}. Disconnecting tells the people who sign in with Agenthix Cloud first; they sign in with their password from then on. Cloud's sites leave the fleet, and remote access turns off.`))
    if (!(await io.confirm('Disconnect?', yes))) return 1
  }
  await call({ op: 'hq.cloudConnection', action: 'disconnect' })
  io.out(wrap(state.connection ? 'Disconnected from Agenthix Cloud. Every admin in HQ has been told.' : 'The request waiting for approval was dropped.'))
  return 0
}

export async function cloudCommand(command: CloudCommand, call: Ask, io: CloudIo): Promise<number> {
  const status = await call<MachineStatus & { management?: ManagementStatus }>({ op: 'machine.status' })
  const onHq = command.kind === 'cloudConnect' || command.kind === 'cloudDisconnect'
  if (onHq && !status.hq) {
    io.err(wrap(`No HQ here: ${status.machine.name} runs no HQ. The connection to Agenthix Cloud is made and removed on HQ's own machine.`))
    return 1
  }
  if (!onHq && status.management?.consoleHere?.containers !== 'running') {
    io.err(wrap(`No Fleet Console runs on ${status.machine.name}. This is done on the Fleet Console's own machine.`))
    return 1
  }
  switch (command.kind) {
    case 'cloudConnect':
      return connect(call, io)
    case 'cloudDisconnect':
      return disconnect(call, io, command.yes)
    case 'remoteOn':
      io.err(wrap('Remote access is turned on from Agenthix Cloud, on a machine it runs: Cloud issues its certificate and names the addresses allowed. Nothing was changed here.'))
      return 1
    case 'remoteOff':
      await call({ op: 'console.remoteOff' })
      io.out(wrap(`Remote access to the Fleet Console on ${status.machine.name} is off.`))
      return 0
    case 'resetCode': {
      if (!status.hq) {
        io.err(wrap(`No HQ here: ${status.machine.name} runs the Fleet Console without HQ beside it, which reads who ${command.user} is. Run it on a machine that runs both.`))
        return 1
      }
      io.out(wrap(`${command.user}'s authenticator code and recovery codes will be forgotten. They set up a new one the next time they open the Fleet Console remotely.`))
      if (!(await io.confirm('Start it over?', command.yes))) return 1
      const { reset } = await call<{ reset: boolean }>({ op: 'console.resetCode', user: command.user })
      io.out(wrap(reset ? `${command.user}'s authenticator code was forgotten.` : `${command.user} had no authenticator code here. Nothing was changed.`))
      return 0
    }
  }
}
