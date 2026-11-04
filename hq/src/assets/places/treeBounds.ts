/**
 * How large a skill folder in a place may be: the bounds the site holds a folder to when it reads, stages or writes
 * one (`site/src/packages/skillBounds.ts` counts the same way), checked here at every save so a draft that could not
 * be published is refused while it is being written. Pure.
 */
import { SKILL_TREE_MAX_DEPTH, SKILL_TREE_MAX_ENTRIES } from '@agenthix/core'

/** Entries on disk: the skill's own folder, every folder between it and a file, and every file. */
function entryCount(paths: string[]): number {
  const folders = new Set<string>()
  for (const p of paths) {
    const parts = p.split('/')
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
  }
  return 1 + folders.size + paths.length
}

/** Why these files can't be a skill folder in a place, or null. A file in the skill's own folder is 0 levels down. */
export function placeTreeProblem(paths: string[]): string | null {
  if (entryCount(paths) > SKILL_TREE_MAX_ENTRIES) {
    return `A skill in a place's files may hold at most ${SKILL_TREE_MAX_ENTRIES} files and folders, its own folder included.`
  }
  if (paths.some(p => p.split('/').length - 1 > SKILL_TREE_MAX_DEPTH)) {
    return `A skill in a place's files may nest folders at most ${SKILL_TREE_MAX_DEPTH} deep.`
  }
  return null
}
