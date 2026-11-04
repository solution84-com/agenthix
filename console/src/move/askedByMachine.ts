/** `site schedule move --at` on a site's machine (or HQ's): the code, sealed back to it, so hq never sees it. */
import type { HostCommands } from '../hosts/commands'
import type { Moves } from './moves'

export async function answerMoveCodeAsk(commands: HostCommands, moves: Pick<Moves, 'start' | 'startHq'>, from: string, message: Record<string, unknown>): Promise<void> {
  if (typeof message.askId !== 'string' || message.askId.length > 64) return
  const at = typeof message.at === 'string' ? message.at : null
  const replyTo = message.askId
  try {
    const m = message.target === 'hq'
      ? await moves.startHq(null, at, typeof message.hqAddress === 'string' ? message.hqAddress : null, from)
      : await moves.start(null, from, at)
    await commands.tell(from, { kind: 'moveCode', replyTo, code: m.code, expiresAt: m.expiresAt, problem: null })
  } catch (err) {
    await commands.tell(from, { kind: 'moveCode', replyTo, code: null, expiresAt: null, problem: err instanceof Error ? err.message : 'No code was made.' }).catch(() => {})
  }
}
