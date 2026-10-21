/**
 * What a person does to a conversation besides sending a message (every screen
 * reviewed, *What a conversation shows*):
 *
 * - **Try again** — the latest reply, while it is a failure, is tried again:
 *   the same message in a fresh run, told the last attempt failed. Never
 *   offered for anything older, so there is never more than one.
 * - **Send now** — a message waiting behind a running reply goes now: the
 *   reply is stopped for it, as Interrupt would have.
 * - **Cancel** — a waiting message is withdrawn before its run starts, and
 *   leaves the conversation.
 * - **Summarise now** — the agent's runtime summarises its memory of the
 *   conversation now; refused while the agent works.
 *
 * Anyone who may send into the conversation may do each (sessionSender.ts);
 * only a waiting message's sender may cancel it.
 */
import { HttpError } from 'wasp/server'
import { latestFailure, orderTranscript, runOnBehalfOf, SUMMARISE_NOW_INPUT, type RunRow } from '@agenthix/core'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from './siteRuntimeStore'
import { rethrowDispatchErrorAsHttp } from '../storage/httpErrors'
import { requireSessionSender } from './sessionSender'
import { interruptForWaitingMessage } from './busyConversationInterrupt'
import { personName } from './transcriptAuthors'
import { CONVERSATION_ROWS_READ } from './conversationRead'
import { tryAgainPrompt } from './conversationRecord'

type SessionArgs = { sessionId: string }
type WaitingMessageArgs = { sessionId: string; runId: string }
type Context = { user?: { id: string } | null }

export const AGENT_STILL_WORKING = 'The agent is still working in this conversation. Wait until it finishes.'
export const NOTHING_TO_TRY_AGAIN = 'Only the latest reply can be tried again, and only while it is a failure.'
export const NOT_WAITING = 'This message is no longer waiting: the agent has started on it.'

function requireUser(context: Context): string {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user.id
}

async function siteOf(session: Parameters<typeof dispatchService.resolveSiteIdForSession>[0]): Promise<string> {
  return dispatchService.resolveSiteIdForSession(session)
}

async function requireIdle(siteId: string, sessionId: string): Promise<void> {
  const active = await siteRuntimeStore.listRuns(siteId, { sessionId, activeOnly: true })
  if (active.length > 0) throw new HttpError(409, AGENT_STILL_WORKING)
}

/** The waiting message's run: this conversation's, and not started. */
async function requireWaitingRun(siteId: string, args: WaitingMessageArgs): Promise<RunRow> {
  const run = await siteRuntimeStore.getRun(siteId, args.runId)
  if (!run || run.sessionId !== args.sessionId) throw new HttpError(404, 'Message not found')
  if (run.status !== 'PENDING') throw new HttpError(409, NOT_WAITING)
  return run
}

export const tryAgain = async (args: SessionArgs, context: Context): Promise<{ id: string }> => {
  const userId = requireUser(context)
  const session = await requireSessionSender(args.sessionId, userId)
  try {
    const siteId = await siteOf(session)
    await requireIdle(siteId, session.id)
    const rows = await siteRuntimeStore.listTranscript(siteId, session.id, { tail: true, limit: CONVERSATION_ROWS_READ })
    const failure = latestFailure(orderTranscript(rows))
    if (!failure) throw new HttpError(409, NOTHING_TO_TRY_AGAIN)
    const { runId } = await dispatchService.dispatchChatRun(session.id, tryAgainPrompt(failure), session.agent, session.model, {
      hideUserMessage: true,
      senderId: userId,
    })
    return { id: runId }
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowDispatchErrorAsHttp(err)
  }
}

export const sendWaitingMessageNow = async (args: WaitingMessageArgs, context: Context): Promise<{ interrupted: number }> => {
  const userId = requireUser(context)
  const session = await requireSessionSender(args.sessionId, userId)
  try {
    const siteId = await siteOf(session)
    await requireWaitingRun(siteId, args)
    return await interruptForWaitingMessage(userId, siteId, session.id)
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowDispatchErrorAsHttp(err)
  }
}

export const cancelWaitingMessage = async (args: WaitingMessageArgs, context: Context): Promise<{ ok: true }> => {
  const userId = requireUser(context)
  const session = await requireSessionSender(args.sessionId, userId)
  try {
    const siteId = await siteOf(session)
    const run = await requireWaitingRun(siteId, args)
    // A task's session is shared: a waiting message is its sender's to take back.
    const sender = runOnBehalfOf(run.metadata) ?? session.userId
    if (sender !== userId) throw new HttpError(403, 'Only the person who sent a message can cancel it')
    await siteRuntimeStore.cancelRun(siteId, run.id, 'withdrawn', await personName(userId))
    return { ok: true }
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowDispatchErrorAsHttp(err)
  }
}

export const summariseConversation = async (args: SessionArgs, context: Context): Promise<{ id: string }> => {
  const userId = requireUser(context)
  const session = await requireSessionSender(args.sessionId, userId)
  try {
    const siteId = await siteOf(session)
    await requireIdle(siteId, session.id)
    const { runId } = await dispatchService.dispatchChatRun(session.id, SUMMARISE_NOW_INPUT, session.agent, session.model, {
      hideUserMessage: true,
      senderId: userId,
    })
    return { id: runId }
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowDispatchErrorAsHttp(err)
  }
}
