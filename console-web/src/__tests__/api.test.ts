import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, onSignedOut } from '../api/client'
import { csrfToken, forgetCsrfToken } from '../api/csrf'
import { currentSession, signIn, signOut } from '../api/session'

type Call = { url: string; init: RequestInit }

function answer(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

let calls: Call[]
let answers: Response[]

beforeEach(() => {
  calls = []
  answers = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return answers.shift() ?? answer(200, {})
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  forgetCsrfToken()
  sessionStorage.clear()
  localStorage.clear()
})

const headersOf = (c: Call) => c.init.headers as Record<string, string>

describe('the API client @SC-893', () => {
  it('sends JSON to /api on this origin, with the CSRF header once a token is held', async () => {
    answers.push(answer(201, { user: { id: 'u1', name: 'Sam Rivera' }, csrfToken: 'tok-1' }), answer(200, { ok: true }))
    await signIn('sam', 'pw')
    await api('/fleet-admins', { method: 'POST', body: { userId: 'u2' } })

    expect(calls[0].url).toBe('/api/session')
    expect(calls[0].init.credentials).toBe('same-origin')
    expect(headersOf(calls[0])['content-type']).toBe('application/json')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ username: 'sam', password: 'pw' })

    expect(calls[1].url).toBe('/api/fleet-admins')
    expect(headersOf(calls[1])['x-csrf-token']).toBe('tok-1')
    expect(headersOf(calls[1])['content-type']).toBe('application/json')
  })

  it('sends the header on reads too', async () => {
    sessionStorage.setItem('csrfToken', 'tok-2')
    await api('/fleet')
    expect(calls[0].init.method).toBe('GET')
    expect(headersOf(calls[0])['x-csrf-token']).toBe('tok-2')
    expect(calls[0].init.body).toBeUndefined()
  })

  it('keeps the token in sessionStorage only: never localStorage, never a cookie', async () => {
    answers.push(answer(201, { user: { id: 'u1', name: 'Sam Rivera' }, csrfToken: 'tok-3' }))
    await signIn('sam', 'pw')
    expect(sessionStorage.getItem('csrfToken')).toBe('tok-3')
    expect(Object.keys(localStorage)).toEqual([])
    expect(document.cookie).not.toContain('tok-3')
  })

  it('treats a 401 as signed out: the token is forgotten and listeners are told why', async () => {
    sessionStorage.setItem('csrfToken', 'tok-4')
    const told = vi.fn()
    const stop = onSignedOut(told)
    answers.push(answer(401, { error: 'not_fleet_admin', message: 'This account no longer holds the fleet admin role.' }))

    await expect(api('/fleet')).rejects.toMatchObject({ status: 401, code: 'not_fleet_admin' })
    expect(csrfToken()).toBeNull()
    expect(told).toHaveBeenCalledWith({ code: 'not_fleet_admin', message: 'This account no longer holds the fleet admin role.' })
    stop()
  })

  it('does not count a wrong password at sign-in as a session ending', async () => {
    const told = vi.fn()
    const stop = onSignedOut(told)
    answers.push(answer(401, { error: 'wrong', message: 'That username and password do not match an HQ account.' }))
    const err = await signIn('sam', 'nope').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('wrong')
    expect(told).not.toHaveBeenCalled()
    stop()
  })

  it('says so in words when the Fleet Console does not answer at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(api('/status')).rejects.toMatchObject({ status: 0, code: 'unreachable' })
  })
})

describe('the session @SC-893', () => {
  it('asks nothing without a token: the cookie alone opens nothing', async () => {
    expect(await currentSession()).toBeNull()
    expect(calls).toEqual([])
  })

  it('survives a reload while the tab keeps its token', async () => {
    sessionStorage.setItem('csrfToken', 'tok-5')
    answers.push(answer(200, { user: { id: 'u1', name: 'Sam Rivera' } }))
    expect(await currentSession()).toEqual({ id: 'u1', name: 'Sam Rivera' })
  })

  it('signing out ends the session on the server and forgets the token', async () => {
    sessionStorage.setItem('csrfToken', 'tok-6')
    answers.push(answer(204))
    await signOut()
    expect(calls[0].url).toBe('/api/session')
    expect(calls[0].init.method).toBe('DELETE')
    expect(headersOf(calls[0])['x-csrf-token']).toBe('tok-6')
    expect(csrfToken()).toBeNull()
  })
})
