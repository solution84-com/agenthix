import { describe, expect, it } from 'vitest'
import { REMOTE_ACCESS_DEFAULT_MS, REMOTE_ACCESS_MAX_MS } from '@agenthix/core'
import { parseCommand } from '../commands'
import { cloudCommand, type CloudCommand } from '../cloud'
import { helpText } from '../messages'

const flat = (s: string) => s.replace(/\s+/g, ' ')

describe('the Cloud commands, read @SC-1067', () => {
  it('reads cloud connect and disconnect, and nothing more after them', () => {
    expect(parseCommand(['cloud', 'connect'])).toEqual({ kind: 'cloudConnect' })
    expect(parseCommand(['cloud', 'disconnect'])).toEqual({ kind: 'cloudDisconnect', yes: false })
    expect(parseCommand(['cloud', 'disconnect', '--yes'])).toEqual({ kind: 'cloudDisconnect', yes: true })
    expect(parseCommand(['cloud', 'connect', 'now'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['cloud', 'disconnect', 'now'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['cloud'])).toMatchObject({ kind: 'usage' })
  })

  it('reads remote access: 2 hours unless --for says, 8 at most', () => {
    expect(parseCommand(['console', 'remote', 'on'])).toEqual({ kind: 'remoteOn', forMs: REMOTE_ACCESS_DEFAULT_MS })
    expect(parseCommand(['console', 'remote', 'on', '--for', '90m'])).toEqual({ kind: 'remoteOn', forMs: 90 * 60_000 })
    expect(parseCommand(['console', 'remote', 'on', '--for', '8h'])).toEqual({ kind: 'remoteOn', forMs: REMOTE_ACCESS_MAX_MS })
    expect(parseCommand(['console', 'remote', 'off'])).toEqual({ kind: 'remoteOff' })
  })

  it('checks the arguments', () => {
    for (const argv of [
      ['console', 'remote'], ['console', 'remote', 'maybe'], ['console', 'remote', 'on', '--for'], ['console', 'remote', 'on', '--for', '9h'],
      ['console', 'remote', 'on', '--for', 'soon'], ['console', 'remote', 'on', 'extra'], ['console', 'remote', 'off', '--for', '1h'],
      ['console', 'reset-code'], ['console', 'reset-code', 'a', 'b'],
    ]) expect(parseCommand(argv)).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['console', 'reset-code', 'sam'])).toEqual({ kind: 'resetCode', user: 'sam', yes: false })
    expect(parseCommand(['console', 'reset-code', '--yes', 'sam'])).toEqual({ kind: 'resetCode', user: 'sam', yes: true })
  })

  it('leaves the console commands that are done as they were', () => {
    expect(parseCommand(['console', 'disconnect'])).toMatchObject({ kind: 'consoleDisconnect' })
  })

  it('lists them in help, under Agenthix Cloud and the Fleet Console', () => {
    const help = flat(helpText('0.2.0', undefined))
    expect(help).toContain('Agenthix Cloud cloud connect')
    expect(help).toContain('console remote on | off [--for <time>]')
    expect(help).toContain('console reset-code [--yes] <user>')
    expect(flat(helpText('0.2.0', 'console remote'))).toContain('Cloud turns it on')
  })
})

const CONNECTING = {
  userCode: 'WDJB-MJHT', verificationUri: 'https://cloud.example.com/connect',
  verificationUriComplete: 'https://cloud.example.com/connect?user_code=WDJB-MJHT', expiresAt: '2026-01-01T00:15:00.000Z',
}
const CONNECTED = { cloudOrganisationId: 'org_42', name: 'Acme Robotics', connectedAt: '2026-01-01T00:01:00.000Z' }
const NOTHING = { connection: null, connecting: null, lastAttempt: null, runByCloud: false }

/** A fake owner socket: the machine's status, then answers by operation, each a list taken in turn. */
function machine(over: object, answers: Record<string, unknown[]> = {}) {
  const asked: unknown[] = []
  const call = async (request: unknown) => {
    asked.push(request)
    const r = request as { op: string; action?: string }
    if (r.op === 'machine.status') return { machine: { name: 'office' }, ...over } as never
    const key = r.action ? `${r.op}:${r.action}` : r.op
    const list = answers[key] ?? []
    return (list.length > 1 ? list.shift() : list[0]) as never
  }
  return { call, asked }
}

async function run(command: CloudCommand, m: ReturnType<typeof machine>, confirm = true) {
  let out = ''
  let err = ''
  let clock = Date.parse('2026-01-01T00:00:00.000Z')
  const code = await cloudCommand(command, m.call, {
    out: t => { out += t }, err: t => { err += t }, confirm: async () => confirm,
    pause: async ms => { clock += ms }, now: () => clock,
  })
  return { code, out: flat(out), err: flat(err) }
}

const HQ = { hq: { address: 'https://hq.acme.example' } }
const CONSOLE = { hq: { address: 'x' }, management: { consoleHere: { containers: 'running' } } }

