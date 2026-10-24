import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCandidate, summaryTable } from '../candidate.mjs'

const d = c => `sha256:${c.repeat(64)}`
const entry = (part, arch, status, digest = '') => ({ part, arch, status, digest, key: 'k'.repeat(64), name: part, image: `r/${part}` })

test('a candidate joins reused and built images, per part and platform', () => {
  const plan = [entry('host', 'amd64', 'reused', d('a')), entry('host', 'arm64', 'missing'), entry('agent', 'amd64', 'missing')]
  const built = [{ part: 'host', arch: 'arm64', digest: d('b') }, { part: 'agent', arch: 'amd64', digest: d('c') }]
  const c = buildCandidate({ plan, built, commit: 'c1', tree: 't1' })
  assert.deepEqual(c.parts.host.platforms, { amd64: { digest: d('a'), source: 'reused' }, arm64: { digest: d('b'), source: 'built' } })
  assert.equal(c.parts.agent.platforms.amd64.source, 'built')
  assert.match(summaryTable(c), /\| host \| arm64 \| built \|/)
})

test('an image planned for building with no digest is an error, never a half record', () => {
  assert.throws(() => buildCandidate({ plan: [entry('host', 'amd64', 'missing')], built: [], commit: 'c', tree: 't' }), /No digest for host \(amd64\)/)
})
