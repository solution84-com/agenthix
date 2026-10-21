import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { holdWhileReadOnly, readOnlyGuard, setReadOnly } from '../readOnly'
import { WASP_QUERIES } from '../readOnlyQueries'

type Answer = { status: number | null; body: unknown; passed: boolean }

function call(method: string, url: string): Answer {
  const answer: Answer = { status: null, body: null, passed: false }
  const res = {
    status(code: number) { answer.status = code; return this },
    set() { return this },
    json(body: unknown) { answer.body = body; return this },
  } as unknown as Response
  readOnlyGuard({ method, originalUrl: url } as Request, res, (() => { answer.passed = true }) as NextFunction)
  return answer
}

const MOVING = { to: 'new-server', since: '2026-10-14T22:00:00.000Z' }

afterEach(() => setReadOnly(null))

describe('hq read-only while it moves @SC-934', () => {
  it('refuses an action with one sentence and still answers a query', () => {
    setReadOnly(MOVING)
    expect(call('POST', '/operations/create-agent')).toEqual({
      status: 503, passed: false,
      body: { message: 'HQ is moving to new-server; changes are paused until the move ends.', readOnly: true },
    })
    expect(call('POST', '/operations/get-agents').passed).toBe(true)
    expect(call('POST', '/operations/get-fleet-activity?x=1').passed).toBe(true)
    // An operation the list does not know is refused: a query left out fails closed.
    expect(call('POST', '/operations/made-up-later').status).toBe(503)
  })

  it('answers reads, sign-in and the move check, and refuses every other write', () => {
    setReadOnly({ to: null, since: MOVING.since })
    for (const [method, url] of [['GET', '/api/v1/anything'], ['HEAD', '/health'], ['OPTIONS', '/operations/create-agent'],
      ['POST', '/auth/username/login'], ['POST', '/api/v1/move-check'], ['POST', '/api/v1/move-check/proof']]) {
      expect(call(method, url).passed, `${method} ${url}`).toBe(true)
    }
    for (const [method, url] of [['POST', '/api/v1/data'], ['POST', '/mcp'], ['POST', '/api/auth/change-password'],
      ['POST', '/auth/username/signup'], ['PUT', '/api/v1/anything'], ['DELETE', '/api/v1/anything']]) {
      expect(call(method, url), `${method} ${url}`).toMatchObject({ status: 503, body: { message: 'HQ is moving; changes are paused until the move ends.' } })
    }
  })

  it('lets everything through when it is off', () => {
    expect(call('POST', '/operations/create-agent').passed).toBe(true)
    expect(call('POST', '/api/v1/data').passed).toBe(true)
  })

  it("holds a site's events while on, and hands them on in order when it ends without a move", async () => {
    const handled: number[] = []
    expect(holdWhileReadOnly(async () => { handled.push(0) })).toBe(false)
    setReadOnly(MOVING)
    for (const n of [1, 2, 3]) expect(holdWhileReadOnly(async () => { handled.push(n) })).toBe(true)
    expect(handled).toEqual([])
    setReadOnly(null)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(handled).toEqual([1, 2, 3])
  })

  it('knows every query Wasp generated, and only queries', () => {
    const generated = path.resolve(__dirname, '../../../.wasp/out/server/src')
    const names = (dir: string) => fs.readdirSync(path.join(generated, dir)).filter(f => f.endsWith('.ts')).map(f => f.slice(0, -3)).sort()
    expect([...WASP_QUERIES].sort()).toEqual(names('queries'))
    expect(names('actions').filter(a => WASP_QUERIES.includes(a))).toEqual([])
  })
})
