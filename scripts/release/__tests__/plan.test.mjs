import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

test('the plan marks an image reused only where the reuse check prints a digest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-test-'))
  const fake = path.join(dir, 'reuse.sh')
  const digest = `sha256:${'a'.repeat(64)}`
  // Reuses the amd64 host image only.
  fs.writeFileSync(fake, `#!/usr/bin/env bash\n[ "$2" = host ] && [ "$3" = amd64 ] && echo ${digest} && exit 0\necho nope >&2\nexit 1\n`, { mode: 0o755 })
  const out = execFileSync(path.join(here, '../plan.sh'), [], {
    encoding: 'utf8',
    env: {
      ...process.env,
      REUSE: fake,
      KEYS: '{"host":"k1","agent":"k2"}',
      NAMES: '{"host":"h","agent":"a"}',
      REGISTRY: 'ghcr.io/o',
      IMAGES: '[{"part":"host","file":"f","target":"host"},{"part":"agent","file":"g","target":""}]',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const plan = JSON.parse(out)
  assert.equal(plan.length, 4)
  const find = (part, arch) => plan.find(e => e.part === part && e.arch === arch)
  assert.equal(find('host', 'amd64').status, 'reused')
  assert.equal(find('host', 'amd64').digest, digest)
  assert.equal(find('host', 'arm64').status, 'missing')
  assert.equal(find('agent', 'amd64').status, 'missing')
  assert.equal(find('agent', 'arm64').runner, 'ubuntu-24.04-arm')
  assert.equal(find('host', 'amd64').image, 'ghcr.io/o/h')
  fs.rmSync(dir, { recursive: true, force: true })
})
