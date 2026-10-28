import { describe, it, expect } from 'vitest'
import { parseWithdrawnList, withdrawnReason, withdrawnRefusal, WithdrawnListError } from '../withdrawn'

const list = parseWithdrawnList({
  format: 1,
  withdrawn: [{ asset: 'agenthix/dev-github-operations', version: '1.0.0', reason: 'It told agents to push to the default branch.' }],
})

describe("Agenthix's withdrawn list @security-M4 @SC-1620", () => {
  it('names why a listed Agenthix version was withdrawn', () => {
    expect(withdrawnReason(list, { publisher: 'agenthix', name: 'dev-github-operations', version: '1.0.0' })).toBe('It told agents to push to the default branch.')
    expect(withdrawnReason(list, { publisher: 'agenthix', name: 'dev-github-operations', version: '1.1.0' })).toBeNull()
  })

  it("speaks only for Agenthix's identities: another publisher's skill of the same name isn't withdrawn by it", () => {
    expect(withdrawnReason(list, { publisher: 'acme', name: 'dev-github-operations', version: '1.0.0' })).toBeNull()
  })

  it('also names a version its row says was withdrawn', () => {
    expect(withdrawnReason([], { publisher: 'acme', name: 'x', version: '1.0.0', withdrawn: true, withdrawnReason: 'Broken' })).toBe('Broken')
    expect(withdrawnReason([], { publisher: 'acme', name: 'x', version: '1.0.0', withdrawn: true, withdrawnReason: null })).toMatch(/withdrew/)
  })

  it('refuses until the warning is accepted, naming why', () => {
    expect(withdrawnRefusal('agenthix/dev-github-operations', '1.0.0', 'It told agents to push.', false)).toMatch(/withdrew agenthix\/dev-github-operations 1\.0\.0: It told agents to push\..*Nothing was changed\./)
    expect(withdrawnRefusal('agenthix/dev-github-operations', '1.0.0', 'It told agents to push.', true)).toBeNull()
    expect(withdrawnRefusal('agenthix/x', '1.0.0', null, false)).toBeNull()
  })

  it('reads the list strictly and refuses anything else', () => {
    expect(() => parseWithdrawnList({ format: 2, withdrawn: [] })).toThrow(WithdrawnListError)
    expect(() => parseWithdrawnList({ format: 1, withdrawn: [{ asset: 'x', version: '1.0.0', reason: 'r' }] })).toThrow(WithdrawnListError)
    expect(() => parseWithdrawnList({ format: 1, withdrawn: [{ asset: 'agenthix/x', version: '1.0', reason: 'r' }] })).toThrow(WithdrawnListError)
    expect(() => parseWithdrawnList({ format: 1, withdrawn: [{ asset: 'agenthix/x', version: '1.0.0', reason: '' }] })).toThrow(WithdrawnListError)
    expect(parseWithdrawnList({ format: 1, withdrawn: [] })).toEqual([])
  })
})
