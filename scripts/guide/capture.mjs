#!/usr/bin/env node
// The one way the user guide's screenshots are captured, on a dev machine (the release rehearsal, the regression) and
// on GitHub (guide-screenshots.yml): hq from its build (scripts/regression/hq-built.mjs) and a site, on free ports,
// against the guide databases (hq/scripts/guide/with-guide-db.mjs), then `npm run guide:screenshots` in hq/. Every
// child is given one environment, so what passes here passes there.
//
//   node scripts/guide/capture.mjs [--logs <dir>] [--no-build]
//
//   --logs      where hq.log, site.log and the apps' folders go (a new folder under the system's temporary one)
//   --no-build  run hq from the build already made (`node scripts/regression/hq-built.mjs --build`)
//
// The guide databases are GUIDE_HQ_DATABASE_URL and GUIDE_SITE_DATABASE_URL when set; else, under the regression, on
// its own database server (TEST_DB_SERVER_URL); else beside each app's dev database. Exits with the capture's code.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePorts } from '../regression/stack.mjs'
import { HQ_GUIDE_DB_NAME, SITE_GUIDE_DB_NAME, urlWithDatabase } from '../../hq/scripts/guide/databaseUrls.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HQ = join(ROOT, 'hq')
const SITE = join(ROOT, 'site')
const WITH_GUIDE_DB = join(HQ, 'scripts/guide/with-guide-db.mjs')
const HEAP = '--max-old-space-size=4096'

function options(argv) {
  const o = { logs: null, build: true }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--logs') o.logs = resolve(argv[++i] ?? '')
    else if (argv[i] === '--no-build') o.build = false
    else {
      console.error(`[capture] unknown option ${argv[i]}`)
      process.exit(2)
    }
  }
  return o
}

/** Everything the servers, the seed and the recipes read, in one environment. */
function captureEnv({ logs, runtime, ports }) {
  const env = { ...process.env }
  for (const key of ['DATABASE_URL', 'TEST_DB_NAME', 'PORT']) delete env[key]
  if (!env.GUIDE_HQ_DATABASE_URL && env.TEST_DB_SERVER_URL) {
    env.GUIDE_HQ_DATABASE_URL = urlWithDatabase(env.TEST_DB_SERVER_URL, HQ_GUIDE_DB_NAME)
    env.GUIDE_SITE_DATABASE_URL = urlWithDatabase(env.TEST_DB_SERVER_URL, SITE_GUIDE_DB_NAME)
  }
  const client = `http://localhost:${ports.web}`
  const server = `http://localhost:${ports.server}`
  return {
    ...env,
    HQ_WEB_PORT: String(ports.web), HQ_SERVER_PORT: String(ports.server), GUIDE_SITE_PORT: String(ports.site),
    E2E_CLIENT_URL: client, E2E_SERVER_URL: server,
    WASP_SERVER_URL: server, WASP_WEB_CLIENT_URL: client, REACT_APP_API_URL: server,
    HQ_PAIRING_SECRET: randomBytes(32).toString('hex'),
    // hq's key, which the seed stores the sample model key with; the site is given its own below.
    SECRETS_MASTER_KEY: randomBytes(32).toString('base64'),
    // The seed writes the sample's Knowledge pages into the site's folder, so both read this one.
    SITE_ROOT: join(logs, 'site-root'), HQ_STORAGE_ROOT: join(logs, 'hq-storage'),
    // A Unix socket's path may not be longer than 103 bytes, so the sockets go in a short folder of their own.
    HQ_CONTROL_SOCKET: join(runtime, 'hq.sock'), SITE_CONTROL_SOCKET: join(runtime, 'site.sock'),
    HQ_MACHINE_NAME: 'fernhill-hq', WASP_TELEMETRY_DISABLE: '1', CI: 'true',
    NODE_OPTIONS: `${HEAP} ${env.NODE_OPTIONS ?? ''}`.trim(),
  }
}

