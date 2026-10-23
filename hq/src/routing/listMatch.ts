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

function globToRegExp(pattern: string): RegExp {
  const parts = normalise(pattern).split('*').map(p => p.replace(/[\\^$+?.()|[\]{}]/g, '\\$&'))
  return new RegExp(`^${parts.join('.*')}$`)
}

export function patternMatches(pattern: string, makerAndName: string): boolean {
  const re = globToRegExp(pattern)
  const key = normalise(makerAndName)
  if (re.test(key)) return true
  const slash = key.indexOf('/')
  return !pattern.includes('/') && slash >= 0 && re.test(key.slice(slash + 1))
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
