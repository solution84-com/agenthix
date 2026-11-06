/**
 * Hearing an answer read aloud: the speaker under an agent's answer reads it in the agent's voice, through the text
 * to speech provider voice in a conversation uses (`agentVoice`), costed to the conversation's place like voice. The
 * answer is read as voice reads a reply (`speechUnits`: markup stripped, code blocks and tables skipped), cut into
 * parts of whole sentences the provider takes in one call; the screen asks for them one after another. Anyone who can
 * read the conversation can hear its answers. The speaker is shown only where text to speech works for its agent.
 */
import { HttpError, prisma } from 'wasp/server'
import type { ConversationHomeRef } from '../contract'
import { requireConversationReader } from '../readingRule'
import { toMessageView } from '../store/messages'
import { scopeOfConversation } from '../../voice/speechScope'
import { inworldTtsAdapter } from '../../voice/inworldAdapter'
import { failureKind } from '../../voice/speechAccess'
import { reportCall } from '../../routing/resolver'
import { recordTts } from '../../billing/sources/voice'
import { agentVoice, type AgentVoice } from './speech'
import { speechUnits } from './speechUnits'

/** The most characters one call to the provider is given. */
export const LISTEN_PART_CHARS = 900

/** An answer's spoken words in parts of whole sentences, each at most `LISTEN_PART_CHARS` (a longer sentence by words). */
export function listenParts(text: string, max = LISTEN_PART_CHARS): string[] {
  const parts: string[] = []
  let part = ''
  const add = (piece: string) => {
    if (part && part.length + 1 + piece.length > max) { parts.push(part); part = '' }
    part = part ? `${part} ${piece}` : piece
  }
  for (const { text: sentence } of speechUnits(text, true)) {
    if (sentence.length <= max) { add(sentence); continue }
    for (const word of sentence.split(' ')) add(word.slice(0, max))
  }
  if (part) parts.push(part)
  return parts
}

export type ReplyVoiceView = { available: boolean }
export type SpeakAnswerArgs = { conversationId: string; messageId: string; part: number }
export type SpeakAnswerResult = { audio: string; parts: number }

export interface ListenDeps {
  reader(conversationId: string, userId: string): Promise<ConversationHomeRef>
  /** The words of an agent's answer in the conversation; null when the message is not one. */
  answer(conversationId: string, messageId: string): Promise<{ text: string; agentId: string | null } | null>
  voice(agentId: string, ref: ConversationHomeRef, userId: string): Promise<{ voice: AgentVoice } | { reason: string }>
  synthesize(text: string, voice: AgentVoice): Promise<Buffer>
  /** What the call came to, for the provider's health, and its characters for the ledger. */
  spent(voice: AgentVoice, characters: number, conversationId: string): void
  failed(voice: AgentVoice, message: string): void
}

export const NOT_AN_ANSWER = 'That message is not an answer in this conversation, so it cannot be read aloud. Nothing was changed.'
export const COULD_NOT_READ = 'The text to speech provider did not answer, so the answer was not read aloud. Try again in a moment.'

export function createListen(deps: ListenDeps) {
  return {
    async available(conversationId: string, userId: string): Promise<ReplyVoiceView> {
      const ref = await deps.reader(conversationId, userId)
      if (!ref.agentId) return { available: false }
      return { available: 'voice' in (await deps.voice(ref.agentId, ref, userId)) }
    },
    async speak(args: SpeakAnswerArgs, userId: string): Promise<SpeakAnswerResult> {
      const ref = await deps.reader(args.conversationId, userId)
      const answer = typeof args.messageId === 'string' ? await deps.answer(ref.id, args.messageId) : null
      if (!answer) throw new HttpError(404, NOT_AN_ANSWER)
      const parts = listenParts(answer.text)
      const index = args.part
      if (!Number.isInteger(index) || index < 0 || index >= parts.length) throw new HttpError(400, 'That part of the answer does not exist. Nothing was changed.')
      const agentId = answer.agentId ?? ref.agentId
      const spoken = agentId ? await deps.voice(agentId, ref, userId) : { reason: 'This answer has no agent to read it in its voice.' }
      if (!('voice' in spoken)) throw new HttpError(503, spoken.reason)
      const text = parts[index]!
      try {
        const audio = await deps.synthesize(text, spoken.voice)
        deps.spent(spoken.voice, text.length, ref.id)
        return { audio: audio.toString('base64'), parts: parts.length }
      } catch (err) {
        deps.failed(spoken.voice, err instanceof Error ? err.message : String(err))
        throw new HttpError(502, COULD_NOT_READ)
      }
    },
  }
}

const listen = createListen({
  reader: requireConversationReader,
  async answer(conversationId, messageId) {
    const row = await prisma.conversationMessage.findFirst({ where: { id: messageId, conversationId, role: 'AGENT', kind: { in: ['TEXT', 'FAILED'] } } })
    if (!row) return null
    const view = toMessageView(row)
    const text = view.kind === 'TEXT' ? view.body.text : view.kind === 'FAILED' ? view.body.partialText ?? '' : ''
    return text.trim() ? { text, agentId: view.agentId } : null
  },
  voice: async (agentId, ref, userId) => agentVoice(agentId, await scopeOfConversation(ref, userId)),
  synthesize: (text, voice) => inworldTtsAdapter.synthesize(text, { apiKey: voice.apiKey, voiceId: voice.voiceId, model: voice.model }),
  spent(voice, characters, conversationId) {
    reportCall(voice.providerId, null)
    if (voice.costed) recordTts(voice.costed, characters, { conversationId })
  },
  failed: (voice, message) => reportCall(voice.providerId, failureKind(null, message), message.slice(0, 200)),
})

type Ctx = { user?: { id: string } | null }

function userOf(context: Ctx): string {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user.id
}

/** Whether the speaker shows under this conversation's answers: text to speech works for its agent. */
export const getReplyVoice = async (args: { conversationId: string }, context: Ctx): Promise<ReplyVoiceView> =>
  listen.available(args?.conversationId, userOf(context))

/** One part of an answer, read aloud in the agent's voice, as base64 audio, and how many parts the answer has. */
export const speakAnswer = async (args: SpeakAnswerArgs, context: Ctx): Promise<SpeakAnswerResult> =>
  listen.speak(args, userOf(context))
