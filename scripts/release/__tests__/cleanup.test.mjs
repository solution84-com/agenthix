import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planDeletions, recordedDigests } from '../cleanup.mjs'

const now = Date.parse('2026-10-24T00:00:00Z')
const d = c => `sha256:${c.repeat(64)}`
const daysAgo = n => new Date(now - n * 86_400_000).toISOString()
let id = 0
const v = (digest, tags, days) => ({ id: ++id, digest, tags, created_at: daysAgo(days) })
const image = {}
const index = (...children) => ({ manifests: children.map(digest => ({ digest })) })
const referrer = subject => ({ subject: { digest: subject } })
const plan = (versions, { manifests = {}, recorded = new Set() } = {}) =>
  planDeletions({ versions, recorded, now, manifestOf: dg => { if (dg in manifests) return manifests[dg] ?? (() => { throw new Error('unreadable') })(); return image } })
    .map(x => x.digest)

test('old untagged images and build images past 90 days go; young ones and anything with another tag stay', () => {
  const versions = [
    v(d('1'), [], 30), v(d('2'), [], 3),
    v(d('3'), ['build-k-amd64'], 120), v(d('4'), ['build-k-arm64'], 60),
    v(d('5'), ['1.0.0'], 400), v(d('6'), ['build-k-amd64', '1.0.0'], 400), v(d('7'), ['sha256-abc.att'], 400),
  ]
  assert.deepEqual(plan(versions), [d('1'), d('3')])
})

test('nothing a release record names is deleted, however old', () => {
  const records = [{ parts: { host: { index: d('a'), platforms: { amd64: d('1'), arm64: d('3') } } } }]
  const versions = [v(d('1'), [], 300), v(d('3'), ['build-k-arm64'], 300), v(d('8'), [], 300)]
  assert.deepEqual(plan(versions, { recorded: recordedDigests(records) }), [d('8')])
})

test('a kept index keeps its platform images, and a kept image its signatures and attestations', () => {
  const versions = [v(d('i'), ['0.1.0-alpha.1'], 200), v(d('1'), [], 200), v(d('2'), [], 200), v(d('s'), [], 200), v(d('x'), [], 200), v(d('y'), [], 200)]
  const manifests = { [d('i')]: index(d('1'), d('2')), [d('s')]: referrer(d('1')), [d('y')]: referrer(d('x')) }
  // x goes, and its attestation y with it; s stays, being an attestation of a kept image.
  assert.deepEqual(plan(versions, { manifests }), [d('x'), d('y')])
})

test('an image whose manifest cannot be read is kept; one that a kept image needs and cannot be read stops everything', () => {
  assert.deepEqual(plan([v(d('1'), [], 200)], { manifests: { [d('1')]: null } }), [])
  assert.throws(() => plan([v(d('i'), ['1.0.0'], 200)], { manifests: { [d('i')]: null } }), /Nothing is deleted/)
})
