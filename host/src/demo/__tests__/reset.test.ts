import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { DEMO_RESET_RETRY_MS, demoResetSchedule, lastDemoReset, resetDemo } from '../reset'
import { ownerHandler } from '../../owner/dispatch'
import { Refusal } from '../../owner/results'

let m: FakeMachine
beforeEach(() => { m = fakeMachine('demo') })
afterEach(() => m.cleanup())

const installDemo = (demo = true) => install(m.ctx, { address: 'https://demo.acme.example', demo }, () => {})
const dockerSince = (from: number) => m.calls.slice(from)

describe('a demo reset @SC-1995', () => {
  it('is refused on an installation that is not a demo, touching nothing', async () => {
    await installDemo(false)
    const from = m.calls.length
    const refused = await resetDemo(m.ctx, true, () => {}).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(Refusal)
    expect(refused).toMatchObject({ code: 'conflict' })
    expect((refused as Refusal).message).toMatch(/not a demo/)
    expect(dockerSince(from)).toEqual([])
  })

  it('is refused over the owner socket too, and before anything is installed', async () => {
    const handle = ownerHandler(m.ctx)
    expect(await handle({ op: 'demo.reset', confirmed: true }, () => {}, undefined as never)).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect(m.calls).toEqual([])
  })

  it('only checks until it is confirmed', async () => {
    await installDemo()
    const from = m.calls.length
    const check = await resetDemo(m.ctx, false, () => {})
    expect(check).toEqual({ address: 'https://demo.acme.example', nextResetAt: '2026-10-14T12:00:00.000Z' })
    expect(dockerSince(from)).toEqual([])
  })

  it('removes the containers, databases, storage and site files, keeps the networks, and starts HQ before its site', async () => {
    await installDemo()
    const data = m.ctx.state.path('site', 'data')
    fs.mkdirSync(`${data}/workspaces/a`, { recursive: true })
    fs.writeFileSync(`${data}/workspaces/a/visitor.txt`, 'left by a visitor')
    m.volumes.push('demo-hq-db-data', 'demo-hq-storage', 'demo-site-db-data', 'demo-host-figures', 'agenthix-hq-db-data')
    const from = m.calls.length
    const r = await resetDemo(m.ctx, true, () => {})
    expect(r).toMatchObject({ nextResetAt: expect.any(String) })
    const calls = dockerSince(from)
    const say = (c: string[]) => c.join(' ')
    const order = calls.map(say)
    expect(order.indexOf('compose -p demo-site -f ' + m.ctx.state.path('site', 'compose.json') + ' stop')).toBeGreaterThanOrEqual(0)
    expect(calls.filter(c => c[0] === 'rm').map(c => c[2]).sort()).toEqual(
      ['demo-hq-db', 'demo-hq-server', 'demo-hq-web', 'demo-relay', 'demo-site-db', 'demo-site-server'])
    expect(calls.filter(c => c[0] === 'volume' && c[1] === 'rm').map(c => c[2])).toEqual(['demo-site-db-data', 'demo-hq-db-data', 'demo-hq-storage'])
    // Another installation's volumes and the host service's own are left alone.
    expect(m.volumes).toEqual(['demo-host-figures', 'agenthix-hq-db-data'])
    expect(calls.some(c => c[0] === 'network' || c.includes('down'))).toBe(false)
    expect(fs.readdirSync(data)).toEqual([])
    const ups = calls.filter(c => c[0] === 'compose' && c.includes('up')).map(c => c[c.indexOf('-p') + 1])
    expect(ups).toEqual(['demo-hq', 'demo-site'])
    expect(order.findIndex(c => c.includes('up'))).toBeGreaterThan(order.findLastIndex(c => c.startsWith('volume rm')))
  })
})

