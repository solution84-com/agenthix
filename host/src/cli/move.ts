/**
 * `agenthix site schedule move --at <time>` (spec §13 *A site moves*): the one-time code *Move site…* gives, asked of
 * the Fleet Console on the machine admin's word (move/code.ts). The new machine connects with it, a fleet admin
 * confirms it, and the site moves at that time. `agenthix hq schedule move --at <time> [--address <new address>]` the
 * same for HQ and its default site.
 */
import { atTime } from './scheduled'
import { whenText } from '../scheduled/time'
import type { RecoverCheck, RecoverResult } from '../move/hqRecover'
import { cmd, wrap } from './words'

export type MoveCodeCommand = { kind: 'moveCode'; at: string; target?: 'hq'; hqAddress?: string }
export type MoveCommand = MoveCodeCommand | { kind: 'moveRecover'; yes: boolean }

export type MoveIo = { out: (text: string) => void; err: (text: string) => void }

/** `hq move recover [--yes]`. */
export function parseHqMove(args: string[]): MoveCommand | { kind: 'usage'; message: string } {
  const yes = args.includes('--yes')
  const rest = args.filter(a => a !== '--yes')
  return rest.length === 1 && rest[0] === 'recover'
    ? { kind: 'moveRecover', yes }
    : { kind: 'usage', message: 'hq move takes recover: hq move recover, after a move of HQ that ended on neither machine. To move HQ: hq schedule move --at <time>' }
}

export async function moveCommand(command: MoveCodeCommand, call: <T>(request: unknown) => Promise<T>, io: MoveIo, now: Date): Promise<number> {
  const at = atTime(command.at, now)
  if ('problem' in at) {
    io.err(wrap(at.problem))
    return 2
  }
  if (command.target === 'hq') {
    const r = await call<{ code: string; hqAddress: string; at: string }>({ op: 'hq.moveCode', at: at.at, ...(command.hqAddress ? { hqAddress: command.hqAddress } : {}) })
    io.out([
      wrap(`HQ and its site move ${whenText(new Date(r.at), now)}, once a fleet admin has confirmed the new machine in the Fleet Console. On the new machine, which must run nothing yet, run:`),
      `  ${cmd(`console connect ${r.hqAddress} ${r.code}`)}`,
      wrap(`The code works once, for 1 hour. Everyone in HQ is told when the move is set; from the moment its backup starts, HQ is read-only, and it answers ${command.hqAddress ? `at ${command.hqAddress}` : 'at the same address'} once it runs on the new machine.`),
    ].join('\n'))
    return 0
  }
  const r = await call<{ code: string; hqAddress: string; at: string }>({ op: 'site.moveCode', at: at.at })
  io.out([
    wrap(`The site moves ${whenText(new Date(r.at), now)}, once a fleet admin has confirmed the new machine in the Fleet Console. On the new machine, which must run nothing yet, run:`),
    `  ${cmd(`console connect ${r.hqAddress} ${r.code}`)}`,
    wrap('The code works once, for 1 hour. HQ tells the people whose projects run on the site when the move is set, and its runs pause while it moves.'),
  ].join('\n'))
  return 0
}

/**
 * `hq move recover`: the person is told plainly that the new machine must not be running HQ, and asked; the host
 * service refuses without that, and refuses by itself what it can tell (move/hqRecover.ts).
 */
export async function moveRecoverCommand(
  command: { yes: boolean }, call: <T>(request: unknown) => Promise<T>, io: MoveIo & { confirm: (question: string, yes: boolean) => Promise<boolean> },
): Promise<number> {
  const check = await call<RecoverCheck>({ op: 'hq.moveRecoverCheck' })
  io.out(recoverQuestion(check))
  if (!(await io.confirm(`Start HQ on ${check.machine} again?`, command.yes))) return 1
  io.out(recovered(await call<RecoverResult>({ op: 'hq.moveRecover', confirmed: true })))
  return 0
}

function recoverQuestion(c: RecoverCheck): string {
  return [
    wrap(`HQ was moving to ${c.peerName}. ${c.machine} handed it over, but HQ did not stay there: it runs on neither machine.`),
    wrap(`Before you go on, make sure HQ is not running on ${c.peerName}: there, ${cmd('status')} must show no HQ. If HQ ran on both machines, changes made on one of them would be lost.`),
    wrap(`This starts HQ, its site and the Fleet Console if it ran here, on ${c.machine} again, from what this machine kept, and records that the move did not complete.`),
  ].join('\n')
}

function recovered(r: RecoverResult): string {
  const lines = [wrap(`HQ runs on ${r.machine} again, at ${r.address}, and changes are no longer paused. The move to ${r.peerName} is recorded as not completed.`)]
  if (r.hqAddress !== r.address) {
    lines.push(wrap(`Sites and machines that followed HQ to ${r.hqAddress} and were not connected just now: point them back on their own machines with ${cmd(`console hq-address ${r.address}`)}, then ${cmd(`site hq-address ${r.address}`)}.`))
  }
  return lines.join('\n')
}
