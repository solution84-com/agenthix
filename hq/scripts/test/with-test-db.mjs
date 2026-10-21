#!/usr/bin/env node
// Runs a command with DATABASE_URL pointed at the dedicated test database
// (ADR-0035). Derives the test URL from the dev DATABASE_URL by swapping only
// the database name — no second env file, no duplicated secret.
//
// Loads the rest of .env.server as the base environment (server actions need
// their other secrets), then overrides only DATABASE_URL. Already-set process
// env wins over the file, so CI can supply its own values.
//
// Hard guard: refuses to run unless every resolved database name ends in
// `_test`, so the destructive truncation in integration tests can never hit dev
// data.
//
// Also creates each test database if missing and applies committed migrations
// (`prisma migrate deploy`) before handing off — matching site's copy of this
// script. hq's schema.prisma sits at the app root with migrations/ directly
// beside it, so `prisma migrate deploy` run with cwd: hqRoot finds both.
//
// Options, before the command:
//   --clean-env   take only DATABASE_URL and SECRETS_MASTER_KEY from .env.server,
//                 drop every HQ_DEV_* switch wherever it came from, and set
//                 NODE_ENV=test — so a test run behaves the same on every machine.
//   --workers=N   prepare N databases, <name>_w1_test … <name>_wN_test (the name
//                 without its `_test`), one per test process, and pass their names
//                 in TEST_DB_WORKER_NAMES with VITEST_MAX_WORKERS=N. src/test/db.ts
//                 connects each Vitest worker to its own. TEST_DB_WORKERS overrides N.
//
//   node scripts/test/with-test-db.mjs --clean-env --workers=4 npx vitest run -c vitest.integration.config.ts
//   node scripts/test/with-test-db.mjs wasp start          # (later) e2e test boot

import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const hqRoot = resolve(here, '../..')
const TEST_DB_NAME = process.env.TEST_DB_NAME ?? 'agenthix_test'

const argv = process.argv.slice(2)
let cleanEnv = false
let workers = 1
while (argv[0]?.startsWith('--')) {
  const option = argv.shift()
  if (option === '--clean-env') cleanEnv = true
  else if (option.startsWith('--workers=')) workers = Number(option.slice('--workers='.length))
  else fail(`unknown option ${option}`)
}
if (process.env.TEST_DB_WORKERS) workers = Number(process.env.TEST_DB_WORKERS)
if (!Number.isInteger(workers) || workers < 1) fail('the worker count must be a whole number of at least 1')
const [cmd, ...args] = argv
if (!cmd) fail('usage: with-test-db.mjs [--clean-env] [--workers=N] <command> [args...]')

function fail(message) {
  console.error(`[with-test-db] ${message}`)
  process.exit(1)
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim().replace(/^"|"$/g, '')
    out[key] = val
  }
  return out
}

// What a test run needs from the developer's file: where the database is, and
// the key that encrypts stored secrets. Everything else in it configures that
// developer's own server.
const KEPT_FOR_TESTS = ['DATABASE_URL', 'SECRETS_MASTER_KEY']

// File env is the base; process.env (e.g. CI) overrides it.
const fileEnv = parseEnvFile(resolve(hqRoot, '.env.server'))
const baseEnv = cleanEnv
  ? { ...Object.fromEntries(KEPT_FOR_TESTS.filter((k) => k in fileEnv).map((k) => [k, fileEnv[k]])), ...process.env }
  : { ...fileEnv, ...process.env }
if (cleanEnv) {
  for (const key of Object.keys(baseEnv)) if (key.startsWith('HQ_DEV_')) delete baseEnv[key]
  baseEnv.NODE_ENV = 'test'
}

if (!baseEnv.DATABASE_URL) fail('no DATABASE_URL (checked process env and .env.server).')

function urlFor(name) {
  const u = new URL(baseEnv.DATABASE_URL)
  u.pathname = `/${name}` // swap only the database name
  return u.toString()
}

// The name as it reaches Postgres after the URL's own encoding round trip.
const nameIn = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))

if (!TEST_DB_NAME.endsWith('_test')) {
  fail(`refusing to run: target database "${TEST_DB_NAME}" does not end in "_test".`)
}
const stem = TEST_DB_NAME.slice(0, -'_test'.length)
const databases = workers === 1 ? [TEST_DB_NAME] : Array.from({ length: workers }, (_, i) => `${stem}_w${i + 1}_test`)
for (const name of databases) {
  if (!nameIn(urlFor(name)).endsWith('_test')) fail(`refusing to run: target database "${name}" does not end in "_test".`)
}

function run(command, commandArgs, options) {
  return new Promise((done) => {
    const child = spawn(command, commandArgs, { cwd: hqRoot, ...options, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('exit', (status) => done({ status, output }))
    child.stdin.end(options.input ?? '')
  })
}

// Create the test database if it doesn't exist yet, then bring it up to date
// with the committed migrations. Connects to the admin `postgres` database on
// the same server to run CREATE DATABASE (Postgres has no CREATE DATABASE IF
// NOT EXISTS, so attempt-and-ignore-"already exists" is the standard pattern —
// `prisma migrate deploy` never creates the database itself). The name reaching
// raw DDL is guarded by the `_test` check above and can only come from
// TEST_DB_NAME through a URL path segment — never request input.
async function prepare(name) {
  const created = await run('npx', ['prisma', 'db', 'execute', '--stdin', '--url', urlFor('postgres')], {
    input: `CREATE DATABASE "${nameIn(urlFor(name))}"`,
  })
  if (created.status !== 0 && !/already exists/i.test(created.output)) {
    return `failed to create test database ${name}:\n${created.output}`
  }
  const migrated = await run('npx', ['prisma', 'migrate', 'deploy'], { env: { ...baseEnv, DATABASE_URL: urlFor(name) } })
  if (migrated.status !== 0) return `failed to apply migrations to test database ${name}:\n${migrated.output}`
  return null
}

const problems = (await Promise.all(databases.map(prepare))).filter(Boolean)
if (problems.length > 0) fail(problems.join('\n'))

const childEnv = { ...baseEnv, DATABASE_URL: urlFor(TEST_DB_NAME) }
if (workers > 1) {
  childEnv.TEST_DB_WORKER_NAMES = databases.join(',')
  childEnv.VITEST_MAX_WORKERS = String(workers)
}
console.error(`[with-test-db] DATABASE_URL → ${databases.join(', ')}${cleanEnv ? ' (clean environment)' : ''}`)
const child = spawn(cmd, args, { cwd: hqRoot, stdio: 'inherit', env: childEnv })
child.on('exit', (code) => process.exit(code ?? 0))
