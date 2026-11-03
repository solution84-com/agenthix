import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const guide = readFileSync(join(root, 'docs/guide/getting-started/install.md'), 'utf8')
const parts = JSON.parse(readFileSync(join(root, 'scripts/images/parts.json'), 'utf8')).parts

// The images the host service's install pulls or checks (host/src/install/install.ts); the executor is built on demand.
const installed = ['hq-server', 'hq-web', 'relay', 'site-server', 'agent', 'console', 'host']

describe('the guide\'s install-from-source page', () => {
  it.each(installed)('builds the %s image', (name) => {
    const p = parts[name]
    const tag = `agenthix-${name}`
    const line = guide.split('\n').find((l) => l.includes('docker build') && l.includes(`-f ${p.dockerfile}`) && l.includes(`-t ${tag} `) && (name.startsWith('hq-') ? l.includes(`--target ${p.target}`) : true))
    expect(line, `no docker build line for ${tag}`).toBeTruthy()
  })
})
