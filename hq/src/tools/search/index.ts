/**
 * The tool index (lean agent context spec, §7; ADR-0193): what find_tools searches. Each entry is one short text — the
 * tool's name in words, its description's first sentence and its input's names — embedded once per process with hq's
 * built-in model, keyed by a hash of its text so an unchanged tool is not embedded again. A search scores each entry
 * by meaning (the cosine of the two vectors) plus words (a query naming a tool, or a word few tools have, ranks it
 * first), and answers the best few above a bar. While the model can't load, or is slow to, words decide alone.
 *
 * The caller gives the entries it may use: the permission filter is the caller's, before the search.
 */
import { createHash } from 'node:crypto'
import { FOUND_AT_MOST, type FoundTool, type ToolArea } from '@agenthix/core'
import type { Embedder } from '../../memory/contract'
import { embedderFor } from '../../memory/embedding/embedders'
import { LOCAL_MODEL } from '../../memory/embedding/localEmbedder'
import { nameWords, wordScores, wordsOf } from './words'

export interface ToolEntry { name: string; area: ToolArea; description: string; input: unknown }

export interface SearchOptions {
  limit?: number
  /** The model the entries are embedded with; null searches by words alone. hq's built-in model when absent. */
  embedder?: Embedder | null
  /** How long a search waits for the model; past it, words decide this search while the model finishes loading. */
  waitMs?: number
}

/** The share of the word score added to the meaning's. */
const WORD_WEIGHT = 0.5
/** Added when the query names the tool itself. */
const NAMED = 1
/**
 * The least score found, with the model and by words alone. Tuned on a conversation's folded tools with hq's built-in
 * model: the tool asked for scored 0.82 or more (a bare word, "comment", 0.82), and the best match for an ask no tool
 * may do (a comment with add_comment at Never) at most 0.65, which at a lower bar sent the baseline model searching
 * again and again among tools that don't do it.
 */
export const MEANING_BAR = 0.7
export const WORDS_BAR = 0.5
const WAIT_MS = 5000

const vectors = new Map<string, Promise<number[]>>()

/** An entry's one text for search: its name in words, its description's first sentence, its input's names. */
export function entryText(entry: Pick<ToolEntry, 'name' | 'description' | 'input'>): string {
  const first = entry.description.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? ''
  const inputs = inputNames(entry.input).map(nameWords)
  return [nameWords(entry.name), first, inputs.join(', ')].filter(Boolean).join('. ')
}

function inputNames(input: unknown): string[] {
  const properties = input && typeof input === 'object' ? (input as { properties?: unknown }).properties : undefined
  return properties && typeof properties === 'object' ? Object.keys(properties) : []
}

const keyOf = (model: string, text: string) => createHash('sha256').update(`${model}\n${text}`).digest('hex')

/** Each text's vector: kept by its hash, so only texts not seen before are embedded, together. */
function vectorsOf(embedder: Embedder, texts: readonly string[]): Promise<number[][]> {
  const missing = [...new Set(texts.filter(t => !vectors.has(keyOf(embedder.model, t))))]
  if (missing.length > 0) {
    const batch = embedder.embed(missing)
    missing.forEach((t, i) => {
      const key = keyOf(embedder.model, t)
      const one = batch.then(v => v[i]!)
      // A failed load is tried again on a later search, not kept.
      one.catch(() => vectors.delete(key))
      vectors.set(key, one)
    })
  }
  return Promise.all(texts.map(t => vectors.get(keyOf(embedder.model, t))!))
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** The meaning's score of each entry, or null when the model failed or did not answer in time. */
async function meaningScores(embedder: Embedder, query: string, texts: readonly string[], waitMs: number): Promise<number[] | null> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), waitMs) })
  const scored = Promise.all([embedder.embed([query]), vectorsOf(embedder, texts)])
    .then(([[q], all]) => all.map(v => cosine(q!, v)))
    .catch(() => null)
  try {
    return await Promise.race([scored, late])
  } finally {
    clearTimeout(timer)
  }
}

/** Whether the query names the tool: `plan_task`, or "plan task" as words of it. */
function names(query: string, name: string): boolean {
  if (query.toLowerCase().includes(name)) return true
  return ` ${wordsOf(query).join(' ')} `.includes(` ${wordsOf(nameWords(name)).join(' ')} `)
}

export async function searchTools(query: string, entries: readonly ToolEntry[], opts: SearchOptions = {}): Promise<FoundTool[]> {
  if (!query.trim() || entries.length === 0) return []
  const texts = entries.map(entryText)
  const embedder = opts.embedder === undefined ? embedderFor(LOCAL_MODEL) : opts.embedder
  const meaning = embedder ? await meaningScores(embedder, query, texts, opts.waitMs ?? WAIT_MS) : null
  const words = wordScores(query, texts, entries.map(e => e.name))
  const bar = meaning ? MEANING_BAR : WORDS_BAR
  return entries
    .map((entry, i) => ({
      entry,
      score: (meaning ? meaning[i]! + WORD_WEIGHT * words[i]! : words[i]!) + (names(query, entry.name) ? NAMED : 0),
    }))
    .filter(s => s.score >= bar)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? FOUND_AT_MOST)
    .map(({ entry }) => ({ name: entry.name, description: entry.description, input: entry.input }))
}

/** For tests: forget every vector kept. */
export function forgetVectors(): void {
  vectors.clear()
}
