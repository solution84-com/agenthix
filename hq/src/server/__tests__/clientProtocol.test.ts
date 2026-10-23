import { describe, expect, it } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { CLIENT_PROTOCOL_REFUSED } from '@agenthix/core'
import { clientProtocolGuard, clientProtocolSocketGuard, describeClient, type HandshakeSocket } from '../clientProtocol'

type Answer = { status: number | null; headers: Record<string, string>; body: unknown; passed: boolean; locals: Record<string, unknown> }

function request(headers: Record<string, string>, at: { method: string; url: string } = { method: 'POST', url: '/operations/get-agents' }): Answer {
  const answer: Answer = { status: null, headers: {}, body: null, passed: false, locals: {} }
  const res = {
    locals: answer.locals,
    status(code: number) { answer.status = code; return this },
    set(k: string, v: string) { answer.headers[k] = v; return this },
    json(body: unknown) { answer.body = body; return this },
  } as unknown as Response
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  clientProtocolGuard({ method: at.method, originalUrl: at.url, path: at.url.split('?')[0], headers: lower } as Request, res, (() => { answer.passed = true }) as NextFunction)
  return answer
}

function handshake(auth: Record<string, unknown>, headers: Record<string, string> = {}) {
  const socket: HandshakeSocket = { handshake: { auth, headers }, data: { user: { id: 'u1' } } }
  let error: (Error & { data?: unknown }) | undefined
  let passed = false
  clientProtocolSocketGuard(socket, (err) => { if (err) error = err; else passed = true })
  return { socket, error, passed }
}

const TWO_AHEAD = {
  error: 'This app speaks protocol 3.0 and HQ speaks 1.2, too far apart to work together: upgrade HQ.',
  reason: 'too_far_apart', hqVersion: '1.2', clientVersion: '3.0', upgrade: 'hq',
}

describe('the client protocol over HTTP @SC-1138', () => {
  it('serves a request that states no version: a browser, hq\'s own pages, an app from before', () => {
    const answer = request({ 'User-Agent': 'Mozilla/5.0' })
    expect(answer).toMatchObject({ passed: true, status: null })
    expect(answer.locals.client).toBeUndefined()
  })

  it.each(['1.0', '1.9', '2.0', '2.7'])('serves an app on %s (hq on 1.2: the same major or one ahead)', (version) => {
    const answer = request({ 'X-Client-Protocol-Version': version, 'User-Agent': 'mobile/1.2.0' })
    expect(answer.passed).toBe(true)
    expect(answer.locals.client).toEqual({ version, userAgent: 'mobile/1.2.0' })
    expect(describeClient(answer.locals.client as never)).toBe(`client ${version} mobile/1.2.0`)
  })

  it('refuses an app two majors ahead with 426, naming HQ as the side to update', () => {
    expect(request({ 'X-Client-Protocol-Version': '3.0', 'User-Agent': 'mobile/9.0.0' })).toMatchObject({
      passed: false, status: 426, headers: { 'X-Client-Protocol-Version': '1.2' }, body: TWO_AHEAD,
    })
  })

  it("serves public-identity to an app it refuses everywhere else, so the app can name HQ's release and organisation", () => {
    const tooFar = { 'X-Client-Protocol-Version': '3.0', 'User-Agent': 'mobile/9.0.0' }
    expect(request(tooFar, { method: 'GET', url: '/api/org/public-identity' })).toMatchObject({ passed: true, status: null })
    expect(request(tooFar, { method: 'GET', url: '/api/org/public-identity?fresh=1' })).toMatchObject({ passed: true, status: null })
    expect(request(tooFar, { method: 'POST', url: '/api/org/public-identity' })).toMatchObject({ passed: false, status: 426 })
    expect(request(tooFar, { method: 'GET', url: '/api/org/public-identity/more' })).toMatchObject({ passed: false, status: 426 })
    expect(request(tooFar, { method: 'GET', url: '/api/org/identity' })).toMatchObject({ passed: false, status: 426 })
  })

  it('refuses a version it cannot read with 426, naming the app as the side to update', () => {
    expect(request({ 'X-Client-Protocol-Version': 'one' })).toMatchObject({
      passed: false, status: 426,
      body: {
        error: 'This app stated the protocol version "one", which is not one; HQ speaks 1.2.',
        reason: 'malformed', hqVersion: '1.2', clientVersion: 'one', upgrade: 'client',
      },
    })
  })

  it('takes nothing from User-Agent: a party name alone changes no answer', () => {
    expect(request({ 'User-Agent': 'mobile/0.0.1' }).passed).toBe(true)
    expect(request({ 'X-Client-Protocol-Version': '3.0', 'User-Agent': 'hq/1.0.0' }).status).toBe(426)
    expect(describeClient(undefined)).toBe('')
  })
})

describe('the client protocol in the socket handshake @SC-1139', () => {
  it('serves a handshake that states no version, keeping what Wasp put on the socket', () => {
    const { socket, passed } = handshake({ sessionId: 's' })
    expect(passed).toBe(true)
    expect(socket.data).toEqual({ user: { id: 'u1' } })
  })

  it.each(['1.0', '2.3'])('serves an app on %s and keeps what it stated', (version) => {
    const { socket, passed } = handshake({ clientProtocolVersion: version }, { 'user-agent': 'mobile/1.2.0' })
    expect(passed).toBe(true)
    expect(socket.data).toEqual({ user: { id: 'u1' }, client: { version, userAgent: 'mobile/1.2.0' } })
  })

  it('refuses an app two majors ahead, with the same reason as the 426', () => {
    const { error, passed } = handshake({ clientProtocolVersion: '3.0' })
    expect(passed).toBe(false)
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe(CLIENT_PROTOCOL_REFUSED)
    expect(error?.data).toEqual(TWO_AHEAD)
  })

  it('reads the HTTP header when the handshake\'s auth has no version', () => {
    expect(handshake({}, { 'x-client-protocol-version': '3.0' }).error?.data).toEqual(TWO_AHEAD)
  })

  it.each([['one', 'one'], [1, '1'], [{ v: 1 }, '[object Object]']])('refuses an unreadable version (%j)', (field, shown) => {
    expect(handshake({ clientProtocolVersion: field }).error?.data).toMatchObject({ reason: 'malformed', clientVersion: shown, upgrade: 'client' })
  })
})
