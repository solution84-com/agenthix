import { describe, expect, it } from 'vitest'
import { EnvelopeReplayGuard, fingerprintOf, generateHostKeys, openEnvelope, sealEnvelope } from '../crypto/index.js'
import { HOST_SILENT_AFTER_MS, HOST_STOPPING_BUDGET_MS, parseHostStopping } from '../stopping.js'
import * as root from '../../index.js'

describe('the stop word', () => {
  it('is exactly { kind: "stopping" }, and nothing else is taken for it', () => {
    expect(parseHostStopping({ kind: 'stopping' })).toEqual({ kind: 'stopping' })
    for (const v of [
      null, undefined, 'stopping', [], {}, { kind: 'Stopping' }, { kind: 'stopped' },
      // Nothing rides along with it: it carries nothing a receiver could act on.
      { kind: 'stopping', request: { op: 'erase' } }, { kind: 'stopping', at: '2026-10-15T10:00:00Z' },
    ]) {
      expect(parseHostStopping(v)).toBeNull()
    }
  })

  it('travels signed and sealed like every envelope, and opens only against the machine that sent it', async () => {
    const [host, other, fleetConsole] = await Promise.all([generateHostKeys('host'), generateHostKeys('host'), generateHostKeys('console')])
    const hostFp = await fingerprintOf(host.identity)
    const pinned = (fp: string) => (fp === hostFp ? host.identity : null)
    const env = await sealEnvelope({ sender: host, recipient: fleetConsole.identity, message: { kind: 'stopping' } })
    const opened = await openEnvelope(env, { recipient: fleetConsole, pinned, replay: new EnvelopeReplayGuard(0) })
    expect(opened.ok && opened.fromFingerprint === hostFp && parseHostStopping(opened.message)).toEqual({ kind: 'stopping' })

    const forged = await sealEnvelope({ sender: other, recipient: fleetConsole.identity, message: { kind: 'stopping' } })
    expect((await openEnvelope(forged, { recipient: fleetConsole, pinned, replay: new EnvelopeReplayGuard(0) })).ok).toBe(false)
  })

  it('is sent within a budget well inside Docker’s 10-second grace, and silence counts after 10 minutes', () => {
    expect(HOST_STOPPING_BUDGET_MS).toBeLessThanOrEqual(3_000)
    expect(HOST_SILENT_AFTER_MS).toBe(10 * 60_000)
    expect(root.parseHostStopping).toBe(parseHostStopping)
  })
})
