/**
 * An item as `remember` takes it (memory and knowledge spec, An item; ADR-0188): it must stand alone, read months later by
 * another turn; it is a fact, not a document; its key comes from its title unless the writer names one; and an
 * item very like one already held supersedes or merges with it instead of adding.
 */
import { createHash } from 'node:crypto'
import {
  MEMORY_BODY_MAX_CHARS, MEMORY_MAX_TAGS, MEMORY_TITLE_MAX_CHARS, type MemoryItemKindValue,
} from '../shared/memory/protocol'

export const KEY_MAX_CHARS = 64
const TAG_MAX_CHARS = 32
export const MIN_BODY_WORDS = 4

/** Words that only point at something else: a body made of these and little more names nothing. */
const POINTING_WORDS = new Set([
  'a', 'an', 'the', 'it', 'its', 'this', 'that', 'these', 'those', 'they', 'them', 'their', 'he', 'she', 'him', 'her',
  'his', 'hers', 'we', 'us', 'you', 'i', 'me', 'my', 'do', 'does', 'did', 'done', 'doing', 'same', 'again', 'here',
  'there', 'as', 'before', 'above', 'below', 'said', 'like', 'so', 'ok', 'okay', 'yes', 'no', 'one', 'thing', 'things',
  'way', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'with', 'just', 'also', 'too',
  'please', 'always', 'never', 'next', 'time', 'then', 'what', 'which', 'who', 'all', 'any', 'more', 'less',
])

export const STAND_ALONE_REFUSAL =
  'A memory must stand alone, to be understood months from now without this conversation: give it a title that ' +
  `names its subject and a body of at least ${MIN_BODY_WORDS} words that says what it is about, not "do that" or ` +
  '"as above".'

export interface CleanItem {
  title: string
  body: string
  tags: string[]
}

/** A title on one line, a body with its line breaks kept and every other control character gone, tags tidied. */
export function cleanItem(input: { title: string; body: string; tags?: readonly string[] }): CleanItem {
  const title = oneLine(input.title)
  const body = (input.body ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n\t]/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const tags = [...new Set((input.tags ?? []).map(t => oneLine(t).toLowerCase().slice(0, TAG_MAX_CHARS)).filter(Boolean))]
  return { title, body, tags: tags.slice(0, MEMORY_MAX_TAGS) }
}

function oneLine(text: string | undefined): string {
  return (text ?? '').replace(/[\p{Cc}\s]+/gu, ' ').trim()
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu) ?? []
}

/** Why this item cannot be kept as it is, or null when it can. */
export function itemRefusal(item: CleanItem): string | null {
  if (!item.title) return STAND_ALONE_REFUSAL
  if (item.title.length > MEMORY_TITLE_MAX_CHARS) {
    return `A memory's title is at most ${MEMORY_TITLE_MAX_CHARS} characters; this one is ${item.title.length}.`
  }
  if (item.body.length > MEMORY_BODY_MAX_CHARS) {
    return `A memory is a fact, not a document: at most ${MEMORY_BODY_MAX_CHARS} characters, and this one is ` +
      `${item.body.length}. Longer material belongs in the place's files.`
  }
  const bodyWords = words(item.body)
  if (bodyWords.length < MIN_BODY_WORDS) return STAND_ALONE_REFUSAL
  const naming = [...words(item.title), ...bodyWords].filter(w => !POINTING_WORDS.has(w))
  if (naming.length < 2) return STAND_ALONE_REFUSAL
  return null
}

/** A key from a title or a writer's key: lower case, letters and digits joined by hyphens. */
export function keyFrom(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, KEY_MAX_CHARS)
    .replace(/-+$/g, '')
  return slug || `item-${createHash('sha256').update(text).digest('hex').slice(0, 10)}`
}

/** What is embedded for an item: its title, body and tags together, once, when written. */
export function embeddingText(item: CleanItem): string {
  return item.tags.length ? `${item.title}\n${item.body}\n${item.tags.join(', ')}` : `${item.title}\n${item.body}`
}

/**
 * What to do with a new item very like one already held (ADR-0188: it turns on the kind):
 *  - `held` — the old one already says it all; nothing changes.
 *  - `supersede` — the new one takes the old one's place: a Rule always does, since a later rule replaces an
 *    earlier one; so does a new item that says everything the old did.
 *  - `merge` — a Fact that adds to an old Fact, when the two fit in one item.
 */
export type DuplicateAction = { action: 'held' } | { action: 'supersede' } | { action: 'merge'; body: string }

export function duplicateAction(
  incoming: { kind: MemoryItemKindValue; body: string },
  held: { kind: MemoryItemKindValue; body: string },
): DuplicateAction {
  const next = comparable(incoming.body)
  const old = comparable(held.body)
  if (old.includes(next)) return { action: 'held' }
  // A Fact is joined only onto a Fact: joined onto a Rule it would become part of how the person wants things done.
  if (next.includes(old) || incoming.kind === 'RULE' || held.kind === 'RULE') return { action: 'supersede' }
  const body = `${held.body}\n${incoming.body}`
  return body.length <= MEMORY_BODY_MAX_CHARS ? { action: 'merge', body } : { action: 'supersede' }
}

function comparable(text: string): string {
  return text.toLowerCase().replace(/[\p{P}\s]+/gu, ' ').trim()
}

/**
 * What a save does with the near-duplicate it found (spec, Saving): a memory in a scope wider than the saving one is
 * one the person promoted, and it is never written into, so nothing an agent saves widens on its own.
 *  - `held` — nothing changes, wherever the old one holds.
 *  - `merge` — joined onto the old one, only when it is in the saving scope.
 *  - `supersede` — the old one is archived and the new one is saved; `inHeldScope`: where the old one held. Across
 *    scopes only for a Rule the person asked for (a correction included): they chose that subject's reach.
 *  - `add` — saved on its own in the saving scope; a wider old one stays live.
 */
export type SavePlan = { plan: 'held' } | { plan: 'merge'; body: string } | { plan: 'supersede'; inHeldScope: true } | { plan: 'add' }

export function nearDuplicatePlan(
  decided: DuplicateAction,
  incoming: { wider: boolean; kind: MemoryItemKindValue; requested: boolean },
): SavePlan {
  if (decided.action === 'held') return { plan: 'held' }
  if (!incoming.wider) return decided.action === 'merge' ? { plan: 'merge', body: decided.body } : { plan: 'supersede', inHeldScope: true }
  if (decided.action === 'supersede' && incoming.kind === 'RULE' && incoming.requested) return { plan: 'supersede', inHeldScope: true }
  return { plan: 'add' }
}

/** Why a scope takes no more memories: its cap, a safety net on every way into it. */
export function scopeFullRefusal(max: number): string {
  return `This memory already holds ${max} items. Forget something no longer true before remembering more.`
}
