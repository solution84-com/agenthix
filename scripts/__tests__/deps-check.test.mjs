// node --test scripts/__tests__/deps-check.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { check } from '../deps/check.mjs'

const lock = packages => ({ lockfileVersion: 3, packages: Object.fromEntries(Object.entries(packages).map(([k, v]) => [`node_modules/${k}`, { version: v }])) })

/** A tree in which every rule holds; `change` edits the file map before it is written. */
function tree(change = () => {}) {
  const files = {
    '.nvmrc': '24.14.1\n',
    'package.json': { name: 'root' },
    'hq/package.json': { devDependencies: { '@wasp.sh/wasp-cli': '0.23.0', prisma: '5.19.1', typescript: '6.0.3', esbuild: '^0.28.2', vitest: '^4.0.0' } },
    'hq/package-lock.json': lock({ typescript: '6.0.3', esbuild: '0.28.2', prisma: '5.19.1', '@types/node': '24.1.0' }),
    'hq/.npmrc': 'fund=false\n',
    'site/package.json': { dependencies: { '@prisma/client': '5.19.1', zod: '^4.0.0' }, devDependencies: { prisma: '5.19.1', typescript: '~6.0.3', esbuild: '^0.28.2' } },
    'site/package-lock.json': lock({ typescript: '6.0.3', esbuild: '0.28.2', prisma: '5.19.1', '@types/node': '24.2.0' }),
    'core/package.json': { dependencies: { x: 'file:../x' }, devDependencies: { typescript: '~6.0.3' } },
    'core/package-lock.json': lock({ typescript: '6.0.3', '@types/node': '24.2.0' }),
    'hq/docker/Dockerfile': 'RUN npm ci\n',
    '.github/workflows/checks.yml': 'run: npm ci\n',
    'scripts/a.sh': '# installs without legacy-peer-deps\nnpm ci\n',
  }
  change(files)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-check-'))
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content))
  }
  return root
}

const failuresOf = change => check(tree(change))

test('a tree where every rule holds passes without a line', () => {
  assert.deepEqual(failuresOf(), [])
})

test('an exact version off the allowed list fails, naming the module, file and package', () => {
  const f = failuresOf(files => { files['core/package.json'].devDependencies.vitest = '4.0.1' })
  assert.equal(f.length, 1)
  assert.match(f[0], /^core: core\/package\.json: vitest is exact \(4\.0\.1\)/)
})

test('file: and workspace references are not versions, and the allowed exact ones pass', () => {
  assert.deepEqual(failuresOf(files => { files['core/package.json'].dependencies.y = 'workspace:*' }), [])
})

test('an allowed package is exact only in its own module', () => {
  const f = failuresOf(files => { files['core/package.json'].devDependencies.prisma = '5.19.1' })
  assert.match(f[0], /^core: .*prisma is exact/)
})

test('legacy-peer-deps in an .npmrc, a Dockerfile, a workflow or a script fails, naming each', () => {
  const f = failuresOf(files => {
    files['hq/.npmrc'] = 'legacy-peer-deps=true\n'
    files['hq/docker/Dockerfile'] = 'RUN npm ci --legacy-peer-deps\n'
    files['.github/workflows/checks.yml'] = 'run: npm ci --legacy-peer-deps\n'
    files['scripts/a.sh'] = 'npm ci --legacy-peer-deps\n'
  })
  assert.equal(f.length, 4)
  assert.ok(f.some(l => l.startsWith('hq: hq/.npmrc:1: ')))
  assert.ok(f.some(l => l.startsWith('hq: hq/docker/Dockerfile:1: ')))
  assert.ok(f.some(l => l.startsWith('.github: .github/workflows/checks.yml:1: ')))
  assert.ok(f.some(l => l.startsWith('scripts: scripts/a.sh:1: ')))
})

test('legacy-peer-deps under node_modules is not read', () => {
  assert.deepEqual(failuresOf(files => { files['hq/node_modules/p/.npmrc'] = 'legacy-peer-deps=true\n' }), [])
})

