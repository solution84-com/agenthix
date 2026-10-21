#!/usr/bin/env node
// Runs a command with DATABASE_URL pointed at the dedicated test database
// (ADR-0035). Derives the test URL from the dev DATABASE_URL by swapping only
// the database name — no second env file, no duplicated secret.
//
// Loads the rest of .env.server as the base environment (server actions need
// their other secrets), then overrides only DATABASE_URL. Already-set process
// env wins over the file, so CI can supply its own values.
//
// Hard guard: refuses to run unless the resolved database name ends in `_test`,
// so the destructive truncation in integration tests can never hit dev data.
//
// Matches hq's copy of this script (5b-1 ledger item 1, closed 5f-2): both
// now create the test database if missing and apply migrations themselves
// (create-if-missing, then `prisma migrate deploy`), so a fresh checkout can
// run either app's test commands with no manual setup step. Keep the two
// copies in sync — never edit one without the other.
//
//   node scripts/test/with-test-db.mjs vitest run -c vitest.integration.config.ts
//   node scripts/test/with-test-db.mjs npm run dev         # the cross-app tier's boot

import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(here, '../..')
const TEST_DB_NAME = process.env.TEST_DB_NAME ?? 'agenthix_site_test'

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

// File env is the base; process.env (e.g. CI) overrides it.
const fileEnv = parseEnvFile(resolve(siteRoot, '.env.server'))
const baseEnv = { ...fileEnv, ...process.env }

if (!baseEnv.DATABASE_URL) {
  console.error('[with-test-db] no DATABASE_URL (checked process env and .env.server).')
  process.exit(1)
}

const testUrl = (() => {
  const u = new URL(baseEnv.DATABASE_URL)
  u.pathname = `/${TEST_DB_NAME}` // swap only the database name
  return u.toString()
})()

const resolvedName = new URL(testUrl).pathname.replace(/^\//, '')
if (!resolvedName.endsWith('_test')) {
  console.error(
    `[with-test-db] refusing to run: target database "${resolvedName}" does not end in "_test".`
  )
  process.exit(1)
}

// Create the test database if it doesn't exist yet, then bring it up to date
// with the committed migrations. Connects to the admin `postgres` database on
// the same server to run CREATE DATABASE (Postgres has no CREATE DATABASE IF
// NOT EXISTS, so attempt-and-ignore-"already exists" is the standard pattern —
// `prisma migrate deploy` never creates the database itself).
const adminUrl = (() => {
  const u = new URL(baseEnv.DATABASE_URL)
  u.pathname = '/postgres'
  return u.toString()
})()

// Defence in depth on `resolvedName` reaching raw DDL below: it's already
// guarded by the `_test`-suffix check above, and by construction it can only
// ever be a Postgres database name lexically drawn from a URL path segment
// (percent-decoded by the URL parser, then re-encoded the same way on
// `.toString()`) — never arbitrary user input — so this is a belt on top of
// a belt, not the primary defence.
const createResult = spawnSync(
  'npx',
  ['prisma', 'db', 'execute', '--stdin', '--url', adminUrl],
  {
    cwd: siteRoot,
    input: `CREATE DATABASE "${resolvedName}"`,
    encoding: 'utf8',
  }
)
if (createResult.status !== 0) {
  const output = `${createResult.stdout ?? ''}${createResult.stderr ?? ''}`
  if (!/already exists/i.test(output)) {
    console.error('[with-test-db] failed to create test database:')
    console.error(output)
    process.exit(createResult.status ?? 1)
  }
}

const migrateResult = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: siteRoot,
  stdio: 'inherit',
  env: { ...baseEnv, DATABASE_URL: testUrl },
})
if (migrateResult.status !== 0) {
  console.error('[with-test-db] failed to apply migrations to test database.')
  process.exit(migrateResult.status ?? 1)
}

const [cmd, ...args] = process.argv.slice(2)
if (!cmd) {
  console.error('[with-test-db] usage: with-test-db.mjs <command> [args...]')
  process.exit(1)
}

console.error(`[with-test-db] DATABASE_URL → ${resolvedName}`)
const child = spawn(cmd, args, {
  cwd: siteRoot,
  stdio: 'inherit',
  env: { ...baseEnv, DATABASE_URL: testUrl },
})
child.on('exit', (code) => process.exit(code ?? 0))
