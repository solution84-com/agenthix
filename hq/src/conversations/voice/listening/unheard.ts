/**
 * A line the browser skipped is not stored as heard (adaptive voice listening, spec §What is stored; plan task 3.6). A
 * line that comes due while a reply plays is dropped there, and the browser says so (`linePlayed` with `skipped`). If the
 * turn has not taken its lines yet, the line leaves them. If the turn's agent message is already stored, the line is
 * taken out of it — out of the heard lines a reply starts with, or out of a turn the light model closed alone — only
 * while the message still reads as it was written, so an edit made since (a cut) is never undone; a turn closed alone
 * is never left with nothing heard. Skips in one voice session are taken one at a time.
 *
 * Logs carry ids, never the words of a line.
 */
import type { ListeningSession } from './listen'
import { joinHeard, listeningIfAny, replyOf, type HeardTurn, type ListeningState } from './state'

/** The stored agent message to edit: by its id, or, for a turn closed alone (`messageId` null), by its turn. */
export interface RewriteTarget { turnId: string; messageId: string | null }

export interface UnheardDeps {
  /** Edits the agent message's text: `edit` gives the new text, or null to leave it. Whether it was edited. */
  rewrite(session: ListeningSession, target: RewriteTarget, edit: (text: string) => string | null): Promise<boolean>
  /** Runs `fn` after `ms`; the returned function cancels it. */
  later(ms: number, fn: () => void): () => void
  log(line: string): void
}

/** How long a skip waits for its reply's message to be written, as a cut does (session.ts). */
const WRITTEN_WAIT_MS = 30_000

/** The stored text without the skipped line, or null when it no longer reads as written or would be left empty. */
export function textWithout(turn: Pick<HeardTurn, 'shape' | 'lines'>, lineId: string, text: string): string | null {
  const before = turn.lines.map(l => l.text)
  const after = turn.lines.filter(l => l.lineId !== lineId).map(l => l.text)
  if (turn.shape === 'whole') {
    if (text !== before.join(' ')) return null
    const next = after.join(' ')
    return next.trim() ? next : null
  }
  const { prefix } = joinHeard(before, '')
  if (!prefix || !text.startsWith(prefix)) return null
  const next = joinHeard(after, replyOf(text, prefix)).text
  return next.trim() ? next : null
}

export function createUnheard(deps: UnheardDeps) {
  const queues = new WeakMap<object, Promise<void>>()

  function written(turn: HeardTurn): Promise<string | null> {
    let cancel = () => undefined as void
    const late = new Promise<null>(resolve => { cancel = deps.later(WRITTEN_WAIT_MS, () => resolve(null)) })
    return Promise.race([turn.message, late]).finally(() => cancel())
  }

  async function unhear(session: ListeningSession, state: ListeningState, turn: HeardTurn, lineId: string): Promise<void> {
    const where = `listener ${session.conversationId}: skipped line ${lineId} of turn ${turn.turnId}`
    const messageId = await written(turn)
    if (turn.shape === 'prefix' && !messageId) return deps.log(`${where}: no message written, nothing to take it out of`)
    if (!turn.lines.some(l => l.lineId === lineId)) return
    const edited = await deps.rewrite(session, { turnId: turn.turnId, messageId }, text => textWithout(turn, lineId, text))
    if (edited) state.unheard(turn, lineId)
    deps.log(`${where}: ${edited ? 'taken out of its stored message' : 'left in its stored message'}`)
  }

  return {
    /** The browser dropped this line, never to be heard. */
    skipped(session: ListeningSession, lineId: string): Promise<void> {
      const state = listeningIfAny(session)
      const found = state?.skip(lineId) ?? null
      if (!state || !found) return Promise.resolve()
      if (found === 'untaken') {
        deps.log(`listener ${session.conversationId}: skipped line ${lineId}, not yet stored`)
        return Promise.resolve()
      }
      const next = (queues.get(session) ?? Promise.resolve())
        .then(() => unhear(session, state, found, lineId))
        .catch(err => deps.log(`listener ${session.conversationId}: skipped line ${lineId} not taken out: ${String(err)}`))
      queues.set(session, next)
      return next
    },
  }
}
