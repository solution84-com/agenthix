/**
 * The lead's context for one turn (conversation layer spec, Context, knowledge and security; long conversations
 * spec), in four parts ordered by how often each changes, so the prefix the provider caches stays put:
 * 1. the lead's base instructions, then the agent's own and the organisation's as a run gets them from its
 *    packages — a cache breakpoint after them;
 * 2. the compaction block, once the conversation has been compacted — a breakpoint after it;
 * 3. the window: every message since the last compaction, verbatim, up to the last one this turn answers — a
 *    breakpoint at the last message before this turn's input;
 * 4. the turn block (the conversation's places, whether background work can search the web, memory, voice, what to
 *    do with cards), appended to the turn's own message.
 * Assembled once at the start of a turn: nothing in the first three parts changes within it.
 *
 * A run also gets its boundary's instructions override and the place's AGENTS.md, which live on the site's
 * disk; the lead, in hq, does not read them.
 */
import { prisma } from 'wasp/server'
import { pickedSkillOf, sharedFilesOf, type FeatureFlag, type FoldedName } from '@agenthix/core'
import type { LeadMessage, PromptPart } from '../contract'
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import { MESSAGE_PAGE_SIZE } from '../../shared/conversations/protocol'
import { unseenWithdrawn } from '../../shared/conversations/withdrawn'
import { readAgentContent } from '../../packages/agentPackageService'
import { readCurrentFiles } from '../../packages/packageStore'
import { ORG_FILE } from '../../packages/orgPackageService'
import { readMessages } from '../store/messages'
import { cardTurnBlock, leadBaseInstructions, leadKnowledgeRules, leadLongRules, listeningTurnBlock, type ContinuationStep } from '../lead/instructions'
import { voiceTurnBlock } from '../lead/voiceTurnBlock'
import { voiceBlockOf } from './voiceBlock'
import { ZOOM_RULES } from '../long/zoom/rules'
import { memoryForTurn } from '../memory/turnMemory'
import { withMemoryBlock } from '../memory/turnBlock'
import { listeningSession } from '../voice/registry'
import { compactionBlock, type OpenedSegment } from '../long/block'
import { readSegments } from '../long/segments'
import { awaitingCardsWhere, type ClaimedTurn, type TurnConversation } from './claim'
import { answerForLead, approvalForLead, resultForLead, wasCapped } from './cards'
import { madeForLead } from './startedWords'
import { pickedSkillNote } from '../work/pickedSkill'
import { placesForLead, placesTurnBlock, type PlacesForLead } from '../lead/placesBlock'
import { backgroundSearchFor, webSearchTurnBlock, type BackgroundSearch } from '../lead/webSearchBlock'
import { outcomeForLead } from '../../assets/proposals/types'
import { featuresOn } from '../../features/switches'
import { usernames } from '../../projects/onBehalfOfOperations'
import { joinLead, withShared } from '../shared/forLead'

export interface LeadContext {
  system: PromptPart[]
  messages: LeadMessage[]
  /** The last message before this turn's input: the end of what the provider may cache from the last turn. */
  cacheAfterMessage?: number
  /**
   * The turn answers a spoken message under the voice turn block (`voiceBridge`): its model may hold the turn open
   * with keep_listening (keepListening.ts), and its first step reasons as little as it can.
   */
  spokenMessage?: boolean
  /** The voice turn block asked the reply for a `[tone: …]` tag (Tone on): the turn takes it out (lead/toneTag.ts). */
  toneTag?: boolean
}

export interface Instructions {
  agentName: string
  agentRole: string | null
  placeLabel: string
  agentInstructions: string | null
  orgInstructions: string | null
  /** The flagged features on for the organisation, whose parts of the instructions are written (adr-0172). */
  featuresOn?: readonly FeatureFlag[]
  /** The turn's folded tools by name and area (tools/foldedTools.ts), for the area lines. */
  foldedTools?: readonly FoldedName[]
}

export function systemParts(i: Instructions): PromptPart[] {
  const parts: PromptPart[] = [{ text: `${leadBaseInstructions(i)}\n\n${leadKnowledgeRules()}\n\n${leadLongRules()}` }]
  if (i.agentInstructions) parts.push({ text: `# Your instructions\n\n${i.agentInstructions}` })
  if (i.orgInstructions) parts.push({ text: `# Your organisation\n\n${i.orgInstructions}` })
  parts[parts.length - 1] = { ...parts[parts.length - 1]!, cacheAfter: true }
  return parts
}

