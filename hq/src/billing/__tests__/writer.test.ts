import { describe, expect, it } from 'vitest'
import { NO_USAGE } from '@agenthix/core'
import { createLedger, type LedgerStore } from '../writer'
import type { LedgerCall, NewUsageEntry, StoredCall } from '../types'

/** The store as the database keeps it: rows only ever added, and one CALL row per call id. */
function memoryStore() {
  const rows: StoredCall[] = []
  const store: LedgerStore = {
    async insertCall(row: NewUsageEntry) {
      if (rows.some(r => r.kind === 'CALL' && r.callId === row.callId)) return false
      rows.push({ ...row, id: `row-${rows.length + 1}` })
      return true
    },
    async findCall(callId) {
      return rows.find(r => r.kind === 'CALL' && r.callId === callId) ?? null
    },
    async append(row) {
      rows.push({ ...row, id: `row-${rows.length + 1}` })
    },
    async hasActual(callRowId, amountMicros, currency) {
      return rows.some(r => r.kind === 'ACTUAL' && r.refersTo === callRowId && r.amountMicros === amountMicros && r.currency === currency)
    },
    async defaultProfileId() {
      return 'bp-default'
    },
  }
  return { rows, store }
}

const call: LedgerCall = {
  callId: 'call-0001', at: new Date('2026-10-23T10:00:00Z'), purpose: 'conversation', basis: 'ESTIMATED',
  billingProfileId: 'bp-1', providerId: 'p-ant', providerName: 'Anthropic', vendor: 'anthropic', model: 'claude-sonnet-4-5',
  usage: { ...NO_USAGE, inputTokens: 2_000, outputTokens: 500 }, projectId: 'proj-1', agentId: 'agent-1', userId: 'user-1',
  conversationId: 'conv-1', turnId: 'turn-1',
}

describe('the ledger writer', () => {
  it('writes one CALL row with its price, its money in whole millionths as a bigint', async () => {
    const { rows, store } = memoryStore()
    expect(await createLedger(store, { usageBilling: false }).writeCall(call)).toBe(true)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toMatchObject({ kind: 'CALL', callId: 'call-0001', refersTo: null, basis: 'ESTIMATED', currency: 'USD', billingProfileId: 'bp-1', runId: null })
    // 2,000 in at $3 and 500 out at $15 per million: $0.0135.
    expect(row.amountMicros).toBe(13_500n)
    expect(row.priceRef).toMatch(/^hq:opencode-/)
  })

  it('counts a call reported twice once', async () => {
    const { rows, store } = memoryStore()
    const ledger = createLedger(store, { usageBilling: false })
    expect(await ledger.writeCall(call)).toBe(true)
    expect(await ledger.writeCall({ ...call, usage: { ...call.usage, inputTokens: 9_999 } })).toBe(false)
    expect(rows).toHaveLength(1)
    expect(rows[0].inputTokens).toBe(2_000)
  })

  it('costs a call with no profile yet to the default one', async () => {
    const { rows, store } = memoryStore()
    await createLedger(store, { usageBilling: false }).writeCall({ ...call, billingProfileId: '' })
    expect(rows[0].billingProfileId).toBe('bp-default')
  })

  it('appends an ACTUAL row pointing at its call, and changes nothing already written', async () => {
    const { rows, store } = memoryStore()
    const ledger = createLedger(store, { usageBilling: true })
    await ledger.writeCall({ ...call, vendor: 'cloud', basis: 'AWAITING_ACTUAL' })
    const before = structuredClone(rows[0])
    expect(await ledger.writeActual({ callId: 'call-0001', amountMicros: 20_000n, currency: 'USD', at: new Date('2026-10-23T10:05:00Z') })).toBe(true)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(before)
    expect(rows[1]).toMatchObject({
      kind: 'ACTUAL', callId: 'call-0001', refersTo: rows[0].id, basis: 'ACTUAL', amountMicros: 20_000n, priceRef: 'cloud-actual',
      billingProfileId: 'bp-1', projectId: 'proj-1', inputTokens: 0,
    })
  })

  it('does not append the same actual twice, nor one for a call it never wrote', async () => {
    const { rows, store } = memoryStore()
    const ledger = createLedger(store, { usageBilling: true })
    await ledger.writeCall({ ...call, vendor: 'cloud', basis: 'AWAITING_ACTUAL' })
    const actual = { callId: 'call-0001', amountMicros: 20_000n, currency: 'USD', at: new Date() }
    await ledger.writeActual(actual)
    expect(await ledger.writeActual(actual)).toBe(false)
    expect(await ledger.writeActual({ ...actual, callId: 'call-unknown' })).toBe(false)
    expect(rows).toHaveLength(2)
  })

  it('appends a correction as a new row, negative amounts allowed', async () => {
    const { rows, store } = memoryStore()
    const ledger = createLedger(store, { usageBilling: false })
    await ledger.writeCall(call)
    expect(await ledger.writeCorrection({ callId: 'call-0001', amountMicros: -500n, currency: 'USD' })).toBe(true)
    expect(rows.map(r => r.kind)).toEqual(['CALL', 'CORRECTION'])
    expect(rows[1]).toMatchObject({ refersTo: rows[0].id, amountMicros: -500n, basis: 'ESTIMATED' })
  })

  it('refuses money that is not a currency code', async () => {
    const { store } = memoryStore()
    const ledger = createLedger(store, { usageBilling: true })
    await ledger.writeCall(call)
    await expect(ledger.writeActual({ callId: 'call-0001', amountMicros: 1n, currency: 'usd', at: new Date() })).rejects.toThrow(/currency/)
  })

  it('offers no way to change or remove a row', () => {
    const { store } = memoryStore()
    expect(Object.keys(createLedger(store, { usageBilling: false })).sort()).toEqual(['writeActual', 'writeCall', 'writeCorrection'])
  })
})
