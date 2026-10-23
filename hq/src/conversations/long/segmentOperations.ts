/**
 * Opening a compaction's marker, and *Summarise now* (long conversations spec). Summarise now compacts at once, in
 * the same way as at the marks, while it holds the conversation's one-turn lock: never while a reply is being
 * written, and no reply starts until it is done. Messages sent meanwhile wait, and are answered after it. The
 * request returns once the compaction has started; the screens hear the rest over the socket.
 */
import { randomUUID } from 'node:crypto'
import { HttpError, prisma } from 'wasp/server'
import type { ConversationSegmentView, GetConversationSegmentArgs, SummariseNowArgs } from '../../shared/conversations/protocol'
import type { ResolveConversationAccess } from '../contract'
import { requireConversationReader, requireConversationSpeaker } from '../readingRule'
import { resolveTalkingFor } from '../access/talkingModel'
import { claimLock, releaseLock, renewLock, TURN_RENEW_MS } from '../coordinator/lock'
import { scheduleConversation } from '../coordinator/scheduler'
import { conversationEvents, type ConversationEvents } from '../coordinator/events'
import { Logger } from '../../server/utils/logger'
import { compactor as defaultCompactor } from '.'
import type { SegmentCompactor } from './compactor'
import { openSegment } from './segments'

type Ctx = { user?: { id: string } }

const logger = new Logger('ConversationCompaction')

export const SEGMENT_NOT_FOUND = 'Summary not found'
export const REPLY_RUNNING = 'A reply is being written. Summarise once it has finished.'
export const NOTHING_YET = 'There is not enough in this conversation yet to summarise.'
export const COULD_NOT_SUMMARISE = 'The conversation could not be summarised just now. Try again in a moment.'

function userOf(context: Ctx): string {
  if (!context.user) throw new HttpError(401)
  return context.user.id
}

export const getConversationSegment = async (args: GetConversationSegmentArgs, context: Ctx): Promise<ConversationSegmentView> => {
  await requireConversationReader(args?.conversationId, userOf(context))
  const row = typeof args.segmentId === 'string'
    ? await prisma.conversationSegment.findFirst({ where: { id: args.segmentId, conversationId: args.conversationId } })
    : null
  if (!row) throw new HttpError(404, SEGMENT_NOT_FOUND)
  const { ledgerHead: _head, ...view } = openSegment(row)
  return view
}

export interface SummariseNowDeps {
  compactor: SegmentCompactor
  resolveAccess: ResolveConversationAccess
  schedule(conversationId: string): void
  events: Pick<ConversationEvents, 'summarise'>
}

const defaults: SummariseNowDeps = {
  compactor: defaultCompactor, resolveAccess: (ref, userId) => resolveTalkingFor(ref, userId, 'summary'), schedule: scheduleConversation, events: conversationEvents,
}

/**
 * Starts the compaction and returns once there is something to fold, before the summariser is asked (walkthrough
 * finding 36: one request waiting on the model ran past the browser's limit). The rest runs apart: its
 * SUMMARISED message and an `ended` event reach the screens over the socket, or a `failed` event with why.
 * `finished` settles when it is done, for the caller that waits (a test).
 */
export async function summariseNow(conversationId: string, userId: string, deps: SummariseNowDeps = defaults): Promise<{ finished: Promise<void> }> {
  const ref = await requireConversationSpeaker(conversationId, userId)
  const row = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { talkingModel: true, talkingProviderId: true },
  })
  if (!row.talkingModel || !row.talkingProviderId) throw new HttpError(409, NOTHING_YET)
  const { access, problem } = await deps.resolveAccess(ref, userId)
  if (!access) throw new HttpError(409, problem ?? 'There is no model to summarise with here.')

  // The lock's holder is this compaction, not a turn: recovery finds no turn for it and only lets the lock go.
  const holder = randomUUID()
  if (!(await claimLock(prisma, conversationId, holder, new Date()))) throw new HttpError(409, REPLY_RUNNING)
  const renew = setInterval(() => {
    void renewLock(conversationId, holder).catch(err => logger.warn(`Could not renew the lease of a compaction: ${String(err)}`))
  }, TURN_RENEW_MS)
  renew.unref()

  let folding = false
  let returned!: (folds: boolean) => void
  const started = new Promise<boolean>(resolve => { returned = resolve })
  const tell = (state: 'started' | 'ended' | 'failed', reason?: string) => {
    try {
      deps.events.summarise?.({ conversationId, state, ...(reason ? { reason } : {}) })
    } catch (err) {
      logger.warn(`Could not tell the screens about a compaction: ${String(err)}`)
    }
  }
  let failure: unknown = null
  const finished = (async () => {
    try {
      await deps.compactor.compact(conversationId, access, 'person', {
        onFold: () => { folding = true; tell('started'); returned(true) },
      })
      // Nothing written after it folded: another compaction got there first, and its marker stands.
      if (folding) tell('ended')
    } catch (err) {
      logger.error(`Could not summarise conversation ${conversationId}`, err)
      failure = err
      if (folding) tell('failed', COULD_NOT_SUMMARISE)
    } finally {
      clearInterval(renew)
      await releaseLock(prisma, conversationId, holder).catch(err => logger.warn(`Could not let a compaction's lock go: ${String(err)}`))
      deps.schedule(conversationId)
      returned(false)
    }
  })()

  if (await started) return { finished }
  await finished
  if (failure) throw new HttpError(502, COULD_NOT_SUMMARISE)
  throw new HttpError(409, NOTHING_YET)
}

export const summariseConversationNow = async (args: SummariseNowArgs, context: Ctx): Promise<void> => {
  await summariseNow(args?.conversationId, userOf(context))
}
