/**
 * What the playground's lead is sent: the lead's own context, built by the code a turn uses (coordinator/context.ts
 * `contextFrom`), from the playground's conversation instead of the database. The agent is the built-in one in the
 * person's own space with the `voiceBridge` flag on, so the base instructions and the voice turn block are the ones
 * hq sends; there are no memory, places or other people.
 *
 * The tools are the lead's voice logic's keep_listening and a stand-in start_work that runs nothing, so a reply that
 * needs real work can be seen opening with its sentence and starting it. With the light model, the lead's
 * set_listening_style too, which the playground sends as hq does (`turn.ts`).
 */
import { z } from 'zod'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { PLAYGROUND_PERSON_ID, type PlaygroundEntry } from '../../../shared/voicePlayground'
import type { LeadToolDefinition } from '../../contract'
import { contextFrom, placeLabelOf, type LeadContext } from '../../coordinator/context'
import { keepListeningDefinition } from '../../lead/voiceLogic'
import { listeningStyleDefinition } from '../../lead/listeningStyle'

import { PLAYGROUND_AGENT } from './light/names'

export { PLAYGROUND_AGENT }

/** The start_work the playground offers: named as hq's, so it reads as work, and run by nothing. */
export const STAND_IN_START_WORK: LeadToolDefinition = {
  name: 'start_work',
  description: 'Starts background work on what the person asked for. The result arrives later, as a report.',
  input: z.object({
    title: z.string().min(1).max(200).describe('One line naming the work as the person would say it.'),
    brief: z.string().min(1).describe('Everything the work needs to know.'),
  }),
}

export const PLAYGROUND_TOOLS: LeadToolDefinition[] = [STAND_IN_START_WORK, keepListeningDefinition()]

/**
 * With the light model, the heavy model judges nothing and holds nothing: keep_listening is not offered, as in hq;
 * set_listening_style is, as in hq with the flag on.
 */
export function playgroundTools(turn: Pick<PlaygroundTurn, 'lightModel'>): LeadToolDefinition[] {
  return turn.lightModel ? [STAND_IN_START_WORK, listeningStyleDefinition()] : PLAYGROUND_TOOLS
}

export interface PlaygroundTurn {
  /** The conversation so far, oldest first: what the lead may read of it. */
  history: readonly PlaygroundEntry[]
  /** The person's entries this turn answers. */
  answers: readonly PlaygroundEntry[]
  /** Voice is on: the person hears the reply. */
  listening: boolean
  trailedOff: boolean
  /** They went on after a turn held open, and their words joined the message. */
  wentOn: boolean
  adaptiveVoice: boolean
  /** The light model listens (the flag `voiceListener`): the voice turn block says only how to speak. */
  lightModel?: boolean
  /** Tone is on for the voice session: the reply is asked for its `[tone: …]` tag. */
  toneOn?: boolean
}

function view(entry: PlaygroundEntry, seq: number): ConversationMessageView {
  const person = entry.role === 'person'
  return {
    id: entry.id, seq, clientMessageId: null, role: person ? 'PERSON' : 'AGENT',
    authorId: person ? PLAYGROUND_PERSON_ID : null, agentId: person ? null : 'playground-agent',
    kind: 'TEXT', body: { text: entry.text }, spoken: person && entry.spoken === true,
    interrupted: entry.interrupted === true, withdrawn: entry.withdrawn === true, encouragement: false,
    operationId: null, turnId: entry.turnId ?? null, queueState: null, createdAt: new Date(entry.at).toISOString(),
  } as ConversationMessageView
}

/** What a reply reads, as hq's record keeps it: nothing withdrawn, failed, or stopped before a word. */
export function readable(entries: readonly PlaygroundEntry[]): PlaygroundEntry[] {
  return entries.filter(e => !e.withdrawn && e.text !== '' && (e.role === 'person' || e.state === 'COMPLETED' || e.state === 'CANCELLED'))
}

export function playgroundContext(turn: PlaygroundTurn): LeadContext {
  const history = turn.history.map((e, i) => view(e, i + 1))
  return contextFrom({
    instructions: {
      agentName: PLAYGROUND_AGENT, agentRole: null, placeLabel: placeLabelOf({}),
      agentInstructions: null, orgInstructions: null, featuresOn: turn.lightModel ? ['voiceBridge', 'voiceListener'] : ['voiceBridge'],
    },
    segments: [],
    history,
    awaiting: new Set(),
    turn: { trigger: 'MESSAGE', inputIds: turn.answers.map(a => a.id) },
    memory: null,
    places: null,
    listening: turn.listening
      ? { trailedOff: turn.trailedOff, wentOnAfter: null, wentOnAfterHold: turn.wentOn, adaptiveVoice: turn.adaptiveVoice, toneOn: turn.toneOn === true }
      : null,
  })
}
