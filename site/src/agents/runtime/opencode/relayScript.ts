/**
 * The relay: the small program the site runs in an agent container through one
 * persistent `docker exec -i` (spec §1). Every request to the container's
 * OpenCode server and its event stream pass through it, so a request costs
 * about 1 ms instead of a new `docker exec`'s 31 ms, and the server listens on
 * the container's loopback address alone. It also starts and stops the server,
 * so the server's secrets arrive over the relay's standard input and are never
 * on a command line or in the docker client's environment.
 *
 * Run by the image's node as CommonJS (`node -e`), with `--experimental-sqlite`
 * for the account check. It never logs; what it knows goes back as messages.
 *
 * Messages, one JSON object per line.
 * In:
 *   {op:'start', id, argv, env, port}   stop any server left on the port, remove
 *                                       auth.json, refuse a home holding an
 *                                       account, then start argv with env (and
 *                                       only PATH, locale and proxy settings
 *                                       from the container's own)
 *   {op:'stop', id}                     stop the server, remove auth.json
 *   {op:'request', id, method, path, body?, timeoutMs}
 *   {op:'events', id, path, timeoutMs}  subscribe; `timeoutMs` bounds the connect
 * Out:
 *   {id, ok:true, pid?} | {id, error}   start and stop
 *   {id, status, body} | {id, status:0, error}
 *   {id, event} … then {id, ended:true, error?}
 *   {serverExit:{pid, code, signal, tail}}  the server stopped, for whatever reason
 *
 * When its input closes — the site went away, or stopped it — it stops the
 * server and exits, so a server never outlives the relay that holds its password.
 */
export const RELAY_SOURCE = String.raw`
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { spawn } = require('node:child_process')

const HOME = process.env.HOME || '/home/appuser'
const DATA = path.join(process.env.XDG_DATA_HOME || path.join(HOME, '.local', 'share'), 'opencode')
// The only variables the server takes from the container; everything else is
// given in the start message. Never a secret, never a conversation's tag.
const INHERITED = ['PATH', 'LANG', 'LC_ALL', 'TZ', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy']
let base = ''
let auth = ''
let server = null

const out = (m) => { try { process.stdout.write(JSON.stringify(m) + '\n') } catch {} }

function removeAuthFile() {
  try { fs.rmSync(path.join(DATA, 'auth.json'), { force: true }) } catch {}
}

function staleServers(port) {
  const found = []
  let entries = []
  try { entries = fs.readdirSync('/proc') } catch { return found }
  for (const e of entries) {
    if (!/^\d+$/.test(e) || Number(e) === process.pid) continue
    let argv
    try { argv = fs.readFileSync('/proc/' + e + '/cmdline', 'utf8').split('\0') } catch { continue }
    if (!/(^|\/)opencode[^/]*$/.test(argv[0] || '') || !argv.includes('serve')) continue
    const i = argv.indexOf('--port')
    if (i >= 0 && argv[i + 1] === String(port)) found.push(Number(e))
  }
  return found
}

async function accountCount() {
  const db = path.join(DATA, 'opencode.db')
  if (!fs.existsSync(db)) return 0
  const { DatabaseSync } = await import('node:sqlite')
  const conn = new DatabaseSync(db, { readOnly: true })
  try {
    let n = 0
    const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('account', 'control_account')").all()
    for (const t of tables) n += Number(conn.prepare('SELECT COUNT(*) AS n FROM "' + t.name + '"').get().n)
    return n
  } finally { conn.close() }
}

function waitExit(child, ms) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(true)
    const t = setTimeout(() => resolve(false), ms)
    child.once('exit', () => { clearTimeout(t); resolve(true) })
  })
}

async function stopServer() {
  const child = server
  server = null
  if (child) {
    try { child.kill('SIGTERM') } catch {}
    if (!(await waitExit(child, 5000))) { try { child.kill('SIGKILL') } catch {} ; await waitExit(child, 2000) }
  }
  removeAuthFile()
}

async function start(m) {
  await stopServer()
  for (const pid of staleServers(m.port)) { try { process.kill(pid, 'SIGKILL') } catch {} }
  removeAuthFile()
  const accounts = await accountCount()
  if (accounts > 0) throw new Error('the harness home holds an OpenCode account, so no server is started on it')
  const env = {}
  for (const k of INHERITED) if (process.env[k] !== undefined) env[k] = process.env[k]
  Object.assign(env, m.env)
  delete env.SITE_SESSION
  const child = spawn(m.argv[0], m.argv.slice(1), { env, cwd: m.cwd || '/tmp', stdio: ['ignore', 'ignore', 'pipe'] })
  let tail = ''
  child.stderr.on('data', (d) => { tail = (tail + d.toString()).slice(-2000) })
  child.on('error', (e) => { tail = (tail + String(e)).slice(-2000) })
  child.on('exit', (code, signal) => {
    if (server === child) server = null
    out({ serverExit: { pid: child.pid || null, code, signal, tail } })
  })
  server = child
  base = 'http://127.0.0.1:' + m.port
  auth = 'Basic ' + Buffer.from('opencode:' + (m.env.OPENCODE_SERVER_PASSWORD || '')).toString('base64')
  return child.pid
}

async function request(m) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), m.timeoutMs || 10000)
  try {
    const r = await fetch(base + m.path, {
      method: m.method || 'GET',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: m.body === undefined ? undefined : JSON.stringify(m.body),
      signal: ctl.signal,
    })
    out({ id: m.id, status: r.status, body: await r.text() })
  } catch (e) {
    out({ id: m.id, status: 0, error: String((e && e.cause && e.cause.code) || (e && e.name) || e) })
  } finally { clearTimeout(t) }
}

async function events(m) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), m.timeoutMs || 10000)
  try {
    const r = await fetch(base + m.path, { headers: { authorization: auth, accept: 'text/event-stream' }, signal: ctl.signal })
    clearTimeout(t)
    if (r.status !== 200) { out({ id: m.id, ended: true, error: 'status ' + r.status }); return }
    const dec = new TextDecoder()
    let buf = ''
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true })
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
        if (!data) continue
        let event
        try { event = JSON.parse(data) } catch { continue }
        out({ id: m.id, event })
      }
    }
    out({ id: m.id, ended: true })
  } catch (e) {
    clearTimeout(t)
    out({ id: m.id, ended: true, error: String((e && e.cause && e.cause.code) || (e && e.name) || e) })
  }
}

async function handle(m) {
  if (m.op === 'request') return request(m)
  if (m.op === 'events') return events(m)
  try {
    if (m.op === 'start') out({ id: m.id, ok: true, pid: await start(m) })
    else if (m.op === 'stop') { await stopServer(); out({ id: m.id, ok: true }) }
    else out({ id: m.id, error: 'unknown op' })
  } catch (e) {
    out({ id: m.id, error: String((e && e.message) || e) })
  }
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let m
  try { m = JSON.parse(line) } catch { return }
  if (m && typeof m === 'object') handle(m)
})
rl.on('close', () => { stopServer().finally(() => process.exit(0)) })
process.on('SIGTERM', () => { stopServer().finally(() => process.exit(0)) })
`
