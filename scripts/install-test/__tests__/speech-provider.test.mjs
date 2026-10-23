// node --test scripts/install-test/__tests__/speech-provider.test.mjs
import assert from 'node:assert/strict'
import { createDecipheriv, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { FAKE_KEY as DEV_FAKE_KEY } from '../../../hq/e2e/fixtures/fake-providers.mjs'

const { providerRow, FAKE_KEY } = createRequire(import.meta.url)('../speech-provider.cjs')

const masterKey = randomBytes(32)

function decrypt(sealed, key) {
  const [iv, tag, ct] = sealed.split('.').map((p) => Buffer.from(p, 'base64'))
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
}

test('a speech provider is stored as a working organisation provider with a fake key HQ can read back @SC-1149', () => {
  for (const [vendor, name] of [['assemblyai', 'AssemblyAI'], ['inworld', 'Inworld']]) {
    const row = providerRow(vendor, masterKey.toString('base64'))
    assert.equal(row.vendor, vendor)
    assert.equal(row.name, name)
    assert.equal(row.credentialKind, 'api_key')
    assert.equal(row.state, 'works')
    assert.equal(row.baseUrl, null)
    assert.equal(decrypt(row.secret, masterKey), FAKE_KEY)
    assert.equal(row.keyHint, FAKE_KEY.slice(-4))
    // Dated ahead, so HQ never re-checks the fake key with the vendor.
    assert.ok(row.lastCheckedAt.getTime() > Date.now() + 50 * 365 * 24 * 3600 * 1000)
  }
})

test('the fake key is the one the development fixtures use', () => {
  assert.equal(FAKE_KEY, DEV_FAKE_KEY)
})

test('only a speech vendor, and only with HQ’s 32-byte key', () => {
  assert.throws(() => providerRow('openai', masterKey.toString('base64')), /Not a speech vendor/)
  assert.throws(() => providerRow('toString', masterKey.toString('base64')), /Not a speech vendor/)
  assert.throws(() => providerRow('inworld', undefined), /SECRETS_MASTER_KEY/)
  assert.throws(() => providerRow('inworld', randomBytes(16).toString('base64')), /SECRETS_MASTER_KEY/)
})
