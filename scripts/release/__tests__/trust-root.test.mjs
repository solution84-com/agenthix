import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { MAX_AGE_DAYS, trustRootProblem } from '../trust-root.mjs'

const now = Date.parse('2026-10-28T00:00:00Z')
const rootText = '{"tlogs":[],"certificateAuthorities":[]}\n'
const sha256 = createHash('sha256').update(rootText).digest('hex')
const issuedText = (days, sha = sha256) => JSON.stringify({ issuedAt: new Date(now - days * 86_400_000).toISOString(), sha256: sha })
const problem = (issued, root = rootText) => trustRootProblem({ rootText: root, issuedText: issued, now })

test('a trust root fetched within the limit can ship @SC-1614', () => {
  assert.equal(problem(issuedText(0)), null)
  assert.equal(problem(issuedText(MAX_AGE_DAYS)), null)
})

test('a trust root older than the limit fails and says how old @SC-1614', () => {
  assert.match(problem(issuedText(MAX_AGE_DAYS + 1)), /301 days ago/)
  assert.ok(MAX_AGE_DAYS < 365, 'the limit leaves hq time before it refuses the root')
})

test('a root that is not the file issued.json describes fails @SC-1614', () => {
  assert.match(problem(issuedText(1), rootText + ' '), /sha256 differs/)
})

test('an unreadable or dateless issued.json, or a future date, fails @SC-1614', () => {
  assert.match(problem('not json'), /not readable/)
  assert.match(problem('{"sha256":"x"}'), /no valid issuedAt/)
  assert.match(problem(issuedText(-3)), /in the future/)
})
