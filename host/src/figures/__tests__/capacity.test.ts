import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { ownerHandler } from '../../owner/dispatch'
import { capacityProblem, memoryText, setCapacity } from '../capacity'
import { DEFAULT_CEILINGS } from '../figures'

const GIB = 1024 ** 3
const office = { memoryBytes: 16 * GIB, processors: 8 }
const four = { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 4 }

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

describe('capacity.set @SC-826', () => {
  it('stores the ceilings for the figures and the site, readable by the owner only', () => {
    const r = setCapacity(m.ctx, four, office)
    expect(r).toEqual({ ceilings: four, before: DEFAULT_CEILINGS })
    const file = m.ctx.state.path('machine.json')
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).ceilings).toEqual(four)
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  })

  it('keeps what else the machine’s record holds', () => {
    m.ctx.state.writeJson(['machine.json'], { name: 'office-server' })
    setCapacity(m.ctx, four, office)
    expect(m.ctx.state.readJson('machine.json')).toEqual({ name: 'office-server', ceilings: four })
  })

  it('refuses containers that could not all fit in the machine’s memory, and stores nothing', () => {
    setCapacity(m.ctx, four, office)
    const six = { ...four, memoryBytesPerContainer: 6 * GIB, containersAtOnce: 6 }
    expect(() => setCapacity(m.ctx, six, office)).toThrow(
      'Not changed: 6 containers at 6 GB could use 36 GB; this machine has 16 GB. Lower either, or keep 4 containers at 4 GB.',
    )
    expect((m.ctx.state.readJson('machine.json') as { ceilings: unknown }).ceilings).toEqual(four)
  })

  it('refuses more processors per container than the machine has', () => {
    expect(capacityProblem({ ...four, cpusPerContainer: 12 }, four, office)).toBe(
      'Not changed: this machine has 8 processors, so an agent container cannot have 12.',
    )
    expect(capacityProblem({ ...four, cpusPerContainer: 8 }, four, office)).toBeNull()
  })

  it('reaches the figures through the owner socket, and refuses ceilings that are not ceilings', async () => {
    const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, unknown>>
    const small = { memoryBytesPerContainer: 256 * 1024 ** 2, cpusPerContainer: 1, processesPerContainer: 256, containersAtOnce: 1 }
    expect(await ask({ op: 'capacity.set', ceilings: small })).toMatchObject({ ok: true, result: { ceilings: small } })
    expect(((await ask({ op: 'figures.read' })).result as { ceilings: unknown }).ceilings).toEqual(small)
    expect(await ask({ op: 'capacity.set', ceilings: { ...small, containersAtOnce: 0 } })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(await ask({ op: 'capacity.set', ceilings: { ...small, containersAtOnce: 1e6, memoryBytesPerContainer: 1024 ** 4 } }))
      .toMatchObject({ ok: false, refusal: { code: 'conflict' } })
  })

  it('writes memory as people read it', () => {
    expect(memoryText(8 * GIB)).toBe('8 GB')
    expect(memoryText(4.5 * GIB)).toBe('4.5 GB')
    expect(memoryText(512 * 1024 ** 2)).toBe('512 MB')
  })
})
