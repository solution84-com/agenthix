import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { judgeChanges, postgresImage } from '../regression/changes.mjs'
import { reminderLines } from '../regression/reminders.mjs'

const keys = { 'hq-server': 'h', 'hq-web': 'w', 'site-server': 's', relay: 'r', host: 'x' }
const same = { keysBase: keys, keysNow: keys, postgres: { base: 'postgres:16@a', now: 'postgres:16@a' } }

test('nothing an installation carries forward changed: neither the migration check nor the upgrade test has anything to prove', () => {
  assert.deepEqual(judgeChanges({ ...same, paths: ['ui/src/x.tsx', 'docs/guide/a.md', 'host/src/install/install.ts'] }), { migrations: false, upgrade: null })
})

test('a migration runs the migration check and the upgrade test', () => {
  const r = judgeChanges({ ...same, paths: ['site/migrations/20261115_x/migration.sql'] })
  assert.equal(r.migrations, true)
  assert.match(r.upgrade, /site\/migrations\/20261115_x\/migration\.sql changed/)
})

test("the host service's upgrade runs the upgrade test, not the migration check", () => {
  const r = judgeChanges({ ...same, paths: ['host/src/upgrades/health.ts', 'host/src/upgrades/upgrade.ts'] })
  assert.equal(r.migrations, false)
  assert.match(r.upgrade, /host\/src\/upgrades\/health\.ts and 1 more changed/)
})

test("hq's or the site's image, or the Postgres image, runs the upgrade test; another image does not", () => {
  assert.match(judgeChanges({ ...same, keysNow: { ...keys, 'hq-server': 'h2', 'site-server': 's2' } }).upgrade, /the hq-server, site-server images changed/)
  assert.match(judgeChanges({ ...same, postgres: { base: 'postgres:16@a', now: 'postgres:16@b' } }).upgrade, /the Postgres image changed/)
  assert.equal(judgeChanges({ ...same, keysNow: { ...keys, relay: 'r2', host: 'x2' } }).upgrade, null)
})

test('asked for, the upgrade test runs whatever changed; with nothing to compare with, both run', () => {
  assert.match(judgeChanges({ ...same, asked: true }).upgrade, /asked for/)
  assert.deepEqual(judgeChanges({ unknown: 'no base' }), { migrations: true, upgrade: 'no base' })
})

test('the Postgres image is read from the host service published images', () => {
  assert.equal(postgresImage("x\nexport const POSTGRES_IMAGE = 'postgres:16-alpine@sha256:ab'\ny"), 'postgres:16-alpine@sha256:ab')
  assert.equal(postgresImage(null), null)
})

test('the reminders: each script that is there, its lines in order; one missing or failing says nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'reminders-'))
  try {
    assert.deepEqual(reminderLines({ root }), [])
    mkdirSync(join(root, 'scripts/deps'), { recursive: true })
    writeFileSync(join(root, 'scripts/deps/due.mjs'), "if (process.argv[2] === '--line') console.log('The monthly dependency updates are due.')\n")
    assert.deepEqual(reminderLines({ root }), ['The monthly dependency updates are due.'])
    writeFileSync(join(root, 'scripts/deps/security.mjs'), "console.log('half'); process.exit(3)\n")
    assert.deepEqual(reminderLines({ root }), ['The monthly dependency updates are due.'])
    writeFileSync(join(root, 'scripts/deps/security.mjs'), "console.log('A security alert is due.\\n')\n")
    assert.deepEqual(reminderLines({ root }), ['The monthly dependency updates are due.', 'A security alert is due.'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
