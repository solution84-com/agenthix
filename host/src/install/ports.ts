/**
 * The two ports an installation publishes on the machine (one port plan, Rule 3): HQ's and its Fleet Console's, each
 * the machine admin's choice — a quiet default when they choose nothing — recorded in `installation.json` once and read
 * back by every operation after. Inside their containers hq-web and the Fleet Console keep our own numbers.
 */
import { CHOSEN_PORT_RANGE, HQ_STANDARD_PORTS, PUBLISHED_DEFAULTS } from '@agenthix/core'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'

/** What a command was given to choose the ports with: its flags, absent when not given. */
export type PortChoice = { hqPort?: number; consolePort?: number }

/**
 * The port HQ's address itself says hq is published on: a plain-http address's own (80 when it names none), since
 * browsers open it there. An https address is the front door's on 80 and 443, or a proxy's, so it says nothing of
 * hq's own port.
 */
export function addressPort(address: string): number | null {
  const url = new URL(address)
  if (url.protocol === 'https:') return null
  return url.port ? Number(url.port) : 80
}

const OUTGOING_FROM = CHOSEN_PORT_RANGE.last + 1
const range = `${CHOSEN_PORT_RANGE.first} to ${CHOSEN_PORT_RANGE.last}`

/** Why `port` is outside what may be published for this part, as the end of a sentence about it; null when it is not. */
export function portRangeReason(port: number, part: 'hq' | 'console'): string | null {
  const standard = part === 'hq' && (HQ_STANDARD_PORTS as readonly number[]).includes(port)
  if (standard || (port >= CHOSEN_PORT_RANGE.first && port <= CHOSEN_PORT_RANGE.last)) return null
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'is not a port'
  if (port >= OUTGOING_FROM) return 'is in the range the operating system gives to outgoing connections, so it could be taken at any time'
  return 'needs extra privileges on Linux'
}

/** Where another port is chosen from, for this part. */
export const rangeOf = (part: 'hq' | 'console') => `${range}${part === 'hq' ? ', or 80 or 443' : ''}`

/** Why `port` cannot be published for this part, in the words a refusal says; null when it can. */
export function publishedPortProblem(port: number, part: 'hq' | 'console'): string | null {
  const reason = portRangeReason(port, part)
  if (!reason) return null
  return `${reason === 'is not a port' ? `${port}` : `Port ${port}`} ${reason}. Choose a port from ${rangeOf(part)}.`
}

const flagOf = { hq: '--hq-port', console: '--console-port' } as const

function checked(port: number, part: 'hq' | 'console'): number {
  const problem = publishedPortProblem(port, part)
  if (problem) throw new Refusal('malformed', `${problem} Nothing was changed.`)
  return port
}

/**
 * HQ's published port for `address`: the address's own when it names one, else `--hq-port`, else what was recorded,
 * else the default. An address and `--hq-port` that disagree are refused.
 */
export function chooseHqPort(address: string, flag: number | undefined, recorded: number | null): number {
  const said = addressPort(address)
  if (said !== null && flag !== undefined && flag !== said) {
    throw new Refusal('malformed', `HQ's address is on port ${said}, but --hq-port says ${flag}. Give one of them. Nothing was changed.`)
  }
  return checked(said ?? flag ?? recorded ?? PUBLISHED_DEFAULTS.hq, 'hq')
}

/** The Fleet Console's published port: `--console-port`, else what was recorded, else the default. */
export function chooseConsolePort(flag: number | undefined, recorded: number | null): number {
  return checked(flag ?? recorded ?? PUBLISHED_DEFAULTS.console, 'console')
}

/** Both, for a command that installs HQ with its Fleet Console. */
export function choosePorts(address: string, given: PortChoice, recorded: { hq: number | null; console: number | null }): { hq: number; console: number } {
  const hq = chooseHqPort(address, given.hqPort, recorded.hq)
  const fleetConsole = chooseConsolePort(given.consolePort, recorded.console)
  if (hq === fleetConsole) {
    throw new Refusal('malformed', `HQ and the Fleet Console cannot both be published on port ${hq}. Choose another with ${given.consolePort === undefined ? flagOf.hq : flagOf.console}. Nothing was changed.`)
  }
  return { hq, console: fleetConsole }
}

/** A re-run keeps what was chosen: a flag that asks for another port is refused rather than ignored. */
export function refuseOtherPort(part: 'hq' | 'console', asked: number | undefined, recorded: number | null): void {
  if (asked === undefined || recorded === null || asked === recorded) return
  const what = part === 'hq' ? 'HQ is' : 'The Fleet Console is'
  const move = cmd(part === 'hq' ? 'hq address' : 'console port')
  throw new Refusal('already_installed', `${what} already published here on port ${recorded}, not ${asked}. To move it: ${move}. Nothing was changed.`)
}

/**
 * The ports a request names, rebuilt field by field: each a whole number from 1 to 65535 when given, checked against
 * the bounds when it is used. Null when one is not a port at all.
 */
export function portFields(r: Record<string, unknown>, allowed: readonly ('hqPort' | 'consolePort')[]): PortChoice | null {
  const out: PortChoice = {}
  for (const key of ['hqPort', 'consolePort'] as const) {
    const v = r[key]
    if (v === undefined) continue
    if (!allowed.includes(key) || typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 65535) return null
    out[key] = v
  }
  return out
}

/** The default address with nothing given: HQ on this machine, at its published port. */
export const defaultAddress = (hqPort: number = PUBLISHED_DEFAULTS.hq) => `http://localhost:${hqPort}`
