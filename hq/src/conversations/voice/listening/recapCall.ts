/**
 * The recap (adaptive voice listening, spec §The recap; plan task 3.7): after each heavy reply that completed, not
 * interrupted, one small call to the conversation's own model — none of the agent's instructions or tools — writes
 * where the conversation is now, under 100 words, stored on the conversation for the next listening call. It runs
 * while the reply plays, so nothing waits for it; its cost goes in the usage ledger under `listener`. A failed call
 * keeps the last recap. A reply that turns out not to be heard — withdrawn because the person went on, or cut by them
 * speaking over it — keeps the last recap too: `unheard` aborts the call, or puts the last one back once stored, unless
 * a later recap has replaced it.
 */
import { prisma } from 'wasp/server'
import { openJson } from '../../sealing'
import type { ConversationHomeRef, ModelAdapter, ResolveConversationAccess } from '../../contract'
import { costedFor } from '../../../billing/sources/hqCalls'
import { personName } from '../../../sessions/transcriptAuthors'
import { buildRecapCall, readRecap, LISTENER_SETTINGS } from '../listener'

/** How long the recap call may take: well within the time the reply takes to be heard. */
const RECAP_WAIT_MS = 20_000

export interface RecapDeps {
  model: Pick<ModelAdapter, 'complete'>
  resolveAccess: ResolveConversationAccess
  log(line: string): void
}

export interface RecapTurn {
  conversation: ConversationHomeRef
  actingUserId: string | null
  /** The person's messages the turn answered. */
  inputIds: readonly string[]
  /** This turn's agent message: what the person heard while they spoke, then the reply. */
  agentText: string
}

export async function writeRecap(turn: RecapTurn, deps: RecapDeps, unheard?: AbortSignal): Promise<void> {
  const { conversation } = turn
  if (unheard?.aborted) return
  const [row, inputs, agent, person] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversation.id }, select: { voiceRecap: true } }),
    prisma.conversationMessage.findMany({
      where: { id: { in: [...turn.inputIds] }, role: 'PERSON', kind: 'TEXT' }, orderBy: { seq: 'asc' }, select: { body: true },
    }),
    conversation.agentId ? prisma.agent.findUnique({ where: { id: conversation.agentId }, select: { name: true } }) : null,
    turn.actingUserId ? personName(turn.actingUserId) : undefined,
  ])
  const message = inputs.map(m => openJson<{ text?: string }>(m.body).text ?? '').filter(Boolean).join('\n')
  if (!message.trim() || !turn.agentText.trim()) return
  const resolved = await deps.resolveAccess(conversation, turn.actingUserId)
  if (!resolved.access) return
  const call = buildRecapCall({
    agent: agent?.name ?? 'the agent', person: person ?? 'the person', previousRecap: row?.voiceRecap ?? null,
    message, agentMessage: turn.agentText,
  })
  const started = Date.now()
  const { text } = await deps.model.complete({
    access: costedFor(resolved.access, 'listener'),
    system: [{ text: call.system }],
    messages: [{ role: 'user', content: call.user }],
    cacheKey: conversation.id,
    maxOutputTokens: 400,
    spoken: true,
    signal: unheard ? AbortSignal.any([unheard, AbortSignal.timeout(RECAP_WAIT_MS)]) : AbortSignal.timeout(RECAP_WAIT_MS),
  })
  const recap = readRecap(text, LISTENER_SETTINGS)
  if (!recap) return deps.log(`recap ${conversation.id}: empty, the last one kept`)
  if (unheard?.aborted) return deps.log(`recap ${conversation.id}: its reply was not heard, the last one kept`)
  const previous = row?.voiceRecap ?? null
  await prisma.conversation.update({ where: { id: conversation.id }, data: { voiceRecap: recap } })
  deps.log(`recap ${conversation.id}: ${recap.split(/\s+/).length} words in ${Date.now() - started} ms`)
  if (!unheard) return
  const putBack = () => {
    void prisma.conversation.updateMany({ where: { id: conversation.id, voiceRecap: recap }, data: { voiceRecap: previous } })
      .then(() => deps.log(`recap ${conversation.id}: its reply was not heard, the last one put back`))
      .catch(err => deps.log(`recap ${conversation.id}: the last one was not put back: ${err instanceof Error ? err.message : String(err)}`))
  }
  if (unheard.aborted) putBack()
  else unheard.addEventListener('abort', putBack, { once: true })
}
