import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

vi.mock('../../utils/logger', () => ({
  Logger: vi.fn().mockImplementation(function () { return ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}))

import { HostFigures, PROTECTIONS_MISSING, parseReading, readFiguresSocket } from '../hostFigures'

const GIB = 1024 ** 3
const ceilings = { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 4 }
const T0 = Date.parse('2026-10-14T09:00:00Z')

/** What the host service's figures socket answers: every figure, of which the site keeps two. */
function answer(over: { holding?: boolean; checkedAt?: string; ceilings?: unknown; rules?: string[]; publicAddressKnown?: boolean } = {}) {
  return {
    event: 'result', ok: true, op: 'figures.read',
    result: {
      takenAt: '2026-10-14T09:00:00Z',
      machine: { name: 'hq-box', system: 'Linux', dockerVersion: '29.0.0', hostServiceVersion: '0.2.0', upSince: '2026-10-01T00:00:00Z' },
      resources: { cpuLoad: 0.4, memory: { usedBytes: 3 * GIB, totalBytes: 16 * GIB }, disk: { freeBytes: 1, totalBytes: 2 } },
      ceilings: over.ceilings ?? ceilings,
      protections: {
        holding: over.holding ?? true, rules: over.rules ?? [], checkedAt: over.checkedAt ?? '2026-10-14T09:00:00Z', problem: null,
        ...(over.publicAddressKnown === undefined ? {} : { publicAddressKnown: over.publicAddressKnown }),
      },
      installs: [], scheduledChanges: 0,
    },
  }
}

describe('what the site takes from the figures', () => {
  it('keeps the ceilings and whether the protections hold, and nothing else', () => {
    const r = parseReading(answer(), T0)
    expect(r).toEqual({ ceilings, protections: { holding: true, checkedAt: T0, rules: [], drops: null, publicAddressKnown: false }, use: expect.objectContaining({}), readAt: T0 })
    expect(JSON.stringify(r)).not.toMatch(/29\.0\.0|cpuLoad|usedBytes|hq-box/)
  })

  it('takes nothing from an answer that is not figures', () => {
    expect(parseReading({ ok: false, refusal: { code: 'unknown_operation' } }, T0)).toBeNull()
    expect(parseReading(answer({ ceilings: { ...ceilings, containersAtOnce: 0 } }), T0)).toBeNull()
    expect(parseReading({ ok: true, result: { ceilings } }, T0)).toBeNull()
  })
})

describe('whether an agent may start', () => {
  const at = (now: number[]) => () => now[0]

  it('always, on a site no host service runs', async () => {
    const read = vi.fn()
    expect(await new HostFigures(undefined, read).protectionsProblem()).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })

  it('when the protections hold', async () => {
    const f = new HostFigures('/run/host-figures/figures.sock', async () => answer(), () => T0)
    expect(await f.protectionsProblem()).toBeNull()
    expect(f.machineCeilings()).toEqual(ceilings)
  })

  it('not when they do not hold, and in words that say so', async () => {
    const f = new HostFigures('/s', async () => answer({ holding: false }), () => T0)
    expect(await f.protectionsProblem()).toBe(PROTECTIONS_MISSING)
    expect(PROTECTIONS_MISSING).toContain('agenthix status')
  })

  it('not when the host service does not answer', async () => {
    const f = new HostFigures('/s', async () => { throw new Error('ENOENT') }, () => T0)
    expect(await f.protectionsProblem()).toBe(PROTECTIONS_MISSING)
  })

  it('not when the host service last checked them too long ago', async () => {
    const f = new HostFigures('/s', async () => answer({ checkedAt: '2026-10-14T08:55:00Z' }), () => T0)
    expect(await f.protectionsProblem()).toBe(PROTECTIONS_MISSING)
  })

  it('not on an old reading: one older than the refresh is read again, and a failed read does not count', async () => {
    const now = [T0]
    let up = true
    const f = new HostFigures('/s', async () => { if (!up) throw new Error('gone'); return answer() }, at(now))
    expect(await f.protectionsProblem()).toBeNull()
    up = false
    now[0] = T0 + 10_000
    expect(await f.protectionsProblem()).toBeNull()
    now[0] = T0 + 31_000
    expect(await f.protectionsProblem()).toBe(PROTECTIONS_MISSING)
    expect(f.machineCeilings()).toEqual(ceilings)
  })

  it('tells the engine when the ceilings change', async () => {
    let c = ceilings
    const f = new HostFigures('/s', async () => answer({ ceilings: c }), () => T0)
    const changed = vi.fn()
    f.onChange(changed)
    await f.refresh()
    await f.refresh()
    expect(changed).toHaveBeenCalledTimes(1)
    c = { ...ceilings, containersAtOnce: 2 }
    await f.refresh()
    expect(changed).toHaveBeenCalledTimes(2)
  })
})

describe('whether a live preview may start @SC-1747', () => {
  const figures = (over: Parameters<typeof answer>[0]) => new HostFigures('/run/host-figures/figures.sock', async () => answer(over), () => T0)

  it('needs private-addresses while the machine knows no public address', async () => {
    expect(await figures({ rules: ['private-addresses'] }).livePreviewProtectionsProblem()).toBeNull()
    expect(await figures({ rules: [] }).livePreviewProtectionsProblem()).toMatch(/private-addresses/)
  })

  it('needs public-address too once the machine knows one', async () => {
    expect(await figures({ rules: ['private-addresses'], publicAddressKnown: true }).livePreviewProtectionsProblem()).toMatch(/public-address/)
    expect(await figures({ rules: ['private-addresses', 'public-address'], publicAddressKnown: true }).livePreviewProtectionsProblem()).toBeNull()
  })
})

describe('the figures socket', () => {
  it('is asked figures.read and nothing else, and its last line is the answer', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figures-'))
    const sock = path.join(dir, 'figures.sock')
    const asked: string[] = []
    const server = net.createServer(conn => {
      conn.setEncoding('utf8')
      conn.on('data', (d: string) => {
        asked.push(d)
        conn.end(`${JSON.stringify(answer())}\n`)
      })
    })
    await new Promise<void>(resolve => server.listen(sock, resolve))
    try {
      expect(parseReading(await readFiguresSocket(sock), T0)?.ceilings).toEqual(ceilings)
      expect(asked).toEqual(['{"op":"figures.read"}\n'])
    } finally {
      server.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
