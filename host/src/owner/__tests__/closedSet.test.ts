import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { figuresHandler } from '../../figures/socket'
import { ownerHandler } from '../dispatch'
import { parseOwnerRequest } from '../requests'

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, unknown>>
const refusal = (a: Record<string, unknown>) => (a.ok === false ? (a.refusal as { code: string; message: string }) : null)

describe('the owner socket’s closed set @SC-847', () => {
  it.each([
    ['a shell', { op: 'shell', command: 'rm -rf /' }],
    ['a Docker command', { op: 'docker', args: ['run', '--privileged', 'alpine'] }],
    ['a file read', { op: 'file.read', path: '/state/secrets.json' }],
    ['an exec into hq', { op: 'exec', container: 'agenthix-hq-server', command: ['sh'] }],
    ['an unknown hq command', { op: 'hq.runCommand', command: 'drop-database' }],
  ])('refuses %s, and Docker is never asked', async (_what, data) => {
    const answer = await ask(data)
    expect(refusal(answer)?.code).toBe('unknown_operation')
    expect(m.calls).toEqual([])
  })

  it.each([
    ['nothing', undefined],
    ['a list', [{ op: 'machine.status' }]],
    ['text', 'machine.status'],
    ['a number', 42],
  ])('refuses %s as a request', async (_what, data) => {
    expect(refusal(await ask(data))?.code).toBe('malformed')
  })

  it('refuses a machine operation with a field missing or not valid', async () => {
    expect(refusal(await ask({ op: 'machine.install' }))?.code).toBe('malformed')
    expect(refusal(await ask({ op: 'hq.resetPassword', user: '' }))?.code).toBe('malformed')
    expect(refusal(await ask({ op: 'hq.resetPassword', user: 'sam\nrm' }))?.code).toBe('malformed')
    expect(refusal(await ask({ op: 'hq.resetPassword', user: 'x'.repeat(200) }))?.code).toBe('malformed')
  })

  it('rebuilds what it accepts, so no unexpected field reaches an operation', () => {
    const parsed = parseOwnerRequest({ op: 'hq.resetPassword', user: ' avery ', shell: 'sh', args: ['-c'] })
    expect(parsed).toEqual({ ok: true, request: { op: 'hq.resetPassword', user: 'avery' } })
  })

  it('checks a controller’s operation through core’s parser', async () => {
    expect(refusal(await ask({ op: 'frontDoor.set', on: true }))?.code).toBe('malformed')
    expect(refusal(await ask({ op: 'upgrade', target: 'hq', version: 'latest' }))?.code).toBe('malformed')
  })

  it('refuses in words an operation of the closed set this version does not do yet', async () => {
    const r = refusal(await ask({ op: 'remove', target: 'hq' }))
    expect(r?.code).toBe('failed')
    expect(r?.message).toMatch(/does not do that yet/)
  })

  it('says there is no HQ here for HQ’s commands on a machine without one', async () => {
    const r = refusal(await ask({ op: 'hq.inviteAdmin' }))
    expect(r?.code).toBe('not_installed')
    expect(r?.message).toContain('No HQ here: hq-box runs no HQ.')
  })

  it('answers the machine’s status on a machine with nothing installed', async () => {
    const answer = await ask({ op: 'machine.status' })
    expect(answer).toMatchObject({ ok: true, op: 'machine.status', result: { hq: null, site: null, machine: { name: 'hq-box' } } })
  })
})

describe('the figures socket', () => {
  const figures = figuresHandler(async () => ({ takenAt: 'now' }) as never)
  const askFigures = (data: unknown) => figures(data, () => {}) as Promise<Record<string, unknown>>

  it('answers figures.read', async () => {
    expect(await askFigures({ op: 'figures.read' })).toMatchObject({ ok: true, op: 'figures.read', result: { takenAt: 'now' } })
  })

  it.each([
    { op: 'stop', target: 'hq' },
    { op: 'machine.install', address: 'https://hq.acme.example' },
    { op: 'hq.inviteAdmin' },
    { op: 'logs.read', target: 'hq' },
    { op: 'capacity.set', ceilings: { memoryBytesPerContainer: 1, cpusPerContainer: 1, processesPerContainer: 1, containersAtOnce: 99 } },
    { op: 'figures.read', extra: 'field' },
    'figures.read',
    null,
  ])('refuses everything else, even operations the owner socket takes: %j', async data => {
    expect(refusal(await askFigures(data))?.code).toBe('unknown_operation')
  })
})
