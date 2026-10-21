/** The lead's `ledger` tool (long conversations spec, The ledger): adds an entry, marks one done, refuses a report turn. */
import { describe, it, expect, vi } from 'vitest'
import { createLedgerTool } from '../ledgerTool'
import type { Ledger } from '../ledger'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'

function fakeLedger(): Ledger {
  return {
    record: vi.fn(), closeOperation: vi.fn(), head: vi.fn(), entries: vi.fn(),
    add: vi.fn(async () => 'L4'),
    markDone: vi.fn(async (_c: string, id: string) => id === 'L2'),
  }
}

describe('the ledger tool @SC-981', () => {
  it('keeps a decision and answers with its id', async () => {
    const ledger = fakeLedger()
    const capability = turnCapability({ turnId: 't1', actingUserId: 'u1' })
    const outcome = await createLedgerTool(ledger).run(capability, { kind: 'decision', text: 'Ship Friday, QA signed off' }, { signal: new AbortController().signal })
    expect(outcome).toEqual({ status: 'done', operationId: 't1', result: { kept: 'L4' } })
    expect(ledger.add).toHaveBeenCalledWith(capability.conversationId, { kind: 'decision', text: 'Ship Friday, QA signed off' })
  })

  it('marks an entry done, and says when there is no such entry', async () => {
    const tool = createLedgerTool(fakeLedger())
    const capability = turnCapability({ turnId: 't1', actingUserId: 'u1' })
    expect(await tool.run(capability, { done: 'L2' }, { signal: new AbortController().signal })).toMatchObject({ status: 'done' })
    expect(await tool.run(capability, { done: 'L9' }, { signal: new AbortController().signal })).toMatchObject({ status: 'refused' })
    expect(await tool.run(capability, { kind: 'keep' }, { signal: new AbortController().signal })).toMatchObject({ status: 'refused' })
  })

  it('is not offered to a turn that answers no one', async () => {
    const tool = createLedgerTool(fakeLedger())
    expect(await tool.offered(turnCapability({ trigger: 'REPORT', actingUserId: null }))).toBe(false)
    expect(await tool.offered(turnCapability({ actingUserId: 'u1' }))).toBe(true)
  })
})
