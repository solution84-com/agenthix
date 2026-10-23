// node --test scripts/install-test/__tests__/ports.test.mjs
import assert from 'node:assert/strict'
import net from 'node:net'
import { test } from 'node:test'
import { free, taken } from '../ports.mjs'

test('a port something listens on is held, and free once it stops @SC-1149', async () => {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  assert.deepEqual(await taken([port]), [port])
  await new Promise((resolve) => server.close(resolve))
  assert.deepEqual(await taken([port]), [])
})

test('free ports are distinct, inside the range and not held @SC-1149', async () => {
  const ports = await free(3, 20000, 20500)
  assert.equal(new Set(ports).size, 3)
  for (const p of ports) assert.ok(p >= 20000 && p <= 20500)
  assert.deepEqual(await taken(ports), [])
})
