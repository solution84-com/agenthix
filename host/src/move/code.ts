/**
 * `agenthix site schedule move --at <time>` (spec §13 *A site moves*): the same one-time code *Move site…* gives a
 * fleet admin, asked of the pinned Fleet Console on the machine admin's word, sealed both ways so hq never sees it.
 * The new machine connects with it, a fleet admin confirms its fingerprint in the Fleet Console as for any machine, and
 * the move runs at that time. `hq schedule move --at <time>` asks the same for hq and its default site.
 */
import { randomUUID } from 'node:crypto'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { readPin } from '../link/pin'
import { addressProblem } from '../install/address'
import { wireOf } from './wire'

export type MoveCodeResult = { code: string; expiresAt: string | null; hqAddress: string; at: string }

type Answer = { code: string | null; expiresAt: string | null; problem: string | null }

const ANSWER_WAIT_MS = 30_000
const waiting = new Map<string, (answer: Answer) => void>()

const TEXT = /^[^\u0000-\u001f\u007f]{1,500}$/

/** The Fleet Console's `moveCode` answer, from link/envelopes.ts once it opened it from the pinned Fleet Console. */
export function moveCodeAnswered(message: Record<string, unknown>): void {
  const done = typeof message.replyTo === 'string' ? waiting.get(message.replyTo) : undefined
  if (!done) return
  const text = (v: unknown) => (typeof v === 'string' && TEXT.test(v) ? v : null)
  done({ code: text(message.code), expiresAt: text(message.expiresAt), problem: text(message.problem) })
}

export async function askMoveCode(ctx: Context, at: string): Promise<MoveCodeResult> {
  const { hq, site } = installed(ctx)
  if (hq) throw new Refusal('conflict', `HQ's own site moves with HQ: ${cmd('hq schedule move --at <time>')}, or Move HQ… in the Fleet Console.`)
  if (!site) throw new Refusal('not_installed', `No site runs on ${ctx.machine.name}, so there is nothing to move.`)
  return ask(ctx, at, {})
}

/** `agenthix hq schedule move --at <time>` on hq's machine: the code *Move HQ…* gives, the same way. */
export async function askHqMoveCode(ctx: Context, at: string, hqAddress: string | null): Promise<MoveCodeResult> {
  if (!installed(ctx).hq) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ. These commands run on HQ's own machine.`)
  const problem = hqAddress ? addressProblem(hqAddress) : null
  if (problem) throw new Refusal('malformed', `HQ cannot be at ${hqAddress}: ${problem}.`)
  return ask(ctx, at, { target: 'hq', ...(hqAddress ? { hqAddress } : {}) })
}

async function ask(ctx: Context, at: string, what: { target?: 'hq'; hqAddress?: string }): Promise<MoveCodeResult> {
  const pin = readPin(ctx.state)
  const wire = wireOf(ctx)
  if (!pin || !wire) throw new Refusal('not_found', `${ctx.machine.name} is not connected to a Fleet Console, which moves sites. To connect it: ${cmd('console connect <hq address> <code>')}`)
  if (Date.parse(at) <= ctx.now().getTime()) throw new Refusal('conflict', 'That time has passed; choose a later one.')
  const askId = randomUUID()
  const answer = new Promise<Answer | null>(resolve => {
    const timer = setTimeout(() => resolve(null), ANSWER_WAIT_MS)
    waiting.set(askId, a => {
      clearTimeout(timer)
      resolve(a)
    })
  })
  try {
    await wire.toConsole({ kind: 'moveCodeAsk', askId, at, ...what })
    const a = await answer
    if (!a) throw new Refusal('failed', `The Fleet Console did not answer. Check HQ answers, and see how ${ctx.machine.name} is: ${cmd('status')}`)
    if (!a.code) throw new Refusal('conflict', a.problem ?? 'The Fleet Console gave no code.')
    // On hq's machine the new machine connects at hq's own address, not where this machine reaches hq.
    const hq = installed(ctx).hq
    return { code: a.code, expiresAt: a.expiresAt, hqAddress: hq ? hq.settings.address : pin.hqAddress, at }
  } finally {
    waiting.delete(askId)
  }
}
