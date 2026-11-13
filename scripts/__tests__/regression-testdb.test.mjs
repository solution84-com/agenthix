// The regression's own database server: how it is started, found, waited for and removed, with Docker faked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostPort, runArgs, startTestDatabase } from '../regression/testdb.mjs'
import { ROOT, baseDatabaseUrl } from '../regression/stack.mjs'

test('the server is set up for tests, removed with its data, and published on localhost only', () => {
  const args = runArgs('regression-test-db-1', 'pw', 5432).join(' ')
  assert.match(args, /--rm --name regression-test-db-1/)
  assert.match(args, /-p 127\.0\.0\.1::5432/)
  assert.doesNotMatch(args, /--tmpfs/)
  for (const s of ['fsync=off', 'synchronous_commit=off', 'full_page_writes=off', 'wal_level=minimal', 'max_connections=300']) assert.match(args, new RegExp(`-c ${s}`))
})

test('the published port is read from docker port', () => {
  assert.equal(hostPort('127.0.0.1:55012\n'), 55012)
  assert.throws(() => hostPort(''))
})

test('starts the server, waits until it answers, removes one a killed run left, and stops it', async () => {
  const calls = []
  let readyAfter = 2
  const docker = (args) => {
    calls.push(args.join(' '))
    if (args[0] === 'ps') return 'regression-test-db-999999999\n'
    if (args[0] === 'port') return '127.0.0.1:55012\n'
    if (args[0] === 'exec' && readyAfter-- > 0) throw new Error('not yet')
    return ''
  }
  const db = await startTestDatabase({ root: ROOT, docker, wait: async () => {} })
  assert.match(db.url, /^postgresql:\/\/regression:[^@]+@127\.0\.0\.1:55012\/postgres$/)
  assert.ok(calls.includes('rm -f regression-test-db-999999999'))
  assert.equal(calls.filter((c) => c.startsWith('exec')).length, 3)
  db.stop()
  assert.equal(calls.at(-1), `rm -f regression-test-db-${process.pid}`)
})

test('the stacks take the run\'s server before any other address', () => {
  assert.equal(baseDatabaseUrl('/nowhere', { TEST_DB_SERVER_URL: 'postgresql://a@h:1/postgres', DATABASE_URL: 'postgresql://b@h:2/x' }), 'postgresql://a@h:1/postgres')
  assert.equal(baseDatabaseUrl('/nowhere', { DATABASE_URL: 'postgresql://b@h:2/x' }), 'postgresql://b@h:2/x')
})