describe('the demo reset schedule @SC-1996', () => {
  it('resets at each 6-hour time, says a failure in the log, and still runs the next one', async () => {
    await installDemo()
    const log: string[] = []
    const schedule = demoResetSchedule(m.ctx, line => log.push(line))
    const resets = () => m.calls.filter(c => c[0] === 'volume' && c[1] === 'rm' && c[2] === 'demo-hq-db-data').length

    await schedule.tick()
    expect(resets()).toBe(0)

    await m.ctx.sleep(3 * 3600_000)
    m.dockerFails.add('volume rm')
    await schedule.tick()
    expect(log.some(l => l.includes('scheduled for 2026-10-14T12:00:00.000Z failed') && l.includes('It will be tried again at 2026-10-14T12:10:00.000Z'))).toBe(true)

    m.dockerFails.clear()
    await schedule.tick()
    expect(resets()).toBe(0)
    await m.ctx.sleep(6 * 3600_000)
    await schedule.tick()
    expect(resets()).toBe(1)
    expect(log.at(-1)).toMatch(/^The demo was reset\. The next reset is at 2026-10-15T00:00:00\.000Z\.$/)
  })

  it('tries a failed scheduled reset again after ten minutes, and again, until one finishes', async () => {
    await installDemo()
    const log: string[] = []
    const schedule = demoResetSchedule(m.ctx, line => log.push(line))
    const attempts = () => m.calls.filter(c => c[0] === 'volume' && c[1] === 'rm' && c[2] === 'demo-site-db-data').length
    expect(DEMO_RESET_RETRY_MS).toBe(10 * 60_000)

    await m.ctx.sleep(3 * 3600_000)
    m.dockerFails.add('volume rm')
    await schedule.tick()
    expect(attempts()).toBe(1)

    await m.ctx.sleep(DEMO_RESET_RETRY_MS - 1_000)
    await schedule.tick()
    expect(attempts()).toBe(1)

    await m.ctx.sleep(1_000)
    await schedule.tick()
    expect(attempts()).toBe(2)
    expect(log.filter(l => l.includes('failed') && l.includes('tried again at 2026-10-14T12:20:00.000Z'))).toHaveLength(1)
    expect(log).toContain("Trying the demo's reset again: the reset scheduled for 2026-10-14T12:00:00.000Z failed.")
    expect(log.some(l => l.startsWith("Trying the demo's reset again failed:"))).toBe(true)
    expect(log.filter(l => l.startsWith('Resetting the demo, as scheduled for'))).toHaveLength(1)

    m.dockerFails.clear()
    await m.ctx.sleep(DEMO_RESET_RETRY_MS)
    await schedule.tick()
    expect(attempts()).toBe(3)
    expect(log.at(-1)).toMatch(/^The demo was reset\. The next reset is at 2026-10-14T18:00:00\.000Z\.$/)
    await m.ctx.sleep(DEMO_RESET_RETRY_MS)
    await schedule.tick()
    expect(attempts()).toBe(3)
  })

  it('never overlaps a reset in progress', async () => {
    await installDemo()
    const schedule = demoResetSchedule(m.ctx, () => {})
    const attempts = () => m.calls.filter(c => c[0] === 'volume' && c[1] === 'rm' && c[2] === 'demo-site-db-data').length
    await m.ctx.sleep(3 * 3600_000)
    // Two ticks at once: the second finds the first still running and does nothing.
    await Promise.all([schedule.tick(), schedule.tick()])
    expect(attempts()).toBe(1)
  })

  it('records each reset that finishes', async () => {
    await installDemo()
    const r = await resetDemo(m.ctx, true, () => {}) as { resetAt: string }
    expect(lastDemoReset(m.ctx)?.toISOString()).toBe(r.resetAt)
  })

  it('catches up at once a scheduled reset missed while the host service was down, even one under 6 hours after the last', async () => {
    await installDemo()
    const resets = () => m.calls.filter(c => c[0] === 'volume' && c[1] === 'rm' && c[2] === 'demo-hq-db-data').length
    // 09:00: recorded as reset now; the next scheduled reset is 12:00.
    demoResetSchedule(m.ctx, () => {})
    expect(lastDemoReset(m.ctx)?.toISOString()).toBe('2026-10-14T09:00:00.000Z')

    // Back at 11:00: no scheduled reset was missed.
    await m.ctx.sleep(2 * 3600_000)
    await demoResetSchedule(m.ctx, () => {}).tick()
    expect(resets()).toBe(0)

    // Back at 13:00: 12:00 was missed, though the last reset is only 4 hours old.
    await m.ctx.sleep(2 * 3600_000)
    const log: string[] = []
    await demoResetSchedule(m.ctx, line => log.push(line)).tick()
    expect(resets()).toBe(1)
    expect(lastDemoReset(m.ctx)?.toISOString()).toBe(m.ctx.now().toISOString())
    expect(log.at(-1)).toMatch(/^The demo was reset\./)
  })

  it('does nothing on an installation that is not a demo', async () => {
    await installDemo(false)
    const from = m.calls.length
    const schedule = demoResetSchedule(m.ctx, () => {})
    await m.ctx.sleep(12 * 3600_000)
    await schedule.tick()
    expect(dockerSince(from)).toEqual([])
  })
})
