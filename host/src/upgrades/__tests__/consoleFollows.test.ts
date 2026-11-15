import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { digestOf, fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { consoleHere, type StoredConsole } from '../../install/console'
import { followHostServiceVersion } from '../consoleFollows'
import { recordPorts } from '../../state/installation'

const REGISTRY = 'ghcr.io/solution84-com'
const tagged = (v: string) => `${REGISTRY}/agenthix-console:${v}`
const pinned = (v: string) => `${REGISTRY}/agenthix-console@${digestOf(tagged(v))}`

let m: FakeMachine
const elsewhere = (version: string): StoredConsole => ({
  version, images: { console: pinned(version) }, hqAddress: 'https://hq.acme.example', onHqMachine: false, installedAt: '2026-11-01T00:00:00.000Z',
})

beforeEach(() => {
  m = fakeMachine()
  recordPorts(m.ctx.state, { console: 7801 })
})
afterEach(() => m.cleanup())

describe('a Fleet Console on a machine of its own follows its host service (#294) @SC-2170', () => {
  it('moves to the host service’s version once that is newer', async () => {
    m.ctx.state.writeJson(['console', 'settings.json'], elsewhere('0.1.9'))
    expect(await followHostServiceVersion(m.ctx)).toBe('The Fleet Console runs 0.2.0.')
    expect(consoleHere(m.ctx)!.settings).toMatchObject({ version: '0.2.0', images: { console: pinned('0.2.0') }, onHqMachine: false })
  })

  it('leaves one on the same version, one beside HQ, and none at all', async () => {
    m.ctx.state.writeJson(['console', 'settings.json'], elsewhere('0.2.0'))
    expect(await followHostServiceVersion(m.ctx)).toBeNull()
    m.ctx.state.writeJson(['console', 'settings.json'], { ...elsewhere('0.1.9'), onHqMachine: true })
    expect(await followHostServiceVersion(m.ctx)).toBeNull()
    expect(consoleHere(m.ctx)!.settings.version).toBe('0.1.9')
  })

  it('leaves it as it was when the new image fails its check', async () => {
    m.ctx.state.writeJson(['console', 'settings.json'], elsewhere('0.1.9'))
    m.signatures.set(tagged('0.2.0'), { kind: 'unsigned' })
    expect(await followHostServiceVersion(m.ctx)).toMatch(/^The Fleet Console stays on 0\.1\.9: /)
    expect(consoleHere(m.ctx)!.settings.version).toBe('0.1.9')
  })
})
