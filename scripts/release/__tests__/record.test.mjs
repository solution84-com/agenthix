import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildRecord, corePackage, postgresImage } from '../record.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const d = c => `sha256:${c.repeat(64)}`

function packCore(dir, version) {
  fs.mkdirSync(path.join(dir, 'package'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package/package.json'), JSON.stringify({ name: '@o/core', version }))
  const tgz = path.join(dir, 'core.tgz')
  execFileSync('tar', ['-czf', tgz, '-C', dir, 'package'])
  return tgz
}

test('the Postgres image is read from the host service’s source, where it is pinned', () => {
  const pinned = postgresImage(fs.readFileSync(path.join(root, 'host/src/images/published.ts'), 'utf8'))
  assert.match(pinned.image, /^postgres:.+@sha256:[0-9a-f]{64}$/)
  assert.equal(pinned.image.endsWith(pinned.digest), true)
  assert.throws(() => postgresImage("export const POSTGRES_IMAGE = 'postgres:16-alpine'"), /pinned by digest/)
})

test('core’s name, version and integrity come from the packed file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-test-'))
  const tgz = packCore(dir, '1.0.0')
  const core = corePackage(tgz)
  assert.deepEqual(core, { name: '@o/core', version: '1.0.0', integrity: `sha512-${crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64')}` })
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the record holds the version, commit, tree, each part’s key and digests, core and Postgres', () => {
  const published = [
    { part: 'site-server', image: 'ghcr.io/o/s', key: 'k2', index: d('c'), amd64: d('d'), arm64: d('e') },
    { part: 'host', image: 'ghcr.io/o/h', key: 'k1', index: d('a'), amd64: d('b'), arm64: d('f') },
  ]
  const core = { name: '@o/core', version: '1.0.0', integrity: 'sha512-x' }
  const postgres = { image: `postgres:16@${d('9')}`, digest: d('9') }
  const r = buildRecord({ version: '1.0.0', commit: 'c1', tree: 't1', published, core, postgres })
  assert.deepEqual(Object.keys(r.parts), ['host', 'site-server'])
  assert.deepEqual(r.parts.host, { key: 'k1', image: 'ghcr.io/o/h', index: d('a'), platforms: { amd64: d('b'), arm64: d('f') } })
  assert.equal(r.version, '1.0.0')
  assert.equal(r.tree, 't1')
  assert.deepEqual(r.core, core)
  assert.deepEqual(r.postgres, postgres)
  assert.throws(() => buildRecord({ version: '1.0.1', commit: 'c1', tree: 't1', published, core, postgres }), /core package is 1.0.0, not 1.0.1/)
  assert.throws(() => buildRecord({ version: '1.0.0', commit: 'c1', tree: 't1', published: [{ ...published[0], arm64: '' }], core, postgres }), /not a digest/)
})
