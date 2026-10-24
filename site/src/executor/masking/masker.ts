/**
 * The masker one stream of a step's output passes through (workflows spec part 2, *Masking*): every stretch that is a
 * form of a secret of the place becomes `***`, as GitHub Actions masks its logs. Overlapping or touching finds become
 * one `***`.
 *
 * Output is held back until every window that could start at a byte has arrived: `CROSS_LINE_MAX` bytes at most on
 * output in lines, and up to the longest form while a line runs on, so a value split across chunks is still found.
 *
 * Masking is asynchronous: it works in slices of `SLICE_MS` and gives the event loop a turn between them, so the
 * site's channel and its agents' requests are not held up by a step printing megabytes. Calls are taken in the order
 * made, whether or not the caller waits for each.
 */
import { setImmediate as yieldToLoop } from 'node:timers/promises'
import type { WorkflowMaskingMaterial } from '@agenthix/core'
import type { Masker } from '../seams'
import { FormMatcher } from './matcher'

export const MASK = Buffer.from('***')
const WITHHELD = Buffer.from('[output withheld: the masking material could not be read]\n')
/** How long masking holds the event loop before giving it a turn. */
export const SLICE_MS = 10
/** Positions between looks at the clock. */
const CLOCK_EVERY = 64
/**
 * When masking last gave the event loop a turn, across every masker and push: pushes that each take less than a
 * slice but follow one another as promises would otherwise hold the loop for as long as they keep coming.
 */
let sliceStart = performance.now()

export function createFormMasker(material: WorkflowMaskingMaterial): Masker {
  let matcher: FormMatcher
  try {
    matcher = new FormMatcher(material)
  } catch {
    return withholdingMasker()
  }
  const printed = new Set<string>()
  let pending: Buffer = Buffer.alloc(0)
  /** Within `pending`, the end of the last stretch masked; bytes before it are covered. */
  let maskedTo = 0
  /** Whether the last thing let out was a mask, so a find that starts where it ends joins it. */
  let inMask = false
  let ended = false
  let queue: Promise<unknown> = Promise.resolve()

  const run = async (final: boolean): Promise<Buffer> => {
    const buf = pending
    const scan = matcher.over(buf)
    const parts: Buffer[] = []
    let plainFrom = -1
    let p = 0
    for (; p < buf.length; p++) {
      if (p % CLOCK_EVERY === 0 && performance.now() - sliceStart > SLICE_MS) {
        await yieldToLoop()
        sliceStart = performance.now()
      }
      if (!final && !scan.decidable(p)) break
      const found = matcher.empty ? null : scan.matchAt(p)
      if (found) for (const name of found.secretNames) printed.add(name)
      if (p < maskedTo || (found && inMask && p === maskedTo)) {
        if (found) maskedTo = Math.max(maskedTo, p + found.length)
        continue
      }
      if (found) {
        if (plainFrom >= 0) { parts.push(buf.subarray(plainFrom, p)); plainFrom = -1 }
        parts.push(MASK)
        inMask = true
        maskedTo = p + found.length
      } else if (plainFrom < 0) {
        plainFrom = p
        inMask = false
      }
    }
    if (plainFrom >= 0) parts.push(buf.subarray(plainFrom, p))
    pending = Buffer.from(buf.subarray(p))
    maskedTo = Math.max(0, maskedTo - p)
    return Buffer.concat(parts)
  }

  const inOrder = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work)
    queue = next.catch(() => {})
    return next
  }

  return {
    push: chunk => {
      // Copied now: the caller may reuse its buffer before this push's turn comes.
      const bytes = Buffer.from(chunk)
      return inOrder(async () => {
        if (ended || bytes.length === 0) return new Uint8Array(0)
        pending = pending.length ? Buffer.concat([pending, bytes]) : bytes
        return run(false)
      })
    },
    end: () => inOrder(async () => {
      if (ended) return new Uint8Array(0)
      ended = true
      const out = await run(true)
      pending = Buffer.alloc(0)
      return out
    }),
    printed: () => [...printed].sort(),
  }
}

/** Material that can't be read lets nothing out. */
function withholdingMasker(): Masker {
  let ended = false
  return {
    push: async () => new Uint8Array(0),
    end: async () => {
      if (ended) return new Uint8Array(0)
      ended = true
      return WITHHELD
    },
    printed: () => [],
  }
}
