/**
 * The owner's pages folder as it is on the disk (`knowledgePagesDir`, `../storage/paths.ts`). A link standing in for
 * the folder itself, or an id that cannot be a folder name, is `unsafe` and never followed; not there yet is `none`.
 */
import fs from 'node:fs'
import type { KnowledgeOwnerRef } from '@agenthix/core'
import { knowledgePagesDir } from '../storage/paths'

export type PagesFolder = { kind: 'none' } | { kind: 'unsafe' } | { kind: 'ok'; real: string }

export function pagesFolderOf(owner: KnowledgeOwnerRef): PagesFolder {
  let root: string
  try {
    root = knowledgePagesDir(owner)
  } catch {
    return { kind: 'unsafe' }
  }
  try {
    if (fs.lstatSync(root).isSymbolicLink()) return { kind: 'unsafe' }
    return { kind: 'ok', real: fs.realpathSync(root) }
  } catch {
    return { kind: 'none' }
  }
}
