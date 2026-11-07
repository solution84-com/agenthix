// node --test scripts/__tests__/docs-install-images.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const guide = readFileSync(join(root, 'docs/guide/getting-started/install.md'), 'utf8')
const parts = JSON.parse(readFileSync(join(root, 'scripts/images/parts.json'), 'utf8')).parts

// The images the host service's install pulls or checks (host/src/install/install.ts); the executor is built on demand.
const installed = ['hq-server', 'hq-web', 'relay', 'site-server', 'agent', 'console', 'host']

for (const name of installed) {
  test(`the guide's install-from-source page builds the ${name} image`, () => {
    const p = parts[name]
    const tag = `agenthix-${name}`
    const line = guide.split('\n').find((l) => l.includes('docker build') && l.includes(`-f ${p.dockerfile}`) && l.includes(`-t ${tag} `) && (name.startsWith('hq-') ? l.includes(`--target ${p.target}`) : true))
    assert.ok(line, `no docker build line for ${tag}`)
  })
}
