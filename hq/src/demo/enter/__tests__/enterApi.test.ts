import { afterEach, describe, expect, it, vi } from 'vitest'

const entered = vi.hoisted(() => ({ calls: [] as string[], answer: { ok: true, sessionId: 's1' } as unknown }))
vi.mock('../enterDemo', () => ({
  enterDemo: async (ip: string) => { entered.calls.push(ip); return entered.answer },
}))

import { enterDemoHandler } from '../enterApi'
import { setDemoModeForTests } from '../../demoMode'

type Answer = { status: number; body: unknown }

async function press(ip = '203.0.113.9'): Promise<Answer> {
  const answer: Answer = { status: 200, body: null }
  const res = {
    status(code: number) { answer.status = code; return this },
    json(body: unknown) { answer.body = body; return this },
  }
  // The handler's types are Wasp's; only these parts are used.
  await (enterDemoHandler as unknown as (req: unknown, res: unknown, ctx: unknown) => Promise<unknown>)({ ip }, res, {})
  return answer
}

afterEach(() => {
  setDemoModeForTests(null)
  entered.calls = []
})

describe('POST /api/demo/enter', () => {
  it('is not there with the setting off: 404, and no account is made @SC-1949 @SC-1979', async () => {
    setDemoModeForTests(false)
    expect(await press()).toEqual({ status: 404, body: { error: 'Not found' } })
    expect(entered.calls).toEqual([])
  })

  it('in demo mode, makes the visitor for the caller\'s address and hands back the session @SC-1949', async () => {
    setDemoModeForTests(true)
    entered.answer = { ok: true, sessionId: 's1' }
    expect(await press('198.51.100.4')).toEqual({ status: 200, body: { sessionId: 's1' } })
    expect(entered.calls).toEqual(['198.51.100.4'])
  })

  it('says the demo is full above a cap @SC-1950', async () => {
    setDemoModeForTests(true)
    entered.answer = { ok: false, status: 429, error: 'The demo is full right now.', reason: 'full' }
    expect(await press()).toEqual({ status: 429, body: { error: 'The demo is full right now.', reason: 'full' } })
  })
})