describe('cloud connect and disconnect, from HQ\'s machine @SC-1126', () => {
  it('connect prints the code and the page, waits for the approval, and says it is connected', async () => {
    const m = machine(HQ, {
      'hq.cloudConnection:state': [{ state: NOTHING }, { state: { ...NOTHING, connecting: CONNECTING } }, { state: { ...NOTHING, connection: CONNECTED } }],
      'hq.cloudConnection:connect': [{ connecting: CONNECTING }],
    })
    const r = await run({ kind: 'cloudConnect' }, m)
    expect(r.code).toBe(0)
    expect(r.out).toContain('WDJB-MJHT')
    expect(r.out).toContain(CONNECTING.verificationUriComplete)
    expect(r.out).toContain('Connected to Agenthix Cloud as Acme Robotics')
  })

  it('connect says how a request ended: refused, or not approved in time', async () => {
    const refused = machine(HQ, {
      'hq.cloudConnection:state': [{ state: NOTHING }, { state: { ...NOTHING, lastAttempt: 'refused' } }],
      'hq.cloudConnection:connect': [{ connecting: CONNECTING }],
    })
    expect(await run({ kind: 'cloudConnect' }, refused)).toMatchObject({ code: 1, err: expect.stringContaining('refused on Agenthix Cloud') })
    const lapsed = machine(HQ, {
      'hq.cloudConnection:state': [{ state: NOTHING }, { state: { ...NOTHING, connecting: CONNECTING } }],
      'hq.cloudConnection:connect': [{ connecting: CONNECTING }],
    })
    expect(await run({ kind: 'cloudConnect' }, lapsed)).toMatchObject({ code: 1, err: expect.stringContaining('not approved in time') })
  })

  it('connect asks nothing when HQ is connected already, or Cloud runs it', async () => {
    const already = machine(HQ, { 'hq.cloudConnection:state': [{ state: { ...NOTHING, connection: CONNECTED } }] })
    expect((await run({ kind: 'cloudConnect' }, already)).out).toContain('connected to Agenthix Cloud already')
    const onCloud = machine(HQ, { 'hq.cloudConnection:state': [{ state: { ...NOTHING, runByCloud: true } }] })
    expect((await run({ kind: 'cloudConnect' }, onCloud)).out).toContain('connects it itself')
    for (const m of [already, onCloud]) expect(m.asked).not.toContainEqual({ op: 'hq.cloudConnection', action: 'connect' })
  })

  it('disconnect asks first, and refuses on a machine Cloud runs', async () => {
    const connected = () => machine(HQ, { 'hq.cloudConnection:state': [{ state: { ...NOTHING, connection: CONNECTED } }], 'hq.cloudConnection:disconnect': [{ disconnected: true }] })
    const declined = connected()
    expect((await run({ kind: 'cloudDisconnect', yes: false }, declined, false)).code).toBe(1)
    expect(declined.asked).not.toContainEqual({ op: 'hq.cloudConnection', action: 'disconnect' })
    const agreed = connected()
    expect(await run({ kind: 'cloudDisconnect', yes: false }, agreed)).toMatchObject({ code: 0, out: expect.stringContaining('Disconnected') })
    expect(agreed.asked).toContainEqual({ op: 'hq.cloudConnection', action: 'disconnect' })
    const onCloud = machine(HQ, { 'hq.cloudConnection:state': [{ state: { ...NOTHING, connection: CONNECTED, runByCloud: true } }] })
    expect(await run({ kind: 'cloudDisconnect', yes: true }, onCloud)).toMatchObject({ code: 1, err: expect.stringContaining('stays while Cloud runs it') })
  })

  it('refuses the connection on a machine that runs no HQ', async () => {
    expect((await run({ kind: 'cloudDisconnect', yes: true }, machine({ hq: null }))).err).toContain('No HQ here')
  })
})

describe('remote access and the authenticator code, on the Fleet Console\'s machine @SC-1126', () => {
  it('remote on says Cloud turns it on and changes nothing; off turns it off', async () => {
    const m = machine(CONSOLE, { 'console.remoteOff': [{ on: false }] })
    expect(await run({ kind: 'remoteOn', forMs: 1 }, m)).toMatchObject({ code: 1, err: expect.stringContaining('turned on from Agenthix Cloud') })
    expect(m.asked).toEqual([{ op: 'machine.status' }])
    expect(await run({ kind: 'remoteOff' }, m)).toMatchObject({ code: 0, out: expect.stringContaining('is off') })
    expect(m.asked).toContainEqual({ op: 'console.remoteOff' })
  })

  it('reset-code asks first, then forgets the code', async () => {
    const m = machine(CONSOLE, { 'console.resetCode': [{ reset: true }] })
    expect((await run({ kind: 'resetCode', user: 'sam', yes: false }, m, false)).code).toBe(1)
    expect(m.asked).not.toContainEqual({ op: 'console.resetCode', user: 'sam' })
    expect(await run({ kind: 'resetCode', user: 'sam', yes: false }, m)).toMatchObject({ code: 0, out: expect.stringContaining("sam's authenticator code was forgotten") })
  })

  it('refuses where no Fleet Console runs, and a reset without HQ beside it', async () => {
    expect((await run({ kind: 'remoteOff' }, machine({}))).err).toContain('No Fleet Console runs on office')
    expect((await run({ kind: 'resetCode', user: 'sam', yes: true }, machine({ management: { consoleHere: { containers: 'running' } } }))).err).toContain('No HQ here')
  })
})