/**
 * The instructions, then, once something is folded, the compaction block and how to read further into the past, as a
 * second part with its own breakpoint: a conversation not yet folded carries neither.
 */
export function systemWithBlock(i: Instructions, segments: readonly OpenedSegment[]): PromptPart[] {
  const block = compactionBlock(segments)
  return block ? [...systemParts(i), { text: `${block}\n\n${ZOOM_RULES}`, cacheAfter: true }] : systemParts(i)
}

/** The people who spoke in a conversation, by id: named only where more than one did, so one person's alone read as before. */
export type Speakers = ReadonlyMap<string, string>

export function personAuthors(history: readonly ConversationMessageView[]): string[] {
  const ids = history.filter(m => m.role === 'PERSON' && m.kind === 'TEXT' && m.authorId).map(m => m.authorId as string)
  return [...new Set(ids)]
}

/** Who said what, for a conversation several people share (a task's thread); undefined when one person spoke. */
export async function speakersOf(history: readonly ConversationMessageView[]): Promise<Speakers | undefined> {
  const authors = personAuthors(history)
  if (authors.length < 2) return undefined
  return usernames(authors)
}

export const INTERRUPTED_HERE = '[The person stopped this reply here; nothing after it was said to them.]'

/** A reply's words, then what it started or set (finding 34): kept on its steps, so it holds across reloads. */
function withMade(words: string, steps: Parameters<typeof madeForLead>[0]): string {
  const made = madeForLead(steps)
  if (!made) return words
  return words.trim() ? `${words}\n\n${made}` : made
}

/**
 * What the record holds, as the model reads it: what was said, in order, each side's run of messages as one.
 * `self`: the reading agent's name, so a request from another agent's task run is named as theirs.
 */
export function asLead(message: ConversationMessageView, self?: string, speakers?: Speakers): LeadMessage | null {
  if (message.queueState === 'CANCELLED' || unseenWithdrawn(message)) return null
  switch (message.kind) {
    case 'TEXT':
      if (message.role === 'PERSON') {
        const skill = pickedSkillOf(message.body.skill)
        const said = skill ? `${message.body.text}\n\n${pickedSkillNote(skill)}` : message.body.text
        const words = withShared(said, message.id, sharedFilesOf(message.body.shared))
        // Where several people speak, each message says whose it is: the run of them joins into one turn of the model's.
        if (speakers && message.authorId) return { role: 'user', ...words, content: `${speakers.get(message.authorId) ?? 'Someone'}: ${words.content}` }
        return { role: 'user', ...words }
      }
      // A reply stopped or spoken over keeps only what was said: the lead is told it was cut there.
      if (message.interrupted) {
        const heard = message.body.text.trim()
        return { role: 'assistant', content: `${withMade(heard, message.body.thinking?.steps)}\n\n${INTERRUPTED_HERE}`.trimStart() }
      }
      return { role: 'assistant', content: withMade(message.body.text, message.body.thinking?.steps) }
    case 'FAILED': {
      const said = withMade(message.body.partialText ?? '', message.body.thinking?.steps)
      return said ? { role: 'assistant', content: said } : null
    }
    case 'SUMMARISED':
      // A compaction's marker: the compaction block already holds what it says.
      if (message.body.segmentId) return null
      return { role: 'user', content: `Summary of the conversation so far:\n\n${message.body.summary}` }
    case 'RESULT':
      return { role: 'user', content: resultForLead(message.body) }
    case 'APPROVAL_REQUEST':
      return { role: 'user', content: approvalForLead(message.body, self) }
    case 'APPROVAL_ANSWER':
      return { role: 'user', content: answerForLead(message.body) }
    case 'ACTION': {
      // A proposed skill's review, told on the next turn (skills spec part 5); every other action line is the lead's own.
      const outcome = outcomeForLead(message.body)
      return outcome ? { role: 'user', content: outcome } : null
    }
    default:
      return null
  }
}

