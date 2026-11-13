// A stack of its own for one e2e run: hq (from its build, hq-built.mjs), a site paired with it and hq's relay, on free
// ports, with test databases named for the run and dropped after it. Never the development ports or databases, so it
// runs beside a developer's own servers and beside other runs. The cross-app suite boots the same way
// (tests/cross-app/harness/apps.ts); this is its plain-Node counterpart for the browser tests.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { markNeverIndexed } from './machine.mjs'
import { DB_CONNECTION_LIMIT } from './steps.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HQ = join(ROOT, 'hq')
const SITE = join(ROOT, 'site')
const RELAY = join(ROOT, 'relay')

const RUN_DATABASE = /^agenthix(_site)?_e[a-z0-9]{6,16}_test$/

/** The run's two database names. `runId` is lowercase letters and digits only, since it reaches DDL. */
export function stackDatabaseNames(runId) {
  if (!/^[a-z0-9]{6,16}$/.test(runId)) throw new Error(`refusing an e2e run id "${runId}"`)
  return { hq: `agenthix_e${runId}_test`, site: `agenthix_site_e${runId}_test` }
}

export function dropStatement(name) {
  if (!RUN_DATABASE.test(name)) throw new Error(`refusing to drop "${name}": it is not an e2e run's database`)
  return `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`
}

export function withDatabase(url, name, connectionLimit) {
  const u = new URL(url)
  u.hostname = u.hostname === 'localhost' ? '127.0.0.1' : u.hostname
  u.pathname = `/${name}`
  if (connectionLimit) u.searchParams.set('connection_limit', String(connectionLimit))
  return u.toString()
}

/** The run's own test database server, else DATABASE_URL from the environment, else the app's .env.server. */
export function baseDatabaseUrl(appRoot, env = process.env) {
  if (env.TEST_DB_SERVER_URL) return env.TEST_DB_SERVER_URL
  if (env.DATABASE_URL) return env.DATABASE_URL
  const file = join(appRoot, '.env.server')
  if (!existsSync(file)) throw new Error(`no DATABASE_URL in the environment or ${file}`)
  const line = readFileSync(file, 'utf8').split('\n').find((l) => l.trim().startsWith('DATABASE_URL='))
  if (!line) throw new Error(`no DATABASE_URL in ${file}`)
  return line.trim().slice('DATABASE_URL='.length).replace(/^"|"$/g, '')
}

/** `count` distinct free ports, all held until every one is chosen. */
export async function freePorts(count) {
  const held = []
  try {
    for (let i = 0; i < count; i++) {
      held.push(await new Promise((ok, fail) => {
        const server = net.createServer().once('error', fail)
        server.listen(0, '127.0.0.1', () => ok(server))
      }))
    }
    return held.map((s) => s.address().port)
  } finally {
    await Promise.all(held.map((s) => new Promise((ok) => s.close(ok))))
  }
}

function prismaFor(appRoot, url) {
  const { PrismaClient } = createRequire(join(appRoot, 'package.json'))('@prisma/client')
  return new PrismaClient({ datasources: { db: { url } } })
}

/** Creates and migrates a run's database through the app's own wrapper, as the cross-app harness does. */
function provision(appRoot, url, name) {
  const r = spawnSync('node', ['scripts/test/with-test-db.mjs', 'node', '-e', 'process.exit(0)'], {
    cwd: appRoot, encoding: 'utf8', env: { ...process.env, DATABASE_URL: url, TEST_DB_NAME: name },
  })
  if (r.status !== 0) throw new Error(`the database ${name} was not prepared: ${r.stderr || r.stdout}`)
}

function startApp(stack, name, cwd, command, env) {
  const log = join(stack.dir, `${name}.log`)
  const out = openSync(log, 'a')
  const child = spawn(command[0], command.slice(1), { cwd, env, detached: true, stdio: ['ignore', out, out] })
  closeSync(out)
  child.on('error', (err) => console.error(`[stack] ${name} did not start: ${err.message}`))
  stack.children.push({ name, child, log })
}

