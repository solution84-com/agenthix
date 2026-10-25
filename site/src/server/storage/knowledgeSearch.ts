/**
 * `location.searchKnowledge`. The `grep` form runs the file tools' Grep (ripgrep, with every guard of "Running a
 * pattern safely") over the owner's `pages/` and answers in `grep`; the pattern is a model's and is never trusted.
 * The deprecated `query` form (site protocol 1.6, until hq stops sending it) keeps its lexical matcher over the
 * pages the itemiser lists, each opened through the file tools' verified open. Nothing here names a path on this disk.
 */
import path from 'node:path'
import { z } from 'zod'
import {
  LOCATION_FILE_METHODS,
  type Exact,
  type KnowledgeGrepHit,
  type KnowledgeGrepParams,
  type KnowledgeGrepResult,
  type KnowledgeSearchExcerpt,
  type LocationSearchKnowledgeParams,
  type LocationSearchKnowledgeResult,
} from '@agenthix/core'
import { grep, GrepRateLimiter, readTextFile, systemFdPaths, type GrepFound, type GrepParams } from '@agenthix/core/file-tools'
import { itemiseKnowledge } from '../knowledge/itemiser'
import { knowledgeOwnerShape, orgIdIsFixed } from '../knowledge/owner'
import { pagesFolderOf } from '../knowledge/pagesRoot'
import { parseParams } from './locationContainment'

export const searchKnowledgeParams = z
  .object({
    ...knowledgeOwnerShape,
    query: z.string(),
    maxChars: z.number().int().nonnegative(),
    // Grep's form (site protocol 1.7). Taken as it comes: the file tools' own check judges every field.
    grep: z.object({ pattern: z.string() }).passthrough().optional() as z.ZodType<LocationSearchKnowledgeParams['grep']>,
  })
  .refine(orgIdIsFixed)

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

const GREP_KEYS: (keyof KnowledgeGrepParams)[] = [
  'pattern', 'path', 'glob', 'output_mode', '-i', '-n', '-A', '-B', '-C', 'head_limit', 'offset',
]

function hitsOf(found: GrepFound): KnowledgeGrepHit[] {
  if (found.mode === 'files_with_matches') return found.filenames.map(page => ({ page }))
  if (found.mode === 'count') return found.counts.map(c => ({ page: c.file, count: c.count }))
  const hits: KnowledgeGrepHit[] = []
  for (const l of found.lines) {
    if (l.kind === 'break') continue
    if (l.kind === 'binary') hits.push({ page: l.file, text: l.text })
    else {
      hits.push({
        page: l.file,
        ...(found.showLineNumbers ? { line: l.line } : {}),
        text: l.text,
        ...(l.kind === 'context' ? { context: true as const } : {}),
      })
    }
  }
  return hits
}

/**
 * hq limits each run and conversation to the file tools' 30 searches a minute. Here the key is the owner, which every
 * caller in the organisation shares for `org`, so the site's limit is only a backstop against flooding the machine:
 * high enough that one busy caller never uses up an owner for everyone else.
 */
export const OWNER_SEARCHES_PER_MINUTE = 600
const ownerLimiter = new GrepRateLimiter(OWNER_SEARCHES_PER_MINUTE)

/** One owner's pages searched by Grep's parameters; a refusal is an answer with one of the file tools' fixed messages. */
async function grepPages(owner: LocationSearchKnowledgeParams, params: KnowledgeGrepParams): Promise<KnowledgeGrepResult> {
  // Only Grep's own parameters go on: nothing else the caller sent is looked at.
  const picked: Record<string, unknown> = {}
  for (const key of GREP_KEYS) if (params[key] !== undefined) picked[key] = params[key]
  const folder = pagesFolderOf(owner)
  const mode = (picked.output_mode as KnowledgeGrepParams['output_mode']) ?? 'files_with_matches'
  if (folder.kind !== 'ok') return { outcome: 'done', mode, hits: [] }
  const result = await grep(folder.real, picked as GrepParams, { callerKey: `knowledge:${owner.ownerType}:${owner.ownerId}`, limiter: ownerLimiter })
  if (!result.ok) return { outcome: 'refused', message: result.message }
  return {
    outcome: 'done',
    mode: result.mode,
    hits: hitsOf(result),
    ...(result.nextOffset !== undefined ? { nextOffset: result.nextOffset } : {}),
  }
}

function readPageText(root: string, page: string): string | null {
  const read = readTextFile(systemFdPaths(), path.join(root, page))
  if (!read.ok || read.bytes.length > MAX_FILE_BYTES) return null
  const text = Buffer.from(read.bytes).toString('utf8')
  return text.includes('\u0000') ? null : text
}

export async function searchKnowledge(params: unknown): Promise<LocationSearchKnowledgeResult> {
  const method = LOCATION_FILE_METHODS.searchKnowledge
  const parsed = parseParams(searchKnowledgeParams, params, method)
  if (parsed.grep !== undefined) {
    return { excerpts: [], cut: [], truncated: false, grep: await grepPages(parsed, parsed.grep) }
  }
  const terms = queryTerms(parsed.query)
  const { files, truncated } = itemiseKnowledge(parsed)
  if (!terms.length || !files.length) return { excerpts: [], cut: [], truncated }
  const folder = pagesFolderOf(parsed)
  if (folder.kind !== 'ok') return { excerpts: [], cut: [], truncated }
  const real = folder.real
  const ordered = [...files].sort((a, b) => Number(isIndex(b.path)) - Number(isIndex(a.path)))
  const texts: KnowledgeFileText[] = []
  for (const file of ordered.slice(0, MAX_FILES_READ)) {
    const text = readPageText(real, file.path)
    if (text !== null) texts.push({ path: file.path, text })
  }
  const { excerpts, cut } = rankExcerpts(texts, terms, parsed.maxChars)
  return { excerpts, cut, truncated: truncated || ordered.length > MAX_FILES_READ }
}
