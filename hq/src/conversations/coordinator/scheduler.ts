/**
 * The coordinator's loop for one conversation (conversation layer spec, A message while a reply streams): claim
 * the next turn, run it while renewing its lease, release the lock, and go on while messages or cards wait.
 * Anything may ask for a conversation to be scheduled — a message admitted, a card written, a turn ending,
 * recovery — since only one claim can win; a request that finds a turn running, or nothing waiting, does nothing.
 * A turn that answered no person notifies the reader with its first line (notify.ts).
 */
import { prisma } from 'wasp/server'
import { WAIT_LIMIT_MS } from '../../shared/conversations/protocol'
import { Logger } from '../../server/utils/logger'
import { appendMessage, toMessageView, updateMessage } from '../store/messages'
import { fixTalkingAccess, resolveTalking } from '../access/talkingModel'
import { reportCall } from '../../routing/resolver'
import { mintTurnCapability } from '../tools/mintTurnCapability'
import { toolAdapter } from '../tools/toolAdapter'
import { createModelAdapter } from '../model'
import { claimNextTurn, type ClaimedTurn } from './claim'
import { assembleContext } from './context'
import { conversationEvents } from './events'
import { endLive, startLive, stopLive } from './liveTurns'
import { releaseLock, renewLock, TURN_RENEW_MS } from './lock'
import { mailbox } from './mailbox'
import { runTurn, type OperationLine, type StopReason, type TurnDeps } from './turn'
import { requestStop, turnRecord } from './turnRecord'
import { openJson, openText } from '../sealing'
import { outstandingOperations } from '../work/settle'
import { setTaskStart } from '../work/tasks/taskOperations'
import { boundaryName, continuationCheck } from './continuationChecks'
import { notifyAfterCardTurn } from './notify'
import { turnVoice } from '../voice/registry'
import { dropLostPlaces } from '../places'
import { compactAtStart, ledger } from '../long'
import { personTimezone } from '../../server/controlplane/personTimezone'
import type { BackgroundSources } from './moveToBackground'
import { clockNote } from './clock'
import { titleFrom, titleRequest } from './titling'

const logger = new Logger('ConversationCoordinator')

/** Model calls in one turn at most; each round of tool calls is one. The guard: its last call is words only. */
export const MAX_TURN_STEPS = 8
/** A reply carries on in the background after this many steps that looked something up. */
export const MOVE_AFTER_STEPS = 4

/** A project's name for a step's line, by the id or key a call was given. */
async function projectName(idOrKey: string): Promise<string | null> {
  const row = await prisma.project.findFirst({ where: { OR: [{ id: idOrKey }, { key: idOrKey.toUpperCase() }] }, select: { name: true } })
  return row?.name ?? null
}

/** What hq's own move to the background reads: the person's words, and the conversation's project. */
const background: BackgroundSources = {
  async asked(inputIds) {
    const rows = await prisma.conversationMessage.findMany({
      where: { id: { in: [...inputIds] }, role: 'PERSON', kind: 'TEXT' },
      orderBy: { seq: 'asc' },
    })
    return rows.map(toMessageView).flatMap(m => (m.kind === 'TEXT' ? [m.body.text] : []))
  },
  project: projectId => prisma.project.findUnique({ where: { id: projectId }, select: { key: true, name: true } }),
}

async function operationLine(operationId: string): Promise<OperationLine | null> {
  const row = await prisma.operation.findUnique({
    where: { id: operationId },
    select: { conversationId: true, kind: true, title: true, state: true, boundaryType: true, boundaryId: true, resultSummary: true },
  })
  if (!row) return null
  const startsAt = setTaskStart(row)
  return {
    title: openText(row.title),
    state: row.state,
    ...(row.boundaryType && row.boundaryId ? { boundaryName: await boundaryName(row.boundaryType, row.boundaryId) } : {}),
    ...(startsAt ? { startsAt } : {}),
    outstanding: await outstandingOperations(row.conversationId),
  }
}

/** How long naming a conversation may take before it is left for the next reply. */
const TITLE_WAIT_MS = 20_000

