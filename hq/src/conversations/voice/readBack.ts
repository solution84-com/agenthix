/**
 * Approval by voice (conversational experience spec, Voice › Approval by voice): a spoken yes counts only after
 * the lead has read the action back in one sentence and the person said yes to that — so the yes that approves
 * comes in a later turn than the read-back. Hands-free is the reason to allow it; the read-back is the reason it
 * is safe. Held in memory: a read-back lost to a restart is simply asked again.
 */
import { prisma } from 'wasp/server'
import { toMessageView } from '../store/messages'
import { openText } from '../sealing'

/** How long a read-back stands waiting for its yes. */
export const READ_BACK_STANDS_MS = 10 * 60_000

const readBacks = new Map<string, { turnId: string; at: number }>()

/**
 * Null when the person's yes in this turn answers a read-back said in an earlier one; otherwise the read-back to
 * say now, remembered for the yes that follows.
 */
export function readBackFirst(operationId: string, turnId: string, title: string, now = Date.now()): string | null {
  const said = readBacks.get(operationId)
  if (said && said.turnId !== turnId && now - said.at <= READ_BACK_STANDS_MS) {
    readBacks.delete(operationId)
    return null
  }
  readBacks.set(operationId, { turnId, at: now })
  return `Approving: ${title}. Yes?`
}

/** What the person said aloud in the messages this turn answers; null when they typed. */
export async function spokenInput(turnId: string): Promise<string | null> {
  const rows = await prisma.conversationMessage.findMany({
    where: { turnId, role: 'PERSON', kind: 'TEXT', spoken: true }, orderBy: { seq: 'asc' },
  })
  const said = rows.map(toMessageView).map(m => (m.kind === 'TEXT' ? m.body.text : '')).filter(Boolean)
  return said.length > 0 ? said.join('\n') : null
}

export async function operationTitle(operationId: string): Promise<string> {
  const row = await prisma.operation.findUnique({ where: { id: operationId }, select: { title: true } })
  return row ? openText(row.title) : 'this request'
}

/** For tests. */
export function forgetReadBacks(): void {
  readBacks.clear()
}
