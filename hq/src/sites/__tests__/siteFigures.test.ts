import { describe, it, expect } from 'vitest'
import type { SiteHealth } from '@agenthix/core'
import { canSeeFigures, loadOf, withoutFigures, siteIsCloud } from '../siteFigures'
import type { SiteListEntry } from '../siteViews'

const health: SiteHealth = {
  takenAt: new Date().toISOString(),
  runs: { running: 2, maxAtOnce: 4 },
  disk: { freeBytes: 5e9, totalBytes: 500e9 },
  docker: { running: true, version: '27.1' },
  agentImage: { name: 'agent', present: true, version: '0.4.0' },
  ceilings: null,
  memoryNearlyFull: true,
}
const entry = {
  id: 'e1', siteId: 's1', label: 'office-server', figures: true, health, load: loadOf(health), protocolVersion: '1.5', hqProtocol: '1.0',
  problems: [{ kind: 'diskNearlyFull', freeBytes: 5e9, totalBytes: 500e9 }, { kind: 'upgrade', protocolVersion: '3.2', side: 'hq' }, { kind: 'dockerDown' }],
} as unknown as SiteListEntry

describe('who sees a machine’s figures @SC-939', () => {
  it('a fleet admin does, and nobody else', () => {
    expect(canSeeFigures(true, { cloudMachineId: null })).toBe(true)
    expect(canSeeFigures(false, { cloudMachineId: null })).toBe(false)
  })

  it('nobody does for a site Agenthix Cloud added @SC-1097', () => {
    expect(siteIsCloud({ cloudMachineId: 'machine-7' })).toBe(true)
    expect(siteIsCloud({ cloudMachineId: null })).toBe(false)
    expect(canSeeFigures(true, { cloudMachineId: 'machine-7' })).toBe(false)
  })

  it('leaves no figure, no version and no health report in what others are given', () => {
    const shown = withoutFigures(entry)
    expect(shown.figures).toBe(false)
    expect(shown.health).toBeNull()
    expect(shown.protocolVersion).toBeNull()
    expect(shown.hqProtocol).toBe('')
    const text = JSON.stringify(shown)
    for (const leaked of ['5000000000', '500000000000', '27.1', '0.4.0', '3.2', '1.5', 'freeBytes']) expect(text).not.toContain(leaked)
  })

  it('keeps the cause and the load every person may see', () => {
    const shown = withoutFigures(entry)
    expect(shown.problems.map((p) => p.kind)).toEqual(['diskNearlyFull', 'upgrade', 'dockerDown'])
    expect(shown.load).toEqual({ running: 2, maxAtOnce: 4 })
  })
})
