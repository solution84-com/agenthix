/**
 * What a compaction folds (long conversations spec, Compaction in segments): the window older than the low mark,
 * never this turn's input or a message still waiting, leaving a window that starts on the person's side.
 */
import { describe, it, expect } from 'vitest'
import { foldRange, type WindowMessage } from '../fold'

const m = (seq: number, tokens: number, side: WindowMessage['side'] = seq % 2 ? 'user' : 'assistant'): WindowMessage =>
  ({ seq, createdAt: `2026-10-01T00:00:${String(seq).padStart(2, '0')}.000Z`, tokens, side })

describe('foldRange @SC-979', () => {
  it('keeps the newest messages that fit under the low mark and folds everything older', () => {
    const window = [m(1, 100), m(2, 100), m(3, 100), m(4, 100), m(5, 100), m(6, 100)]
    const range = foldRange(window, 250)
    // 5 and 6 fit; the window it leaves must start with the person's side, so 5 stays and 4 folds.
    expect(range).toMatchObject({ firstSeq: 1, lastSeq: 4, seqs: [1, 2, 3, 4], firstAt: window[0]!.createdAt, lastAt: window[3]!.createdAt })
  })

  it('never folds the turn\'s input or anything after it, even past the budget', () => {
    const window = [m(1, 100), m(2, 100), m(3, 1_000), m(4, 1_000)]
    expect(foldRange(window, 10, 3)).toMatchObject({ firstSeq: 1, lastSeq: 2 })
  })

  it('moves the fold back rather than leave a window that opens on the agent\'s side', () => {
    // Only the agent's reply (4) would fit; it cannot open the window, so the person's message before it stays too.
    const window = [m(1, 100), m(2, 100), m(3, 100), m(4, 100)]
    expect(foldRange(window, 150)).toMatchObject({ lastSeq: 2 })
  })

  it('folds nothing when everything fits, or when what would fold holds nothing the lead reads', () => {
    expect(foldRange([m(1, 100), m(2, 100)], 1_000)).toBeNull()
    expect(foldRange([m(1, 0, null), m(2, 0, null), m(3, 500)], 600, 3)).toBeNull()
  })
})
