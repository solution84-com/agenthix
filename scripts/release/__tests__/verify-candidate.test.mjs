import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { verifyCandidate } from '../verify-candidate.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const d = c => `sha256:${c.repeat(64)}`
const keys = { host: 'k1', agent: 'k2' }
const candidate = () => ({
  commit: 'c1', tree: 't1',
  parts: {
    host: { key: 'k1', image: 'ghcr.io/o/host', platforms: { amd64: { digest: d('a') }, arm64: { digest: d('b') } } },
    agent: { key: 'k2', image: 'ghcr.io/o/agent', platforms: { amd64: { digest: d('c') }, arm64: { digest: d('e') } } },
  },
})
// The registry's attested images: what reuse.sh would print for each part, architecture and key.
const attested = { 'host/amd64/k1': d('a'), 'host/arm64/k1': d('b'), 'agent/amd64/k2': d('c'), 'agent/arm64/k2': d('e') }
const reuse = (image, part, arch, key) => {
  const digest = attested[`${part}/${arch}/${key}`]
  return digest ? { ok: true, digest } : { ok: false, reason: `no attestation for ${part} ${arch} ${key}` }
}
const verify = over => verifyCandidate({ candidate: candidate(), keys, commit: 'c1', tree: 't1', registry: 'ghcr.io/o', reuse, ...over })

test('a candidate whose every image is attested with the key the tagged commit computes is promoted', () => {
  const { problems, promote } = verify({})
  assert.deepEqual(problems, [])
  assert.deepEqual(promote.find(p => p.part === 'host'), { part: 'host', image: 'ghcr.io/o/host', key: 'k1', amd64: d('a'), arm64: d('b') })
})

test('a digest whose attested key differs from the tagged commit’s is refused, naming the part and both keys', () => {
  const c = candidate()
  c.parts.host.key = 'k-old'
  const { problems, promote } = verify({ candidate: c })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /^host: the candidate's key is k-old; the key recomputed at the tagged commit is k1\./)
  assert.equal(promote.some(p => p.part === 'host'), false)
})

test('a digest other than the attested one, or with no attestation, is refused per architecture', () => {
  const c = candidate()
  c.parts.agent.platforms.arm64.digest = d('f')
  const { problems } = verify({ candidate: c, reuse: (i, part, arch, key) => (part === 'host' && arch === 'amd64' ? { ok: false, reason: 'no attestation' } : reuse(i, part, arch, key)) })
  assert.deepEqual(problems, [
    'host (amd64): no attestation',
    `agent (arm64): the attested image for key k2 is ${d('e')}; the candidate's is ${d('f')}.`,
  ])
})

test('a candidate for another commit or tree, with a part missing or extra, or outside the registry, is refused', () => {
  const c = candidate()
  c.parts.extra = c.parts.agent
  delete c.parts.agent
  c.parts.host.image = 'ghcr.io/elsewhere/host'
  const { problems } = verify({ candidate: c, commit: 'c2', tree: 't2' })
  assert.match(problems.join('\n'), /for commit c1, not the tagged commit c2/)
  assert.match(problems.join('\n'), /for tree t1, not the tagged commit's tree t2/)
  assert.match(problems.join('\n'), /agent: the tagged commit has this part, and the candidate has no image for it/)
  assert.match(problems.join('\n'), /extra: the candidate has an image for it, and the tagged commit has no such part/)
  assert.match(problems.join('\n'), /host: the candidate's image ghcr.io\/elsewhere\/host is not a name under ghcr.io\/o/)
})

test('the script asks reuse.sh, refuses with what differed, and writes nothing then', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-test-'))
  const fake = path.join(dir, 'reuse.sh')
  // Attests host for amd64 only; the rest has no attestation.
  fs.writeFileSync(fake, `#!/usr/bin/env bash\n[ "$2" = host ] && [ "$3" = amd64 ] && [ "$4" = k1 ] && echo ${d('a')} && exit 0\necho "$1 carries no valid build attestation" >&2\nexit 1\n`, { mode: 0o755 })
  const write = (name, value) => { fs.writeFileSync(path.join(dir, name), JSON.stringify(value)); return path.join(dir, name) }
  const args = ['--candidate', write('c.json', candidate()), '--keys', write('k.json', keys), '--commit', 'c1', '--tree', 't1', '--registry', 'ghcr.io/o', '--out', path.join(dir, 'out.json')]
  const r = spawnSync(process.execPath, [path.join(here, '../verify-candidate.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, REUSE: fake } })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /::error::host \(arm64\): ghcr.io\/o\/host carries no valid build attestation/)
  assert.match(r.stderr, /Nothing was changed\./)
  assert.equal(fs.existsSync(path.join(dir, 'out.json')), false)
  // With every image attested, it writes the parts to promote.
  fs.writeFileSync(fake, `#!/usr/bin/env bash\ncase "$2/$3" in host/amd64) echo ${d('a')};; host/arm64) echo ${d('b')};; agent/amd64) echo ${d('c')};; agent/arm64) echo ${d('e')};; esac\n`, { mode: 0o755 })
  execFileSync(process.execPath, [path.join(here, '../verify-candidate.mjs'), ...args], { env: { ...process.env, REUSE: fake } })
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')).length, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})