async function until(check, what, timeoutMs, stack) {
  const end = Date.now() + timeoutMs
  for (;;) {
    if (await check().catch(() => false)) return
    if (Date.now() > end) throw new Error(`${what} within ${timeoutMs / 1000} s; logs in ${stack.dir}`)
    await new Promise((r) => setTimeout(r, 2000))
  }
}

const answers = async (url) => (await fetch(url, { signal: AbortSignal.timeout(5000) })).ok

/**
 * Boots the stack and waits until hq, its web page, the relay and the site answer and hq holds the site ONLINE.
 * `dir` holds the stack's logs. What the apps keep (the site's SITE_ROOT, hq's storage, the control sockets) goes in a
 * short folder of its own under the system's temporary folder: a Unix socket's path may not be longer than 103 bytes.
 */
export async function startStack({ dir, env = process.env, onStart = () => {} }) {
  const runId = randomBytes(5).toString('hex')
  const names = stackDatabaseNames(runId)
  const urls = {
    hq: withDatabase(baseDatabaseUrl(HQ, env), names.hq, DB_CONNECTION_LIMIT),
    site: withDatabase(baseDatabaseUrl(SITE, env), names.site, DB_CONNECTION_LIMIT),
  }
  const [web, server, site, relay] = await freePorts(4)
  const stack = { dir, names, urls, ports: { web, server, site, relay }, children: [] }
  stack.clientUrl = `http://localhost:${web}`
  stack.serverUrl = `http://localhost:${server}`
  mkdirSync(dir, { recursive: true })
  stack.runtime = mkdtempSync(join(tmpdir(), 'agenthix-e2e-'))
  markNeverIndexed(stack.runtime)
  stack.siteRoot = join(stack.runtime, 'site')
  stack.hqStorage = join(stack.runtime, 'hq-storage')
  mkdirSync(stack.siteRoot, { recursive: true })
  mkdirSync(stack.hqStorage, { recursive: true })
  onStart(stack)

  provision(HQ, urls.hq, names.hq)
  provision(SITE, urls.site, names.site)

  const pairing = randomBytes(32).toString('hex')
  const relaySecret = randomBytes(32).toString('hex')
  const base = { ...env }
  for (const key of ['DATABASE_URL', 'TEST_DB_NAME', 'PORT']) delete base[key]
  startApp(stack, 'relay', RELAY, ['node', '--enable-source-maps', 'dist/relay.js'], {
    ...base, RELAY_HQ_ADDRESS: stack.serverUrl, HQ_RELAY_SECRET: relaySecret, HQ_URL: stack.clientUrl, FILES_ORIGIN: '',
    RELAY_PORT: String(relay), RELAY_LISTEN_HOST: '127.0.0.1', HQ_UPLOADS_ROOT: stack.hqStorage,
  })
  startApp(stack, 'hq', HQ, ['node', 'scripts/test/with-test-db.mjs', 'node', join(ROOT, 'scripts/regression/hq-built.mjs')], {
    ...base, DATABASE_URL: urls.hq, TEST_DB_NAME: names.hq, HQ_STORAGE_ROOT: stack.hqStorage, SITE_ROOT: stack.siteRoot,
    HQ_PAIRING_SECRET: pairing, HQ_CONTROL_SOCKET: join(stack.runtime, 'hq.sock'),
    PORT: String(server), WASP_SERVER_URL: stack.serverUrl, WASP_WEB_CLIENT_URL: stack.clientUrl,
    HQ_WEB_PORT: String(web), HQ_SERVER_PORT: String(server), REACT_APP_API_URL: stack.serverUrl,
    HQ_RELAY_SECRET: relaySecret, HQ_RELAY_LINE_URL: `ws://127.0.0.1:${relay}/relay-line`, RELAY_SERVER_PORT: String(relay),
    FILES_ORIGIN: '',
  })
  startApp(stack, 'site', SITE, ['node', 'scripts/test/with-test-db.mjs', 'npm', 'run', 'dev'], {
    ...base, DATABASE_URL: urls.site, TEST_DB_NAME: names.site, PORT: String(site), SITE_ROOT: stack.siteRoot,
    HQ_URL: stack.serverUrl, HQ_PAIRING_SECRET: pairing,
  })

  const hqDb = prismaFor(HQ, urls.hq)
  try {
    await until(async () => (await (await fetch(`${stack.serverUrl}/health`)).json())?.status === 'ok', 'hq did not answer', 360_000, stack)
    await until(() => answers(stack.clientUrl), "hq's web page did not answer", 120_000, stack)
    await until(async () => readFileSync(join(dir, 'hq.log'), 'utf8').includes('[hq-built] the web page is warm'),
      "hq's web page did not finish warming", 300_000, stack)
    await until(() => answers(`http://127.0.0.1:${relay}/health`), 'the relay did not answer', 60_000, stack)
    await until(() => answers(`http://localhost:${site}/health`), 'the site did not answer', 180_000, stack)
    await until(async () => (await hqDb.executionSite.count({ where: { isDefault: true, status: 'ONLINE' } })) > 0,
      'hq did not hold its site ONLINE', 180_000, stack)
  } finally {
    await hqDb.$disconnect()
  }
  return stack
}

