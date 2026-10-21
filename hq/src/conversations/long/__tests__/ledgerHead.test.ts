/** The ledger as the block's head (long conversations spec, The ledger): structured, closed work one line, bounded. */
import { describe, it, expect } from 'vitest'
import { boundedHead, CLOSED_LINE_MAX_CHARS, ledgerHeadText, type KeptEntry } from '../ledgerHead'

const e = (id: string, kind: KeptEntry['kind'], text: string, extra: Partial<KeptEntry> = {}): KeptEntry =>
  ({ id, kind, text, at: '2026-10-01T00:00:00.000Z', ...extra })

describe('the ledger head @SC-981', () => {
  it('trims a closed operation to one line and keeps open entries whole', () => {
    const long = 'Reviewed the README and found three issues '.repeat(10)
    const head = boundedHead([e('L1', 'open-operation', long, { operationId: 'op-1', closed: true }), e('L2', 'decision', 'Ship on Friday, because QA signed off')])
    expect(head[0]!.text.length).toBeLessThanOrEqual(CLOSED_LINE_MAX_CHARS)
    expect(head[1]!.text).toBe('Ship on Friday, because QA signed off')
  })

  it('stays within its budget, letting closed operations go first, then approvals, oldest first', () => {
    const entries = [
      e('L1', 'open-operation', 'x'.repeat(100), { operationId: 'a', closed: true }),
      e('L2', 'approval', 'y'.repeat(100)),
      e('L3', 'open-operation', 'z'.repeat(100), { operationId: 'b', closed: true }),
      e('L4', 'decision', 'w'.repeat(100)),
    ]
    expect(boundedHead(entries, 60).map(x => x.id)).toEqual(['L2', 'L4'])
    expect(boundedHead(entries, 30).map(x => x.id)).toEqual(['L4'])
    expect(boundedHead(entries).map(x => x.id)).toEqual(['L1', 'L2', 'L3', 'L4'])
  })

  it('reads by kind, open work first, and says nothing when the ledger is empty', () => {
    const text = ledgerHeadText([
      e('L1', 'decision', 'Use Postgres'),
      e('L2', 'open-operation', 'Review the README', { operationId: 'op-1' }),
      e('L3', 'obligation', 'Create the task once the fix lands', { closed: true }),
    ])!
    expect(text.indexOf('Work started here')).toBeLessThan(text.indexOf('Decisions'))
    expect(text).toContain('- Open: Review the README [op-1]')
    expect(text).toContain('- Done: Create the task once the fix lands [L3]')
    expect(ledgerHeadText([])).toBeNull()
  })
})