function runOrFail(what, command, args, cwd, env) {
  const r = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status ?? r.signal})`)
}

function startServer(servers, name, cwd, command, env, logs) {
  const log = join(logs, `${name}.log`)
  const out = openSync(log, 'a')
  // A process group of its own: npm and Vite signal their whole group when stopped, which must never reach this one.
  const child = spawn(command[0], command.slice(1), { cwd, env, detached: true, stdio: ['ignore', out, out] })
  closeSync(out)
  child.on('error', (err) => console.error(`[capture] ${name} did not start: ${err.message}`))
  servers.push({ name, child, log })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function until(servers, check, what, timeoutMs) {
  const end = Date.now() + timeoutMs
  for (;;) {
    if (await check().catch(() => false)) return
    const dead = servers.find(({ child }) => child.exitCode !== null || child.signalCode !== null)
    if (dead) throw new Error(`${dead.name} stopped (exit ${dead.child.exitCode ?? dead.child.signalCode}) before ${what}; see ${dead.log}`)
    if (Date.now() > end) throw new Error(`${what} within ${timeoutMs / 1000} s; see the logs`)
    await sleep(2000)
  }
}

const answers = async (url) => (await fetch(url, { signal: AbortSignal.timeout(5000) })).ok

function alive(pid) {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

async function stopServers(servers) {
  for (const { child } of servers) if (child.pid) try { process.kill(-child.pid, 'SIGTERM') } catch { /* gone */ }
  const end = Date.now() + 15_000
  while (Date.now() < end && servers.some(({ child }) => child.pid && alive(child.pid))) await sleep(250)
  for (const { child } of servers) if (child.pid && alive(child.pid)) try { process.kill(-child.pid, 'SIGKILL') } catch { /* gone */ }
}

async function main() {
  const o = options(process.argv.slice(2))
  const logs = o.logs ?? mkdtempSync(join(tmpdir(), 'guide-capture-'))
  const runtime = mkdtempSync(join(tmpdir(), 'agenthix-guide-'))
  console.log(`[capture] logs: ${logs}`)
  const [web, server, site] = await freePorts(3)
  const env = captureEnv({ logs, runtime, ports: { web, server, site } })
  for (const dir of [logs, env.SITE_ROOT, env.HQ_STORAGE_ROOT]) mkdirSync(dir, { recursive: true })

  const servers = []
  let stopping = null
  const stop = async () => {
    stopping ??= stopServers(servers).then(() => rmSync(runtime, { recursive: true, force: true }))
    await stopping
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void stop().then(() => process.exit(130)))

  let code = 1
  try {
    if (o.build) runOrFail("hq's build", 'node', [join(ROOT, 'scripts/regression/hq-built.mjs'), '--build'], ROOT, env)
    runOrFail('preparing the guide databases', 'node', [WITH_GUIDE_DB, '--reset', 'true'], ROOT, env)
    startServer(servers, 'hq', HQ, ['node', WITH_GUIDE_DB, 'node', join(ROOT, 'scripts/regression/hq-built.mjs')],
      { ...env, PORT: String(server) }, logs)
    startServer(servers, 'site', SITE, ['node', WITH_GUIDE_DB, 'sh', '-c', 'DATABASE_URL="$GUIDE_SITE_DATABASE_URL" exec npm run dev'],
      { ...env, PORT: String(site), HQ_URL: env.WASP_SERVER_URL, AGENT_CONTAINER_ISOLATION: 'false',
        SECRETS_MASTER_KEY: randomBytes(32).toString('base64') }, logs)

    const hqLog = join(logs, 'hq.log')
    await until(servers, async () => (await (await fetch(`${env.WASP_SERVER_URL}/health`)).json())?.status === 'ok', 'hq answered', 360_000)
    await until(servers, () => answers(env.WASP_WEB_CLIENT_URL), "hq's web page answered", 120_000)
    await until(servers, async () => readFileSync(hqLog, 'utf8').includes('[hq-built] the web page is warm'), "hq's web page warmed", 300_000)
    await until(servers, () => answers(`http://localhost:${site}/health`), 'the site answered', 180_000)
    console.log('[capture] hq and the site are up; capturing')

    const r = spawnSync('npm', ['run', 'guide:screenshots'], { cwd: HQ, env, stdio: 'inherit' })
    code = r.status ?? 1
  } catch (err) {
    console.error(`[capture] ${err.message}`)
  } finally {
    await stop()
    console.log(`[capture] ${code === 0 ? 'passed' : `failed (exit ${code})`}; logs: ${logs}`)
  }
  process.exit(code)
}

await main()