/**
 * The messages up to the last one this turn answers, and the index of the last one wholly from before this
 * turn — where a cache breakpoint may go. A person's message another turn has still to answer is left out, and
 * so is a card awaiting another turn (`awaiting`): the turn that presents it reads it.
 */
export function leadMessages(
  history: readonly ConversationMessageView[],
  inputIds: readonly string[],
  awaiting: ReadonlySet<string> = new Set(),
  self?: string,
  speakers?: Speakers,
): { messages: LeadMessage[]; cacheAfter?: number } {
  const ordered = [...history].sort((a, b) => a.seq - b.seq)
  const inputSeqs = ordered.filter(m => inputIds.includes(m.id)).map(m => m.seq)
  const firstInput = Math.min(...inputSeqs)
  const lastInput = Math.max(...inputSeqs)
  const messages: LeadMessage[] = []
  let cacheAfter: number | undefined
  for (const message of ordered) {
    if (message.seq > lastInput) break
    if (message.role === 'PERSON' && (message.kind === 'TEXT' || message.kind === 'APPROVAL_ANSWER') && message.turnId === null && !inputIds.includes(message.id)) continue
    if (awaiting.has(message.id) && !inputIds.includes(message.id)) continue
    const lead = asLead(message, self, speakers)
    if (!lead) continue
    const before = message.seq < firstInput
    const last = messages[messages.length - 1]
    if (last && last.role === lead.role && lead.role !== 'tool') {
      messages[messages.length - 1] = joinLead(last, lead)
      // A message from before that this turn's input joins is no longer stable.
      if (!before && cacheAfter === messages.length - 1) cacheAfter = messages.length > 1 ? messages.length - 2 : undefined
    } else {
      messages.push(lead)
    }
    if (before) cacheAfter = messages.length - 1
  }
  return { messages, cacheAfter }
}

/** Messages in order as the model reads them, each side's run joined: what a compaction folds. */
export function joinedMessages(history: readonly ConversationMessageView[], speakers?: Speakers): LeadMessage[] {
  const messages: LeadMessage[] = []
  for (const message of [...history].sort((a, b) => a.seq - b.seq)) {
    const lead = asLead(message, undefined, speakers)
    if (!lead) continue
    const last = messages[messages.length - 1]
    if (last && last.role === lead.role && lead.role !== 'tool') {
      messages[messages.length - 1] = joinLead(last, lead)
    } else {
      messages.push(lead)
    }
  }
  return messages
}

/** The window: the messages after the latest segment's span. */
export function windowOf<T extends { seq: number }>(history: readonly T[], segments: readonly OpenedSegment[]): T[] {
  const after = segments[segments.length - 1]?.lastSeq ?? 0
  return history.filter(m => m.seq > after)
}

export async function readAll(conversationId: string): Promise<ConversationMessageView[]> {
  const all: ConversationMessageView[] = []
  let beforeSeq: number | undefined
  for (;;) {
    const page = await readMessages(conversationId, { beforeSeq, limit: MESSAGE_PAGE_SIZE })
    all.push(...page)
    if (page.length < MESSAGE_PAGE_SIZE) return all
    beforeSeq = page[page.length - 1]!.seq
  }
}

type Place = Pick<TurnConversation, 'home' | 'projectId'> & { taskId?: string | null }

/** The place the instructions name, from what was read of it: a task, a project, or neither (the person's own space). */
export function placeLabelOf(found: {
  task?: { number: number; title: string; project: { key: string; name: string } } | null
  project?: { name: string; key: string } | null
}): string {
  const { task, project } = found
  if (task) return `the conversation on task ${task.project.key}-${task.number} "${task.title}" in the ${task.project.name} project, which the project's people share`
  if (project) return `the ${project.name} project (key ${project.key})`
  return 'their own space'
}

async function placeLabel(conversation: Place): Promise<string> {
  if (conversation.home === 'TASK' && conversation.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: conversation.taskId },
      select: { number: true, title: true, project: { select: { key: true, name: true } } },
    })
    if (task) return placeLabelOf({ task })
  }
  if (conversation.home === 'PROJECT' && conversation.projectId) {
    const project = await prisma.project.findUnique({ where: { id: conversation.projectId }, select: { name: true, key: true } })
    if (project) return placeLabelOf({ project })
  }
  return placeLabelOf({})
}

