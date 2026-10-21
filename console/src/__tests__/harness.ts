/** A Fleet Console on 127.0.0.1 with a fake hq link, and a client that speaks to it as the screens will. */
import http from 'node:http'
import { EnvelopeReplayGuard } from '@agenthix/core/host-crypto'
import { createConsole, listen } from '../console'
import type { ConsoleContext } from '../http/app'
import { FakeHqLink, tempState } from './fakes'
import type { StateFolder } from '../state/folder'

export const SAM = { id: 'u-sam', name: 'Sam Rivera', username: 'sam', password: 'correct horse battery' }

export type Harness = {
  ctx: ConsoleContext
  link: FakeHqLink
  state: StateFolder
  base: string
  close: () => Promise<void>
  request: (path: string, init?: { method?: string; body?: unknown; cookie?: string; csrf?: string; headers?: Record<string, string> }) =>
    Promise<{ status: number; json: Record<string, unknown>; setCookie: string | null }>
  signIn: () => Promise<{ cookie: string; csrf: string }>
}

export async function startHarness(options: {
  version?: string; commandTimeouts?: { short?: number; long?: number }; hqCode?: string; machineName?: string
  /** A guard that began now, as a real start's does; by default one from long ago. */
  replay?: EnvelopeReplayGuard
} = {}): Promise<Harness> {
  const link = new FakeHqLink()
  link.handle('signIn.check', ({ username, password }) =>
    username === SAM.username && password === SAM.password
      ? { ok: true, user: { id: SAM.id, name: SAM.name, fleetAdmin: true } }
      : username === 'jordan' && password === 'jordans password'
        ? { ok: true, user: { id: 'u-jordan', name: 'Jordan Lee', fleetAdmin: false } }
        : { ok: false })
  link.handle('fleetAdmin.list', () => ({ admins: [{ id: SAM.id, name: SAM.name, username: SAM.username, organisationAdmin: true, since: null }] }))
  const state = tempState()
  const { ctx, app } = await createConsole({
    state, link, machineName: options.machineName ?? 'hq-box', version: options.version ?? '0.2.0',
    replay: options.replay ?? new EnvelopeReplayGuard(0), commandTimeouts: options.commandTimeouts, hqCode: options.hqCode ?? null,
  })
  const server: http.Server = await listen(app, '127.0.0.1', 0)
  await ctx.remoteAccess.start(app, '127.0.0.1')
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const base = `http://127.0.0.1:${port}`

  const request: Harness['request'] = async (path, init = {}) => {
    const headers: Record<string, string> = { ...(init.headers ?? {}) }
    if (init.body !== undefined) headers['content-type'] ??= 'application/json'
    if (init.cookie) headers.cookie = init.cookie
    if (init.csrf) headers['x-csrf-token'] = init.csrf
    const body = init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body)
    if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body))
    // node:http rather than fetch, which will not send a Host header of the test's choosing.
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path, method: init.method ?? 'GET', headers }, res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { text += chunk })
        res.on('end', () => {
          const cookie = res.headers['set-cookie']
          resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : {}, setCookie: cookie ? cookie[0] : null })
        })
      })
      req.on('error', reject)
      req.end(body)
    })
  }

  const signIn = async () => {
    const res = await request('/api/session', { method: 'POST', body: { username: SAM.username, password: SAM.password } })
    if (res.status !== 201 || !res.setCookie) throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.json)}`)
    return { cookie: res.setCookie.split(';')[0], csrf: res.json.csrfToken as string }
  }

  return { ctx, link, state, base, request, signIn, close: async () => {
    await ctx.remoteAccess.stop()
    await new Promise<void>(r => server.close(() => r()))
  } }
}
