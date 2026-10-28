import { describe, it, expect } from 'vitest'
import { foldCopies } from '../entries'
import type { CopyLink } from '../copies'
import { row } from '../../components/__tests__/fixtures'

const original = row({ key: 'o', assetId: 'o', title: 'Code Review', identity: 'agenthix/code-review', version: '2.1.0', statuses: ['setAside', 'update'], setAsideFor: 'fernhill/code-review', updateTo: '2.1.0' })
const copy = row({ key: 'c', assetId: 'c', title: 'Code Review', identity: 'fernhill/code-review', version: '2.0.1', signer: 'Made here', has: 'Ada has it' })
const other = row({ key: 'x', assetId: 'x', title: 'SEO Audit', identity: 'acme/seo-audit' })
const owners = new Map([['o', 'Agenthix']])
const link = (over: Partial<CopyLink> = {}): CopyLink => ({ copyId: 'c', originId: 'o', copiedFrom: '2.0.0', inUse: true, published: true, ...over })

describe('a copy and its original as one Library entry @SC-1628', () => {
  it('shows the copy in use as the entry, with the set-aside original under it, and keeps its own states', () => {
    const rows = foldCopies([original, copy, other], [link()], owners)
    expect(rows.map(r => r.key)).toEqual(['c', 'x'])
    expect(rows[0]).toMatchObject({ statuses: [], has: 'Ada has it' })
    expect(rows[0]!.partners).toEqual([{
      assetId: 'o', relation: 'original', identity: 'agenthix/code-review', version: '2.1.0',
      words: "Agenthix's Code Review 2.0.0", statuses: ['setAside'], draftBy: null,
    }])
  })

  it('after switching back, shows the original as the entry with the copy set aside under it', () => {
    const back = { ...original, statuses: [], setAsideFor: null, updateTo: null }
    const rows = foldCopies([back, { ...copy, statuses: ['draft'], draftBy: 'Sam' }], [link({ inUse: false })], owners)
    expect(rows.map(r => r.key)).toEqual(['o'])
    expect(rows[0]!.partners).toEqual([{
      assetId: 'c', relation: 'copy', identity: 'fernhill/code-review', version: '2.0.1',
      words: 'fernhill/code-review 2.0.1', statuses: ['draft', 'setAside'], draftBy: 'Sam',
    }])
  })

  it('a copy never published sits under the original as a draft, not set aside', () => {
    const rows = foldCopies([{ ...original, statuses: [], setAsideFor: null }, { ...copy, statuses: ['draft'], draftBy: 'Sam' }], [link({ inUse: false, published: false })], owners)
    expect(rows[0]!.partners[0]!.statuses).toEqual(['draft'])
  })

  it('names an original nobody signed by its identity', () => {
    const rows = foldCopies([original, copy], [link()], new Map([['o', null]]))
    expect(rows[0]!.partners[0]!.words).toBe('agenthix/code-review 2.0.0')
  })

  it('leaves a set-aside original a row of its own when its copy is not in the Library', () => {
    const rows = foldCopies([original, other], [link()], owners)
    expect(rows.map(r => r.key)).toEqual(['o', 'x'])
    expect(rows[0]).toMatchObject({ setAsideFor: 'fernhill/code-review', partners: [] })
  })

  it('leaves a copy a row of its own when its original is not in the Library', () => {
    expect(foldCopies([copy], [link()], owners).map(r => [r.key, r.partners.length])).toEqual([['c', 0]])
  })

  it('keeps a proposal row that names an asset id as it is', () => {
    const proposal = row({ key: 'proposal:p', assetId: 'o', proposalId: 'p', statuses: ['waiting'] })
    expect(foldCopies([original, copy, proposal], [link()], owners).map(r => r.key)).toEqual(['c', 'proposal:p'])
  })
})