async function orgInstructions(): Promise<string | null> {
  const org = await prisma.org.findFirst({ select: { id: true } })
  const files = org ? await readCurrentFiles('org', org.id) : null
  const text = files?.find(f => f.path === ORG_FILE)?.content.toString('utf-8').trim()
  return text || null
}

function appendBlock(messages: LeadMessage[], block: string): LeadMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role === 'user') return [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n${block}` }]
  return [...messages, { role: 'user', content: block }]
}

/** While the voice turn block is on (`voiceBridge`): what it reads of the person who holds voice. */
export interface VoiceBlockOptions { adaptiveVoice: boolean; wentOnAfterHold: boolean; listener?: boolean; toneTag?: boolean }

/** Whether a turn answers a spoken message: the only turn whose model may hold it open (keep_listening). */
export function answersSpokenMessage(history: readonly ConversationMessageView[], turn: Pick<ClaimedTurn, 'trigger' | 'inputIds'>): boolean {
  return turn.trigger === 'MESSAGE' && history.some(m => turn.inputIds.includes(m.id) && m.role === 'PERSON' && m.spoken)
}

/**
 * What a turn that answers no person is told to do with the cards it takes, appended after them; and, when the
 * person is listening (voice), that they are.
 */
export function withTurnBlock(
  messages: LeadMessage[],
  history: readonly ConversationMessageView[],
  turn: Pick<ClaimedTurn, 'trigger' | 'inputIds' | 'continuations'>,
  listening = false,
  trailedOff = false,
  wentOnAfter: string | null = null,
  voiceBlock: VoiceBlockOptions | null = null,
): LeadMessage[] {
  const inputs = history.filter(m => turn.inputIds.includes(m.id))
  const spoken = inputs.some(m => m.role === 'PERSON' && m.spoken)
  const voice = !listening ? null : voiceBlock
    ? voiceTurnBlock({
      spoken: spoken && turn.trigger === 'MESSAGE', adaptiveVoice: voiceBlock.adaptiveVoice, trailedOff: spoken && trailedOff,
      wentOn: spoken && (voiceBlock.wentOnAfterHold || wentOnAfter !== null), listener: voiceBlock.listener === true,
      toneTag: voiceBlock.toneTag === true,
    })
    : listeningTurnBlock(spoken, spoken && trailedOff, spoken ? wentOnAfter : null)
  if (turn.trigger === 'MESSAGE') return voice ? appendBlock(messages, voice) : messages
  const cards = inputs
  const titleOf = (operationId: string) => {
    const card = cards.find(m => m.operationId === operationId && m.kind === 'RESULT')
    return card?.kind === 'RESULT' ? card.body.title : 'the work'
  }
  const continuations: ContinuationStep[] = (turn.continuations ?? []).map(c => ({ title: titleOf(c.operationId), nextStep: c.nextStep }))
  const capped = cards.some(m => m.kind === 'RESULT' && wasCapped(m.body))
  const block = cardTurnBlock({ continuations, capped })
  return appendBlock(messages, voice ? `${block}\n${voice}` : block)
}

export async function awaitingCardIds(conversationId: string): Promise<Set<string>> {
  const rows = await prisma.conversationMessage.findMany({ where: awaitingCardsWhere(conversationId), select: { id: true } })
  return new Set(rows.map(r => r.id))
}

export type ContextTurn = Pick<ClaimedTurn, 'turnId' | 'trigger' | 'actingUserId' | 'inputIds' | 'continuations'>

async function instructionsFor(conversation: Place, agentId: string): Promise<Instructions> {
  const [agent, content, org, place, features] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId }, select: { name: true, role: true } }),
    readAgentContent(agentId),
    orgInstructions(),
    placeLabel(conversation),
    featuresOn(),
  ])
  return {
    agentName: agent?.name ?? 'the agent',
    agentRole: agent?.role || null,
    placeLabel: place,
    agentInstructions: content?.instructions.trim() || null,
    orgInstructions: org,
    featuresOn: features.on,
  }
}

/** The first two parts, as a turn sends them: what the summariser sends too, so it reads from the same cache. */
export async function leadSystem(
  conversation: Place,
  agentId: string,
  segments: readonly OpenedSegment[],
): Promise<PromptPart[]> {
  return systemWithBlock(await instructionsFor(conversation, agentId), segments)
}

/** What a turn's context is built from, once read: the turn builds it here, and so do the model checks (__modelchecks__). */
export interface ContextParts {
  instructions: Instructions
  segments: readonly OpenedSegment[]
  history: readonly ConversationMessageView[]
  awaiting: ReadonlySet<string>
  turn: Pick<ContextTurn, 'trigger' | 'inputIds' | 'continuations'>
  /** The memory block the probe found, or none. */
  memory: string | null
  places: PlacesForLead | null
  /** What background work started from this turn could do with web search; none for a turn that starts no work. */
  webSearch?: BackgroundSearch | null
  /**
   * The person listening to this turn (voice), or none. `wentOnAfterHold`: they went on after a turn held open;
   * `adaptiveVoice`: their own setting (on unless they turned it off), read while the voice turn block is on.
   */
  listening: { trailedOff: boolean; wentOnAfter: string | null; wentOnAfterHold?: boolean; adaptiveVoice?: boolean; toneOn?: boolean } | null
  /** Who said what, when several people share the conversation. */
  speakers?: Speakers
}

export function contextFrom(parts: ContextParts): LeadContext {
  const { instructions, segments, history, awaiting, turn, memory, places, webSearch, listening, speakers } = parts
  const system = systemWithBlock(instructions, segments)
  const messages = leadMessages(windowOf(history, segments), turn.inputIds, awaiting, instructions.agentName, speakers)
  const voiceBlock = voiceBlockOf(instructions.featuresOn, listening)
  const withTurn = withTurnBlock(
    messages.messages, history, turn, listening !== null, listening?.trailedOff ?? false, listening?.wentOnAfter ?? null, voiceBlock,
  )
  // The places, re-checked every turn (P6), go after the cached prefix like memory does.
  const withPlaces = places ? appendBlock(withTurn, placesTurnBlock(places)) : withTurn
  const withSearch = webSearch ? appendBlock(withPlaces, webSearchTurnBlock(webSearch)) : withPlaces
  return {
    system,
    messages: withMemoryBlock(withSearch, memory),
    cacheAfterMessage: messages.cacheAfter,
    ...(voiceBlock && !voiceBlock.listener && listening && answersSpokenMessage(history, turn) ? { spokenMessage: true } : {}),
    ...(listening && voiceBlock?.toneTag && { toneTag: true }),
  }
}

/** The holder's Adaptive voice: on unless they turned it off in their voice settings. */
async function adaptiveVoiceOf(userId: string): Promise<boolean> {
  const row = await prisma.userSettings.findUnique({ where: { userId }, select: { adaptiveVoice: true } })
  return row?.adaptiveVoice ?? true
}

export async function assembleContext(
  conversation: TurnConversation,
  agentId: string,
  turn: ContextTurn,
  foldedTools: readonly FoldedName[] = [],
): Promise<LeadContext> {
  const [segments, history, awaiting] = await Promise.all([
    readSegments(conversation.id),
    readAll(conversation.id),
    awaitingCardIds(conversation.id),
  ])
  const instructions = { ...(await instructionsFor(conversation, agentId)), foldedTools }
  // What memory the probe found goes with the turn's own message, after the cached prefix.
  // A report turn presents results and starts no work, so it is not told of web search.
  const [memory, places, webSearch] = await Promise.all([
    memoryForTurn({ conversation, agentId, turn, history }),
    placesForLead(conversation.id),
    turn.trigger === 'REPORT' ? null : backgroundSearchFor(conversation, agentId, turn.actingUserId),
  ])
  const session = listeningSession(conversation.id, turn)
  const listening = session && instructions.featuresOn?.some(f => f === 'voiceBridge' || f === 'voiceListener')
    ? {
      trailedOff: session.trailedOff, wentOnAfter: session.wentOnAfter, wentOnAfterHold: session.wentOnAfterHold,
      adaptiveVoice: await adaptiveVoiceOf(session.holderId), toneOn: session.tone.on,
    }
    : session
  return contextFrom({ instructions, segments, history, awaiting, turn, memory, places, webSearch, listening, speakers: await speakersOf(history) })
}
