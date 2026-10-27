/**
 * One request for every embed on screen (spec part 2, *Embedded files*): embeds that come into view together, in any
 * number of Markdown blocks, are gathered for a moment and opened with one call. The same file asked for twice in a
 * gathering is asked for once. Answers are not kept between gatherings: each holds tickets that end, and the embed that
 * asked keeps its own.
 */
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'
import { embedKey } from './embedTarget'

export type OpenMany<A = FileOpenAnswer> = (files: SiteFileRef[]) => Promise<A[]>

/** Long enough to catch the embeds a scroll or a first paint brings into view together. */
export const GATHER_MS = 30
const MOST_PER_CALL = 50

type Waiting<T, A> = { ref: T; settle: Array<(answer: A) => void> }

/** Opens (or, for chips, asks after) files in batches; `A` is the answer, which always has a `site-unavailable` state. */
export function createEmbedBatch<A extends { state: string } = FileOpenAnswer>(openMany: OpenMany<A>, gatherMs = GATHER_MS) {
  return createKeyedBatch<SiteFileRef, A>(embedKey, openMany, gatherMs)
}

/** The same gathering for any item a key names: a task chip's reference as well as a file. */
export function createKeyedBatch<T, A extends { state: string }>(keyOf: (item: T) => string, openMany: (items: T[]) => Promise<A[]>, gatherMs = GATHER_MS) {
  // Every answer type a batch carries has this state, which is what an embed shows when the request itself failed.
  const unanswered = { state: 'site-unavailable' } as A
  let waiting = new Map<string, Waiting<T, A>>()
  let timer: ReturnType<typeof setTimeout> | null = null

  async function send(batch: Waiting<T, A>[]) {
    let answers: A[] = []
    try {
      answers = await openMany(batch.map(w => w.ref))
    } catch {
      // The whole request failed (HQ away, signed out): every embed in it shows the site as unavailable.
    }
    batch.forEach((w, i) => {
      const answer = answers[i] ?? unanswered
      w.settle.forEach(s => s(answer))
    })
  }

  function flush() {
    timer = null
    const all = [...waiting.values()]
    waiting = new Map()
    for (let i = 0; i < all.length; i += MOST_PER_CALL) void send(all.slice(i, i + MOST_PER_CALL))
  }

  return {
    open(ref: T): Promise<A> {
      return new Promise(resolve => {
        const key = keyOf(ref)
        const entry = waiting.get(key)
        if (entry) entry.settle.push(resolve)
        else waiting.set(key, { ref, settle: [resolve] })
        timer ??= setTimeout(flush, gatherMs)
      })
    },
  }
}

export type EmbedBatch<A extends { state: string } = FileOpenAnswer> = { open(ref: SiteFileRef): Promise<A> }
