/**
 * `location.searchKnowledge`: a bounded term search over an owner's `knowledge/`
 * files, answering with excerpts and where they came from.
 *
 * The files are those `listKnowledge` offers (so its bounds, hidden-entry and
 * link rules hold), and each is opened through `openInOwnerFolder` like a read,
 * so a link swapped in meanwhile is refused and the file left out. Nothing here
 * names a path on this disk. Matching is lexical on purpose: a site-side index
 * with the same embedding model as hq's memory can replace `rankExcerpts`
 * without changing the method.
 */
import { constants as fsConstants } from 'node:fs'
import { z } from 'zod'
import {
  LOCATION_FILE_METHODS,
  WORKSPACE_OWNER_TYPES,
  type Exact,
  type KnowledgeSearchExcerpt,
  type LocationSearchKnowledgeParams,
  type LocationSearchKnowledgeResult,
} from '@agenthix/core'
import { openInOwnerFolder, parseParams } from './locationContainment'
import { listKnowledge } from './ownerFolderMethods'

export const searchKnowledgeParams = z
  .object({
    ownerType: z.enum(WORKSPACE_OWNER_TYPES),
    ownerId: z.string().min(1),
    query: z.string(),
    maxChars: z.number().int().nonnegative(),
  })

const _wireMirrorsCore: Exact<z.infer<typeof searchKnowledgeParams>, LocationSearchKnowledgeParams> = true
void _wireMirrorsCore

const INDEX_FILE = 'INDEX.md'
const CONTEXT_LINES = 2
const MAX_LINES_PER_FILE = 6
const MAX_LINES_IN_ALL = 24
const MAX_FILE_BYTES = 512 * 1024
const MAX_FILES_READ = 400
const MAX_LINE_CHARS = 400
const MIN_TERM_CHARS = 2
/** Below this much room, an excerpt that does not fit is named as cut instead of shortened. */
const MIN_USEFUL_CHARS = 80

export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  return [...new Set(words.filter(w => w.length >= MIN_TERM_CHARS))]
}

interface Candidate { path: string; line: number; score: number }

export interface KnowledgeFileText { path: string; text: string }

function isIndex(file: string): boolean {
  return file === INDEX_FILE || file.endsWith(`/${INDEX_FILE}`)
}

/** Pure: the best-matching lines of the given files, with context, merged, ordered and held to `maxChars`. */
export function rankExcerpts(
  files: KnowledgeFileText[],
  terms: string[],
  maxChars: number,
): { excerpts: KnowledgeSearchExcerpt[]; cut: string[] } {
  if (!terms.length) return { excerpts: [], cut: [] }
  const lines = new Map<string, string[]>()
  const candidates: Candidate[] = []
  for (const file of files) {
    const split = file.text.split(/\r?\n/).map(l => (l.length > MAX_LINE_CHARS ? `${l.slice(0, MAX_LINE_CHARS)}…` : l))
    lines.set(file.path, split)
    const scored: Candidate[] = []
    split.forEach((line, i) => {
      const lower = line.toLowerCase()
      const score = terms.filter(t => lower.includes(t)).length
      if (score) scored.push({ path: file.path, line: i, score })
    })
    scored.sort((a, b) => b.score - a.score || a.line - b.line)
    candidates.push(...scored.slice(0, MAX_LINES_PER_FILE))
  }
  candidates.sort(
    (a, b) => Number(isIndex(b.path)) - Number(isIndex(a.path)) || b.score - a.score ||
      a.path.localeCompare(b.path) || a.line - b.line,
  )
  const chosen = candidates.slice(0, MAX_LINES_IN_ALL)

  const byFile = new Map<string, Candidate[]>()
  for (const c of chosen) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c])
  const ranked: { excerpt: KnowledgeSearchExcerpt; score: number; index: boolean }[] = []
  for (const [file, picks] of byFile) {
    const all = lines.get(file)!
    const ranges = picks
      .map(p => ({ from: Math.max(0, p.line - CONTEXT_LINES), to: Math.min(all.length - 1, p.line + CONTEXT_LINES), score: p.score }))
      .sort((a, b) => a.from - b.from)
    const merged: typeof ranges = []
    for (const r of ranges) {
      const last = merged[merged.length - 1]
      if (last && r.from <= last.to + 1) {
        last.to = Math.max(last.to, r.to)
        last.score = Math.max(last.score, r.score)
      } else merged.push({ ...r })
    }
    for (const r of merged) {
      ranked.push({
        excerpt: { path: file, startLine: r.from + 1, endLine: r.to + 1, text: all.slice(r.from, r.to + 1).join('\n') },
        score: r.score,
        index: isIndex(file),
      })
    }
  }
  ranked.sort((a, b) => Number(b.index) - Number(a.index) || b.score - a.score ||
    a.excerpt.path.localeCompare(b.excerpt.path) || a.excerpt.startLine - b.excerpt.startLine)

  const excerpts: KnowledgeSearchExcerpt[] = []
  const cutFiles = new Set<string>()
  let used = 0
  let full = false
  for (const { excerpt } of ranked) {
    const room = maxChars - used
    if (full || room < MIN_USEFUL_CHARS && excerpt.text.length > room) {
      full = true
      cutFiles.add(excerpt.path)
      continue
    }
    if (excerpt.text.length <= room) {
      excerpts.push(excerpt)
      used += excerpt.text.length
      continue
    }
    const kept: string[] = []
    let size = 0
    for (const l of excerpt.text.split('\n')) {
      if (size + l.length + (kept.length ? 1 : 0) > room) break
      size += l.length + (kept.length ? 1 : 0)
      kept.push(l)
    }
    if (kept.length) {
      excerpts.push({ ...excerpt, endLine: excerpt.startLine + kept.length - 1, text: kept.join('\n') })
      used += size
    }
    cutFiles.add(excerpt.path)
    full = true
  }
  return { excerpts, cut: [...cutFiles].sort() }
}

async function readKnowledgeText(owner: LocationSearchKnowledgeParams, relPath: string, method: string): Promise<string | null> {
  try {
    const { handle } = await openInOwnerFolder(owner, 'knowledge', method, relPath, fsConstants.O_RDONLY)
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null
      const text = await handle.readFile({ encoding: 'utf8' })
      return text.includes('\u0000') ? null : text
    } finally {
      await handle.close().catch(() => {})
    }
  } catch {
    // A file that cannot be opened safely is left out of the search, as a link is left out of the listing.
    return null
  }
}

export async function searchKnowledge(params: unknown): Promise<LocationSearchKnowledgeResult> {
  const method = LOCATION_FILE_METHODS.searchKnowledge
  const parsed = parseParams(searchKnowledgeParams, params, method)
  const terms = queryTerms(parsed.query)
  const { files, truncated } = await listKnowledge({ ownerType: parsed.ownerType, ownerId: parsed.ownerId })
  if (!terms.length) return { excerpts: [], cut: [], truncated }
  const ordered = [...files].sort((a, b) => Number(isIndex(b.path)) - Number(isIndex(a.path)))
  const texts: KnowledgeFileText[] = []
  for (const file of ordered.slice(0, MAX_FILES_READ)) {
    const text = await readKnowledgeText(parsed, file.path, method)
    if (text !== null) texts.push({ path: file.path, text })
  }
  const { excerpts, cut } = rankExcerpts(texts, terms, parsed.maxChars)
  return { excerpts, cut, truncated: truncated || ordered.length > MAX_FILES_READ }
}
