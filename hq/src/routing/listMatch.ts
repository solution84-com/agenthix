/**
 * Allow and ban lists (models from one place, part 4): which models may run. Every list that applies narrows: a model
 * runs only when each list lets it. A list in `every` mode lets every model but its `never` entries; with *Only
 * these* (`only_these`) it lets only its `allow` entries, and its `never` entries still carve exceptions out of them.
 *
 * An entry is a model or a pattern with `*` standing for anything, `/` included: `deepseek/*` for a maker, `*-pro`
 * or `anthropic/claude-*` for a family. It is matched against the model's maker and name (`modelKeys.ts`
 * `makerAndName`), never its provider. A dotted version reads as a hyphenated one, case is ignored, and an entry
 * with no maker is matched against the name alone too, so `gpt-5` names OpenAI's.
 */
import type { ModelListEntry, ModelListMode } from '@agenthix/core'

export type AppliedList = { mode: ModelListMode; entries: readonly ModelListEntry[] }

const normalise = (s: string) => s.trim().toLowerCase().replace(/\./g, '-')

/**
 * Whether `key` is the pieces between the stars in order, the first at its start and the last at its end. Each piece
 * is taken at its earliest place, which never loses a match, so nothing is tried twice: a person's pattern of any
 * shape costs at most its length times the key's.
 */
function globMatches(pieces: readonly string[], key: string): boolean {
  if (pieces.length === 1) return key === pieces[0]
  const first = pieces[0]
  const last = pieces[pieces.length - 1]
  if (key.length < first.length + last.length || !key.startsWith(first) || !key.endsWith(last)) return false
  let at = first.length
  const end = key.length - last.length
  for (const piece of pieces.slice(1, -1)) {
    const found = key.indexOf(piece, at)
    if (found < 0 || found + piece.length > end) return false
    at = found + piece.length
  }
  return true
}

export function patternMatches(pattern: string, makerAndName: string): boolean {
  const pieces = normalise(pattern).split('*')
  const key = normalise(makerAndName)
  if (globMatches(pieces, key)) return true
  const slash = key.indexOf('/')
  return !pattern.includes('/') && slash >= 0 && globMatches(pieces, key.slice(slash + 1))
}

function lets(list: AppliedList, makerAndName: string): boolean {
  const hits = (effect: ModelListEntry['effect']) =>
    list.entries.some(e => e.effect === effect && patternMatches(e.pattern, makerAndName))
  if (hits('never')) return false
  return list.mode === 'every' || hits('allow')
}

export function allowedByLists(lists: readonly AppliedList[], makerAndName: string): boolean {
  return lists.every(l => lets(l, makerAndName))
}
