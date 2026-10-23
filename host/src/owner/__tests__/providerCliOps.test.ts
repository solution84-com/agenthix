import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../dispatch'
import { parseOwnerRequest } from '../requests'

// The machine admin's provider commands on the owner socket, asked of hq over its control socket.

const KEY = 'sk-test-fake-0000000000a3f9'
let m: FakeMachine
const ask = (request: unknown) => ownerHandler(m.ctx)(request, () => {})

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  m.cleanup()
})

describe("the machine admin's provider commands @SC-1234", () => {
  it('reads each request field by field', () => {
    expect(parseOwnerRequest({ op: 'hq.provider', action: 'add', vendor: 'anthropic', key: KEY, extra: 1 }))
      .toEqual({ ok: true, request: { op: 'hq.provider', action: 'add', vendor: 'anthropic', key: KEY } })
    expect(parseOwnerRequest({ op: 'hq.provider', action: 'add', vendor: 'cloud', key: '' })).toMatchObject({ ok: false })
    expect(parseOwnerRequest({ op: 'hq.provider', action: 'add', vendor: 'openai', key: 'a\nb' })).toMatchObject({ ok: false })
    expect(parseOwnerRequest({ op: 'hq.provider', action: 'remove' })).toMatchObject({ ok: false })
    expect(parseOwnerRequest({ op: 'hq.provider', action: 'list' })).toEqual({ ok: true, request: { op: 'hq.provider', action: 'list' } })
  })

  it("passes them to hq's control socket, the key never on a command line, and hq's refusals by code", async () => {
    const execs: string[][] = []
    const exec = m.ctx.docker.exec.bind(m.ctx.docker)
    vi.spyOn(m.ctx.docker, 'exec').mockImplementation(async (container, command, input, timeout) => {
      execs.push(command)
      return exec(container, command, input, timeout)
    })
    m.hq.provider = { ok: true, text: 'Added Anthropic (key ending …a3f9). Every organisation admin has been told.', data: {} }
    expect(await ask({ op: 'hq.provider', action: 'add', vendor: 'anthropic', key: KEY }))
      .toMatchObject({ ok: true, result: { text: expect.stringContaining('…a3f9') } })
    expect(execs.flat().join(' ')).not.toContain(KEY)
    m.hq.provider = { ok: false, error: 'Anthropic is the only model provider.', code: 'conflict' }
    expect(await ask({ op: 'hq.provider', action: 'remove', which: 'anthropic' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
  })
})
