// node --test scripts/__tests__/image-parts.test.mjs
// Holds scripts/images/parts.json to the Dockerfiles it describes and to the parts the host service publishes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parsePartsFile } from '../images/parts.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')
const { parts } = parsePartsFile(read('scripts/images/parts.json'))

/** The source paths of every COPY that reads from the build context (not `COPY --from`). */
export function contextCopySources(dockerfile) {
  const sources = []
  for (const instruction of dockerfile.replace(/\\\n/g, ' ').split('\n')) {
    const m = /^\s*COPY\s+(.*)$/i.exec(instruction)
    if (!m) continue
    const words = m[1].trim().split(/\s+/)
    const flags = words.filter(w => w.startsWith('--'))
    if (flags.some(f => f.startsWith('--from'))) continue
    const paths = words.filter(w => !w.startsWith('--'))
    sources.push(...paths.slice(0, -1))
  }
  return sources
}

const under = (source, input) => {
  const s = source.replace(/^\.\//, '').replace(/\/$/, '')
  const i = input.replace(/\/$/, '')
  return s === i || s.startsWith(`${i}/`)
}

test('every COPY from the build context reads only paths under its part\'s inputs @SC-1263', () => {
  for (const [part, p] of Object.entries(parts)) {
    const sources = contextCopySources(read(p.dockerfile))
    assert.ok(sources.length > 0, `${part}: no COPY found in ${p.dockerfile}`)
    for (const source of sources) {
      assert.ok(
        p.inputs.some(input => under(source, input)),
        `${part}: ${p.dockerfile} copies ${source}, which is under none of its inputs (${p.inputs.join(', ')}). Add it to scripts/images/parts.json.`,
      )
    }
  }
})

test('the COPY reader skips COPY --from and joins continued lines @SC-1263', () => {
  const text = 'COPY --from=build /a /b\nCOPY --chmod=0755 x/y z\nCOPY a/one \\\n  b/two /dest/\n'
  assert.deepEqual(contextCopySources(text), ['x/y', 'a/one', 'b/two'])
})

test('every input exists, and every Dockerfile and its target are real @SC-1263', () => {
  for (const [part, p] of Object.entries(parts)) {
    assert.ok(fs.existsSync(path.join(root, p.dockerfile)), `${part}: ${p.dockerfile} does not exist`)
    for (const input of p.inputs) assert.ok(fs.existsSync(path.join(root, input)), `${part}: input ${input} does not exist`)
    if (p.target) assert.match(read(p.dockerfile), new RegExp(`\\bAS\\s+${p.target}\\b`, 'i'), `${part}: no stage ${p.target}`)
  }
})

test('the parts are exactly the host service\'s PUBLISHED_PARTS @SC-1263', () => {
  const source = read('host/src/images/published.ts')
  const m = /PUBLISHED_PARTS\s*=\s*\[([^\]]*)\]/.exec(source)
  assert.ok(m, 'PUBLISHED_PARTS not found in host/src/images/published.ts')
  const published = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
  assert.deepEqual(Object.keys(parts).sort(), published.sort())
})