export const turnDeps: TurnDeps = {
  model: createModelAdapter({ report: reportCall }),
  tools: toolAdapter,
  resolveAccess: resolveTalking,
  fixTalkingAccess,
  // Every turn starts with the conversation's places re-checked: one its person can no longer open drops out (adr-0152).
  async mint(input) {
    await dropLostPlaces(input.conversation.id)
    return mintTurnCapability(input)
  },
  context: assembleContext,
  appendMessage,
  updateMessage,
  async hasOperationStarted(operationId) {
    const row = await prisma.conversationMessage.findFirst({ where: { operationId, kind: 'OPERATION_STARTED' }, select: { id: true } })
    return row !== null
  },
  operationLine,
  async titleConversation(conversationId, access, reply) {
    const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { title: true } })
    if (!row || row.title) return
    const first = await prisma.conversationMessage.findFirst({
      where: { conversationId, role: 'PERSON', kind: 'TEXT' }, orderBy: { seq: 'asc' }, select: { body: true },
    })
    if (!first) return
    const ask = openJson<{ text: string }>(first.body).text
    const answer = await turnDeps.model.complete(titleRequest({ access, ask, reply, conversationId, signal: AbortSignal.timeout(TITLE_WAIT_MS) }))
    const title = titleFrom(answer.text)
    if (title) await prisma.conversation.updateMany({ where: { id: conversationId, title: null }, data: { title } })
  },
  record: turnRecord,
  events: conversationEvents,
  // Through a function: the mailbox schedules conversations, so each module reaches the other only when called.
  mailbox: { operationSettled: (conversationId, operationId) => mailbox.operationSettled(conversationId, operationId) },
  log: line => logger.info(line),
  logError: (message, err) => logger.error(message, err),
  now: () => new Date(),
  waitLimitMs: WAIT_LIMIT_MS,
  maxSteps: MAX_TURN_STEPS,
  moveAfterSteps: MOVE_AFTER_STEPS,
  background,
  clock: async personId => clockNote(new Date(), personId ? await personTimezone(personId) : null),
  timezone: personTimezone,
  stepNames: { project: projectName },
  voice: turnVoice,
  compactAtStart,
  ledger,
}

async function announceTaken(claimed: ClaimedTurn): Promise<void> {
  const rows = await prisma.conversationMessage.findMany({ where: { id: { in: claimed.inputIds } }, orderBy: { seq: 'asc' } })
  for (const row of rows) conversationEvents.messageUpdated(claimed.conversation.id, toMessageView(row))
}

async function runClaimed(claimed: ClaimedTurn, deps: TurnDeps): Promise<void> {
  const conversationId = claimed.conversation.id
  const { turnId } = claimed
  const entry = startLive(conversationId, turnId)
  const { signal } = entry.controller
  const renew = setInterval(() => {
    void (async () => {
      if (!(await renewLock(conversationId, turnId))) entry.controller.abort('lost' satisfies StopReason)
      else if (await turnRecord.stopRequested(turnId)) entry.controller.abort('stop' satisfies StopReason)
    })().catch(err => logger.warn(`Could not renew the lease of turn ${turnId}: ${err instanceof Error ? err.message : String(err)}`))
  }, TURN_RENEW_MS)
  renew.unref()
  let outcome: Awaited<ReturnType<typeof runTurn>> | null = null
  try {
    outcome = await runTurn(deps, { claimed, signal, onText: text => { entry.text = text }, onSteps: live => { entry.steps = live } })
  } finally {
    clearInterval(renew)
    endLive(conversationId, turnId)
    await releaseLock(prisma, conversationId, turnId)
  }
  // A reply that presented cards: its first line, or when it could say nothing, each card's own. Stopped by a
  // person, who is there; or lost to recovery, which has failed it.
  if (claimed.trigger !== 'MESSAGE' && outcome.state !== 'CANCELLED' && signal.reason !== 'lost') {
    const said = outcome.state === 'COMPLETED' ? outcome.text : null
    await notifyAfterCardTurn(conversationId, turnId, said).catch(err => logger.error(`Could not notify the reply of turn ${turnId}`, err))
  }
}

/** Runs the conversation's waiting turns one after another, until none is left or another turn holds it. */
export async function driveConversation(conversationId: string, deps: TurnDeps = turnDeps): Promise<void> {
  for (;;) {
    const holdsCards = deps.voice?.holdsCards
    const { claimed, abandoned, held } = await claimNextTurn(conversationId, new Date(), continuationCheck, holdsCards ? id => holdsCards(id) : undefined)
    if (abandoned) {
      conversationEvents.message(conversationId, abandoned)
      if (abandoned.turnId) conversationEvents.turn({ conversationId, turnId: abandoned.turnId, state: 'FAILED', error: (abandoned.body as { reason: string }).reason })
    }
    if (held) deps.voice?.raiseHand?.(conversationId, held)
    if (!claimed) return
    await announceTaken(claimed)
    await runClaimed(claimed, deps)
  }
}

export function scheduleConversation(conversationId: string): void {
  void driveConversation(conversationId).catch(err => logger.error(`Could not run the next turn of conversation ${conversationId}`, err))
}

/**
 * Stops the conversation's running turn: here if it runs here, and on its row for the process that runs it
 * otherwise. What it streamed is kept, marked interrupted. Nothing to stop is not an error.
 */
export async function stopRunningTurn(conversationId: string, reason: StopReason): Promise<void> {
  const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { activeTurnId: true } })
  stopLive(conversationId, reason)
  if (row?.activeTurnId) await requestStop(row.activeTurnId)
}
