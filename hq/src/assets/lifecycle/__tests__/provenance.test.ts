import { describe, it, expect } from 'vitest'
import { copyLines, heldLines, markLines, statedLine, ProvenanceError, type HeldLine } from '../provenance'

const FP = 'a'.repeat(64)
const FP2 = 'b'.repeat(64)
const DAY = new Date('2026-10-27T12:00:00Z')

describe('the based-on list a copy is given', () => {
  it("inherits the original's list and adds the original as one line recorded by hq", () => {
    const inherited: HeldLine[] = [{ skill: 'blog.example.com/checklist', copied: '2026-01-02', recorded: 'stated', statedBy: 'acme' }]
    expect(copyLines({ identity: 'agenthix/code-review', version: '1.3.0', digest: FP, basedOn: inherited }, DAY)).toEqual([
      inherited[0],
      { skill: 'agenthix/code-review', version: '1.3.0', fingerprint: FP, copied: '2026-10-27', recorded: 'hq' },
    ])
  })

  it("reads an original that came from a package as its signer's statement, whatever its lines claim", () => {
    const claimed = [{ skill: 'agenthix/x', version: '1.0.0', fingerprint: FP2, copied: '2026-01-01', recorded: 'hq' }]
    const lines = copyLines({ identity: 'acme/y', version: '2.0.0', digest: FP, basedOn: claimed, fromPackage: true, publisher: 'acme' }, DAY)
    expect(lines[0]).toEqual({ ...claimed[0], recorded: 'stated', statedBy: 'acme' })
  })

  it('refuses a list that would be over the limit rather than drop a line', () => {
    const full: HeldLine[] = Array.from({ length: 50 }, (_, i) => ({ skill: `s${i}`, copied: '2026-01-01', recorded: 'stated' }))
    expect(() => copyLines({ identity: 'acme/y', version: '1.0.0', digest: FP, basedOn: full }, DAY)).toThrow(ProvenanceError)
  })
})

describe('a credit a person states', () => {
  it('is a stated line, dated today, by the organisation', () => {
    expect(statedLine({ skill: ' blog.example.com/review-checklist ' }, 'fernhill', DAY)).toEqual({
      skill: 'blog.example.com/review-checklist', copied: '2026-10-27', recorded: 'stated', statedBy: 'fernhill',
    })
  })

  it('may name a version and the day it was copied', () => {
    expect(statedLine({ skill: 'x', version: 'v2', copied: '2026-09-01' }, 'fernhill', DAY)).toMatchObject({ version: 'v2', copied: '2026-09-01' })
  })

  it('refuses an empty source, a control character or a date that is not one', () => {
    expect(() => statedLine({ skill: '  ' }, 'f', DAY)).toThrow(ProvenanceError)
    expect(() => statedLine({ skill: 'a\nb' }, 'f', DAY)).toThrow(ProvenanceError)
    expect(() => statedLine({ skill: 'a', copied: '2026-02-30' }, 'f', DAY)).toThrow(ProvenanceError)
  })
})

describe('which lines show as verified (security review M5)', () => {
  const hqLine: HeldLine = { skill: 'agenthix/code-review', version: '1.3.0', fingerprint: FP, copied: '2026-10-27', recorded: 'hq' }
  const holds = (identity: string, version: string) => (identity === 'agenthix/code-review' && version === '1.3.0' ? FP : null)

  it('verifies a line hq wrote here when hq holds that version and its fingerprint matches', () => {
    expect(markLines([hqLine], { madeHere: true, publisher: 'fernhill' }, holds)[0]).toMatchObject({ shown: 'verified' })
  })

  it('shows it stated when hq no longer holds the original or the fingerprint differs', () => {
    expect(markLines([{ ...hqLine, version: '1.4.0' }], { madeHere: true, publisher: 'fernhill' }, holds)[0]).toMatchObject({ shown: 'stated' })
    expect(markLines([{ ...hqLine, fingerprint: FP2 }], { madeHere: true, publisher: 'fernhill' }, holds)[0]).toMatchObject({ shown: 'stated' })
  })

  it("shows every line of a version that came from a package as stated by its signer, even one claiming hq", () => {
    expect(markLines([hqLine], { madeHere: false, publisher: 'acme' }, holds)[0]).toMatchObject({ shown: 'stated', statedBy: 'acme' })
  })

  it('shows a stated line as stated by whoever stated it', () => {
    const line: HeldLine = { skill: 'x', copied: '2026-10-27', recorded: 'stated', statedBy: 'fernhill' }
    expect(markLines([line], { madeHere: true, publisher: 'fernhill' }, holds)[0]).toMatchObject({ shown: 'stated', statedBy: 'fernhill' })
  })
})

describe('reading the list hq holds', () => {
  it('keeps only well-formed lines', () => {
    expect(heldLines([{ skill: 'x', copied: '2026-01-01', recorded: 'stated' }, { nonsense: true }, 'x'])).toEqual([{ skill: 'x', copied: '2026-01-01', recorded: 'stated' }])
    expect(heldLines(null)).toEqual([])
  })
})
