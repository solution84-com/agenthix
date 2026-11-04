/**
 * How large a skill may be, counted one way for everyone who checks it: the package cache when it stores one, the
 * transfer that copies one into a place, and the read that stages one for a run (agents/runtime/skillTree.ts counts
 * the same entries as it walks). A skill the cache accepts is one staging and copying accept.
 */
import { SKILL_TREE_MAX_DEPTH, SKILL_TREE_MAX_ENTRIES } from '@agenthix/core'

/** Entries on disk: the skill's own folder, every folder between it and a file, and every file. */
export function skillEntryCount(paths: string[]): number {
  const folders = new Set<string>()
  for (const p of paths) {
    const parts = p.split('/')
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
  }
  return 1 + folders.size + paths.length
}

/** The deepest folder nesting of any file: a file in the skill's own folder is 0 levels down. */
export function skillDepth(paths: string[]): number {
  return paths.reduce((deepest, p) => Math.max(deepest, p.split('/').length - 1), 0)
}

export function skillHasTooManyEntries(paths: string[]): boolean {
  return skillEntryCount(paths) > SKILL_TREE_MAX_ENTRIES
}

export function skillIsTooDeep(paths: string[]): boolean {
  return skillDepth(paths) > SKILL_TREE_MAX_DEPTH
}
