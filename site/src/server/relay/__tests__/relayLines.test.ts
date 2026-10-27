import { describe, it, expect, vi } from 'vitest'
import { FILES_SERVE_METHOD } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))
const { RelayLines } = await import('../relayLines')
type Options = import('../relayLine').RelayLineOptions
type Line = import('../relayLine').RelayLine

type FakeLine = {
  options: Options
  relayId: string
  url: string
  pass: string
  started: boolean
  stopped: boolean
  retired: boolean
  setPass(p: string): void
  start(): void
  stop(): void
  retire(): void
}

function harness(where: { hqWsUrl: string; siteId: string } | null = { hqWsUrl: 'wss://hq.example.com/hq-channel', siteId: 'site-1' }) {
  const made: FakeLine[] = []
  const lines = new RelayLines({
    where: async () => where,
    keys: { get: async () => ({ keys: [] }), refresh: async () => false },
    makeLine: options => {
      const line: FakeLine = {
        options, relayId: options.relayId, url: options.url, pass: options.pass,
        started: false, stopped: false, retired: false,
        setPass(p) { this.pass = p },
        start() { this.started = true },
        stop() { this.stopped = true },
        retire() { this.retired = true },
      }
      made.push(line)
      return line as unknown as Line
    },
  })
  return { lines, made }
}

const assign = (relayId: string, lineUrl = '/relay-line', pass = 'pass-1') => ({ relayId, lineUrl, pass, passExpiresAt: Date.now() + 3_600_000 })

describe('relay.assign @SC-1500 @SC-1565', () => {
  it('opens a line to the address resolved against hq\'s, serving files.serve only', async () => {
    const { lines, made } = harness()
    expect(await lines.assign(assign('relay-1'))).toEqual({ taken: true })
    expect(made).toHaveLength(1)
    expect(made[0].url).toBe('wss://hq.example.com/relay-line')
    expect(made[0].started).toBe(true)
    expect(made[0].options.siteId).toBe('site-1')
    expect(Object.keys(made[0].options.methods)).toEqual([FILES_SERVE_METHOD])
    made[0].options.onUp?.()
    expect(lines.line).toBe(made[0])
  })

  it.each([
    ['no relay id', { ...assign('x'), relayId: '' }],
    ['no pass', { ...assign('x'), pass: '' }],
    ['no expiry', { ...assign('x'), passExpiresAt: 'soon' }],
    ['nothing', null],
  ])('refuses an assignment with %s, and dials nothing', async (_n, params) => {
    const { lines, made } = harness()
    expect((await lines.assign(params)).taken).toBe(false)
    expect(made).toHaveLength(0)
  })

  it('refuses an address that is not one it dials, and dials nothing', async () => {
    const { lines, made } = harness()
    const result = await lines.assign(assign('relay-1', 'file:///etc/passwd'))
    expect(result.taken).toBe(false)
    expect(result.problem).toBeTruthy()
    expect(made).toHaveLength(0)
  })

  it('refuses when no link to hq is stored', async () => {
    const { lines, made } = harness(null)
    expect((await lines.assign(assign('relay-1'))).taken).toBe(false)
    expect(made).toHaveLength(0)
  })

  it('renews the pass on the same relay without a new line', async () => {
    const { lines, made } = harness()
    await lines.assign(assign('relay-1'))
    made[0].options.onUp?.()
    await lines.assign(assign('relay-1', '/relay-line', 'pass-2'))
    expect(made).toHaveLength(1)
    expect(made[0].pass).toBe('pass-2')
    expect(made[0].stopped).toBe(false)
  })

  it('moves to another relay only once the new line is up, then retires the old one', async () => {
    const { lines, made } = harness()
    await lines.assign(assign('relay-1'))
    made[0].options.onUp?.()
    await lines.assign(assign('relay-2', 'wss://files-2.example.com/relay-line'))
    expect(made).toHaveLength(2)
    expect(lines.line).toBe(made[0])
    expect(made[0].retired).toBe(false)
    made[1].options.onUp?.()
    expect(lines.line).toBe(made[1])
    expect(made[0].retired).toBe(true)
  })

  it('a second move before the first came up abandons the first', async () => {
    const { lines, made } = harness()
    await lines.assign(assign('relay-1'))
    made[0].options.onUp?.()
    await lines.assign(assign('relay-2', 'wss://files-2.example.com/relay-line'))
    await lines.assign(assign('relay-3', 'wss://files-3.example.com/relay-line'))
    expect(made[1].stopped).toBe(true)
    made[1].options.onUp?.()
    expect(lines.line).toBe(made[0])
    made[2].options.onUp?.()
    expect(lines.line).toBe(made[2])
    expect(made[0].retired).toBe(true)
  })

  it('stops every line when the link to hq ends', async () => {
    const { lines, made } = harness()
    await lines.assign(assign('relay-1'))
    made[0].options.onUp?.()
    await lines.assign(assign('relay-2', 'wss://files-2.example.com/relay-line'))
    lines.stop()
    expect(made.every(l => l.stopped)).toBe(true)
    expect(lines.line).toBeNull()
  })
})
