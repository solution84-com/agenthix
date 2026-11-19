/**
 * The playground's leads: what writes a reply, as a model step's stream (`LeadStreamEvent`), so the lead's voice
 * logic reads every one the same way. The fake model (the fake lead in the code): a set reply after a delay set on
 * the page, for testing waits; or a model the organisation has set up, through hq's model adapter, sent the lead's own
 * context (context.ts). Calls are development calls: their access carries no costing, so they write no row in any
 * usage report.
 */
import { FAKE_MAX_DELAY_MS, type PlaygroundLead } from '../../../shared/voicePlayground'
import type { LeadMessage, LeadStreamEvent, ModelAdapter, ResolvedAccess } from '../../contract'
import { reasoningFor } from '../../lead/voiceLogic'
import { playgroundContext, playgroundTools, type PlaygroundTurn } from './context'

export const FAKE_REPLY =
  'Right, I can look at that. The first thing I would check is where the time goes before the first word. ' +
  'Then I would see whether one message ever starts more than one turn. Tell me which one you want first.'

const FAKE_TEXT_MAX = 2_000

export interface LeadRun {
  /** The model that answers, as the page names it; null for the fake reply. */
  model: string | null
  /** One model step; `after`: the earlier step and its calls' answers, for a second step (`styleStep.ts`). */
  events(turn: PlaygroundTurn, signal: AbortSignal, after?: readonly LeadMessage[]): AsyncIterable<LeadStreamEvent>
}

export interface LeadDeps {
  model: ModelAdapter
  /** The access for a model the page named, checked against what this person may use; throws with a line they read. */
  access(userId: string, model: string): Promise<ResolvedAccess>
  /** One per page, for providers that route caching by a key. */
  cacheKey: string
  wait?(ms: number, signal: AbortSignal): Promise<void>
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted || ms <= 0) { resolve(); return }
    const t = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done() { clearTimeout(t); signal.removeEventListener('abort', done); resolve() }
  })
}

/** The fake text in pieces of a few words, `pieceMs` apart, as a model streams. */
export function fakeLead(choice: { delayMs?: unknown; text?: unknown }, wait = sleep, pieceMs = 40): LeadRun {
  const delayMs = typeof choice.delayMs === 'number' && Number.isFinite(choice.delayMs) ? Math.max(0, Math.min(choice.delayMs, FAKE_MAX_DELAY_MS)) : 1_000
  const text = typeof choice.text === 'string' && choice.text.trim() ? choice.text.slice(0, FAKE_TEXT_MAX) : FAKE_REPLY
  return {
    model: null,
    async *events(_turn, signal) {
      await wait(delayMs, signal)
      const pieces = text.match(/\S+\s*/g) ?? []
      for (let i = 0; i < pieces.length; i += 3) {
        if (signal.aborted) return
        yield { type: 'text', text: pieces.slice(i, i + 3).join('') }
        await wait(pieceMs, signal)
      }
    },
  }
}

/** A model the organisation has set up, sent what hq's lead is sent, reasoning as a spoken turn's first step does. */
export function modelLead(model: string, access: Promise<ResolvedAccess>, deps: Pick<LeadDeps, 'model' | 'cacheKey'>): LeadRun {
  return {
    model,
    async *events(turn, signal, after) {
      const context = playgroundContext(turn)
      const quick = reasoningFor({ heard: turn.listening, spokenMessage: context.spokenMessage === true, step: after ? 1 : 0 })
      yield* deps.model.stream({
        access: await access, system: context.system, messages: [...context.messages, ...(after ?? [])], cacheAfterMessage: context.cacheAfterMessage,
        tools: playgroundTools(turn), ...quick, cacheKey: deps.cacheKey, signal,
      })
    },
  }
}

/** The lead for a choice from the page; throws, with a line the page shows, when it cannot be made. */
export function leadFor(choice: PlaygroundLead | undefined, userId: string, deps: LeadDeps): LeadRun {
  if (choice?.kind === 'fake') return fakeLead(choice, deps.wait)
  if (choice?.kind === 'model' && typeof choice.model === 'string' && choice.model.trim()) {
    const access = deps.access(userId, choice.model)
    access.catch(() => undefined)
    return modelLead(choice.model, access, deps)
  }
  throw new Error('Choose who answers: the fake model or a model.')
}

/** Whether a stream's events mean the step needs the context's spoken message, for the turn's reading. */
export function spokenMessageOf(turn: PlaygroundTurn): boolean {
  return playgroundContext(turn).spokenMessage === true
}
