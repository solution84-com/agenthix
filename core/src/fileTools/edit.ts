/**
 * An edit as Claude Code's Edit makes it, on text: `old_string` must be found exactly — no trimming, no line-ending or
 * indentation tolerance — and once, unless `replace_all`. (The OpenCode plugin keeps OpenCode's looser matching, in
 * its own files.)
 */
import type { Refused } from './refusals.js'

export type EditArgs = { old_string: string; new_string: string; replace_all?: boolean }

export type EditResult = { ok: true; text: string; replacements: number } | Refused

function occurrences(text: string, find: string): number[] {
  const at: number[] = []
  for (let i = text.indexOf(find); i !== -1; i = text.indexOf(find, i + find.length)) at.push(i)
  return at
}

export function applyEdit(text: string, args: EditArgs): EditResult {
  if (typeof args.old_string !== 'string' || typeof args.new_string !== 'string') return { ok: false, reason: 'invalid-argument' }
  if (args.old_string === '') return { ok: false, reason: 'edit-empty' }
  if (args.old_string === args.new_string) return { ok: false, reason: 'edit-no-change' }
  const at = occurrences(text, args.old_string)
  if (at.length === 0) return { ok: false, reason: 'edit-not-found', count: 0 }
  if (at.length > 1 && !args.replace_all) return { ok: false, reason: 'edit-ambiguous', count: at.length }

  let out = ''
  let from = 0
  for (const i of at) {
    out += text.slice(from, i) + args.new_string
    from = i + args.old_string.length
  }
  return { ok: true, text: out + text.slice(from), replacements: at.length }
}
