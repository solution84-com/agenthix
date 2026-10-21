import { afterEach, describe, expect, it } from 'vitest'
import { readOnlyCommand, transferOpenCommand } from '../hqMove'
import { readOnlyNow, setReadOnly } from '../../server/readOnly'
import { RelayHub } from '../relay/relayHub'

afterEach(() => setReadOnly(null))

describe("hq's move, on its control socket @SC-934", () => {
  it('turns read-only on with the machine it moves to, keeps when it began, and off again', () => {
    const now = new Date('2026-10-14T22:00:00Z')
    expect(readOnlyCommand(['on', 'new-server'], now)).toMatchObject({ ok: true, data: { readOnly: true, to: 'new-server', since: now.toISOString() } })
    expect(readOnlyCommand(['on', 'new-server'], new Date('2026-10-14T22:05:00Z'))).toMatchObject({ data: { since: now.toISOString() } })
    expect(readOnlyCommand([])).toMatchObject({ ok: true, text: 'HQ is moving to new-server; changes are paused until the move ends.' })
    expect(readOnlyCommand(['off'])).toMatchObject({ ok: true, data: { readOnly: false } })
    expect(readOnlyNow()).toBeNull()
  })

  it('refuses what it does not read', () => {
    for (const args of [['maybe'], ['on', 'a\nb'], ['off', 'x'], ['on', 'a', 'b']]) {
      expect(readOnlyCommand(args), args.join(' ')).toMatchObject({ ok: false, code: 'usage' })
    }
    expect(readOnlyNow()).toBeNull()
  })

  it('opens the last steps only for a transfer between two fingerprints', async () => {
    const hub = new RelayHub({ knownHost: async () => null })
    for (const args of [[], ['transfer-1', 'a'.repeat(64)], ['bad id!', 'a'.repeat(64), 'b'.repeat(64)], ['transfer-1', 'a'.repeat(64), 'a'.repeat(64)]]) {
      expect(await transferOpenCommand(hub, args), args.join(' ')).toMatchObject({ ok: false, code: 'usage' })
    }
    expect(hub.transfers.isOpen('transfer-1')).toBe(false)
  })
})