for (const pkg of ['typescript', 'esbuild', 'prisma']) {
  test(`${pkg} resolving to different versions across modules fails, naming the modules`, () => {
    const f = failuresOf(files => {
      files['site/package-lock.json'] = lock({ typescript: '6.0.3', esbuild: '0.28.2', prisma: '5.19.1', '@types/node': '24.2.0', [pkg]: '9.9.9' })
    })
    assert.equal(f.length, 1)
    assert.ok(f[0].includes(`${pkg} is on more than one version`))
    assert.ok(f[0].includes('9.9.9 in site'))
    assert.match(f[0], /\bhq\b/)
  })
}

test('a copy another package brings in, at another version, passes', () => {
  const f = failuresOf(files => {
    files['core/package-lock.json'] = lock({ typescript: '6.0.3', esbuild: '0.27.7', '@types/node': '24.2.0' })
  })
  assert.deepEqual(f, [])
})

test("@types/node's major differing from .nvmrc's fails", () => {
  const f = failuresOf(files => { files['site/package-lock.json'] = lock({ typescript: '6.0.3', esbuild: '0.28.2', prisma: '5.19.1', '@types/node': '22.20.5' }) })
  assert.equal(f.length, 1)
  assert.match(f[0], /^site: site\/package-lock\.json: @types\/node is 22\.20\.5 but \.nvmrc is Node 24/)
})

test("TypeScript's range must be patch-only outside hq's exact one", () => {
  const caret = failuresOf(files => { files['core/package.json'].devDependencies.typescript = '^6.0.3' })
  assert.equal(caret.length, 1)
  assert.match(caret[0], /^core: core\/package\.json: typescript is "\^6\.0\.3"/)
  const exact = failuresOf(files => { files['core/package.json'].devDependencies.typescript = '6.0.3' })
  assert.ok(exact.some(l => l.startsWith('core: ') && l.includes('patch-only')))
})

const digest = `sha256:${'a'.repeat(64)}`

test('an outside image on a FROM line without a digest fails; a stage, scratch and our own image do not', () => {
  const f = failuresOf(files => {
    files['hq/docker/Dockerfile'] = [
      `FROM node:24.14.1-alpine3.23@${digest} AS build`,
      'FROM build AS final',
      'FROM scratch',
      'FROM agenthix-hq-server:latest',
      'FROM --platform=$BUILDPLATFORM alpine:3.23 AS tools',
    ].join('\n')
  })
  assert.equal(f.length, 1)
  assert.match(f[0], /^hq: hq\/docker\/Dockerfile:5: alpine:3\.23 is not pinned by a digest/)
})

test("a workflow's service image without a digest fails", () => {
  const f = failuresOf(files => {
    files['.github/workflows/checks.yml'] = `jobs:\n  a:\n    services:\n      db:\n        image: postgres:16-alpine\n`
  })
  assert.equal(f.length, 1)
  assert.match(f[0], /\.github\/workflows\/checks\.yml:5: postgres:16-alpine is not pinned by a digest/)
})

test('an outside image in a compose file without a digest fails; our own image does not', () => {
  const f = failuresOf(files => {
    files['hq/compose.yml'] = `services:\n  a:\n    image: agenthix-hq-server\n  b:\n    image: postgres:16-alpine\n  c:\n    image: caddy:2-alpine@${digest}\n`
  })
  assert.equal(f.length, 1)
  assert.match(f[0], /^hq: hq\/compose\.yml:5: postgres:16-alpine is not pinned by a digest/)
})

test('a string constant naming an outside image without a digest fails; one with a digest, and other strings, do not', () => {
  const f = failuresOf(files => {
    files['hq/compose.yml'] = `services:\n  a:\n    image: postgres:16-alpine@${digest}\n`
    files['host/src/a.ts'] = [
      `export const A = 'postgres:16-alpine@${digest}'`,
      "export const B = 'postgres:16-alpine'",
      "export const C = 'localhost:3000'",
    ].join('\n')
    files['host/package.json'] = { name: 'host' }
  })
  assert.equal(f.length, 1)
  assert.match(f[0], /^host: host\/src\/a\.ts:2: postgres:16-alpine is not pinned by a digest/)
})