function alive(pid) {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

/** The site's id, for removing the containers and networks it labelled with it. */
async function siteIds(stack) {
  const db = prismaFor(SITE, stack.urls.site)
  try {
    return (await db.siteConfig.findMany({ select: { siteId: true } })).map((r) => r.siteId)
  } catch {
    return []
  } finally {
    await db.$disconnect()
  }
}

function removeSiteLeftovers(ids) {
  const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 })
  for (const kind of [['ps', '-a'], ['network', 'ls']]) {
    const r = docker([...kind, '--no-trunc', '--format', '{{.ID}}\t{{.Labels}}'])
    if (r.status !== 0) return
    const found = r.stdout.split('\n').filter((line) => line.split('\t')[1]?.split(',')
      .some((l) => { const eq = l.indexOf('='); return eq > 0 && l.slice(0, eq).endsWith('.site') && ids.includes(l.slice(eq + 1)) }))
      .map((line) => line.split('\t')[0])
    if (found.length) docker(kind[0] === 'ps' ? ['rm', '-f', ...found] : ['network', 'rm', ...found])
  }
}

/** Stops every process of the stack, removes what its site made in Docker, and drops its databases. */
export async function stopStack(stack) {
  const ids = await siteIds(stack)
  for (const { child } of stack.children) if (child.pid) try { process.kill(-child.pid, 'SIGTERM') } catch { /* gone */ }
  const end = Date.now() + 15_000
  while (Date.now() < end && stack.children.some(({ child }) => child.pid && alive(child.pid))) await new Promise((r) => setTimeout(r, 250))
  for (const { child } of stack.children) if (child.pid && alive(child.pid)) try { process.kill(-child.pid, 'SIGKILL') } catch { /* gone */ }
  if (ids.length) removeSiteLeftovers(ids)
  for (const [root, key] of [[HQ, 'hq'], [SITE, 'site']]) {
    const admin = prismaFor(root, withDatabase(stack.urls[key], 'postgres'))
    try {
      await admin.$executeRawUnsafe(dropStatement(stack.names[key]))
    } catch (err) {
      console.error(`[stack] ${stack.names[key]} was not dropped: ${err.message}`)
    } finally {
      await admin.$disconnect()
    }
  }
  try {
    rmSync(stack.runtime, { recursive: true, force: true })
  } catch (err) {
    console.error(`[stack] ${stack.runtime} was not removed: ${err.message}`)
  }
}
