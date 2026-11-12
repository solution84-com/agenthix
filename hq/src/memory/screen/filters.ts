/**
 * The memory screen's filters (spec decision 11): kind, agent, place, tag and a words search. Client-safe: the
 * screen keeps its menus' values here, and `getMemory` runs the words search with the same rule.
 */
import type { GetMemoryArgs, MemoryItemKindValue } from '../../shared/memory/protocol'

/**
 * The menus' values: `''` is any. `agent` is `'every'` (the badge "Every agent") or an agent's id; `place` is
 * `'everywhere'` or `<type>:<id>`.
 */
export type MemoryFilter = { words: string; kind: '' | MemoryItemKindValue; agent: string; place: string; tag: string }

export const NO_FILTER: MemoryFilter = { words: '', kind: '', agent: '', place: '', tag: '' }

export const placeValue = (place: { type: string; id: string }): string => `${place.type}:${place.id}`

function placeOf(value: string): GetMemoryArgs['place'] | undefined {
  if (value === 'everywhere') return null
  const at = value.indexOf(':')
  const type = value.slice(0, at)
  const id = value.slice(at + 1)
  return at > 0 && id && (type === 'user' || type === 'project') ? { type, id } : undefined
}

/** What `getMemory` is asked for: each menu matches its badge exactly, so "Every agent" is the agent left out. */
export function argsOf(filter: MemoryFilter): Omit<GetMemoryArgs, 'includeArchived' | 'id'> {
  const args: Omit<GetMemoryArgs, 'includeArchived' | 'id'> = {}
  if (filter.agent) args.agentId = filter.agent === 'every' ? null : filter.agent
  const place = filter.place ? placeOf(filter.place) : undefined
  if (place !== undefined) args.place = place
  if (filter.kind) args.kind = filter.kind
  if (filter.tag) args.tag = filter.tag
  const words = filter.words.trim()
  if (words) args.words = words
  return args
}

/** Every word is somewhere in the title, the body or a tag, in any case. */
export function matchesWords(item: { title: string; body: string; tags: string[] }, words: string): boolean {
  const wanted = words.toLowerCase().split(/\s+/).filter(Boolean)
  if (wanted.length === 0) return true
  const text = [item.title, item.body, ...item.tags].join('\n').toLowerCase()
  return wanted.every(w => text.includes(w))
}
