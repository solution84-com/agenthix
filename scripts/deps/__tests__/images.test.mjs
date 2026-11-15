import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imageRefsOf, parseComposeImages, parseFromLines, parseSourceImages, planImages, replaceNodeVersion } from '../images.mjs'

const d = c => `sha256:${c.repeat(64)}`

test('a pinned FROM line is read, with or without a platform; a stage name or an unpinned image is not', () => {
  const text = [
    `FROM --platform=$BUILDPLATFORM node:24.14.1-alpine3.23@${d('a')} AS robots`,
    'FROM wasp AS web-build',
    `FROM ghcr.io/sigstore/cosign/cosign:v3.1.3@${d('b')} AS cosign`,
    'FROM alpine:3 AS x',
  ].join('\n')
  assert.deepEqual(parseFromLines(text), [
    { name: 'node', tag: '24.14.1-alpine3.23', digest: d('a') },
    { name: 'ghcr.io/sigstore/cosign/cosign', tag: 'v3.1.3', digest: d('b') },
  ])
})

test('Node moves to one version that every variant in use has, within its major', () => {
  const pins = [
    { name: 'node', tag: '24.14.1-alpine3.23', digest: d('a') },
    { name: 'node', tag: '24.14.1-bookworm-slim', digest: d('b') },
  ]
  const tags = { node: ['24.22.3-alpine3.23', '24.23.0-bookworm-slim', '24.22.3-bookworm-slim', '26.0.0-alpine3.23', '26.0.0-bookworm-slim'] }
  assert.deepEqual(planImages(pins, tags), new Map([
    ['node:24.14.1-alpine3.23', '24.22.3-alpine3.23'],
    ['node:24.14.1-bookworm-slim', '24.22.3-bookworm-slim'],
  ]))
})

test('other images move within their major, and a major-only tag keeps its tag (its digest may still move)', () => {
  const pins = [
    { name: 'alpine', tag: '3.23', digest: d('a') },
    { name: 'caddy', tag: '2-alpine', digest: d('b') },
    { name: 'ghcr.io/sigstore/cosign/cosign', tag: 'v3.1.3', digest: d('c') },
  ]
  const tags = { alpine: ['3.24', '4.0'], caddy: ['3-alpine', '2-alpine'], 'ghcr.io/sigstore/cosign/cosign': ['v3.1.4', 'v3.1.4-dev', 'v4.0.0'] }
  assert.deepEqual(planImages(pins, tags), new Map([
    ['alpine:3.23', '3.24'],
    ['caddy:2-alpine', '2-alpine'],
    ['ghcr.io/sigstore/cosign/cosign:v3.1.3', 'v3.1.4'],
  ]))
})

test('the old Node version is replaced where it stands alone, never inside another number', () => {
  const text = 'Node 24.14.1 or later; node:24.14.1-alpine3.23; ">=24.14.1"; 124.14.1; 24.14.10; §24.14.1.7'
  assert.equal(replaceNodeVersion(text, '24.14.1', '24.22.3'),
    'Node 24.22.3 or later; node:24.22.3-alpine3.23; ">=24.22.3"; 124.14.1; 24.14.10; §24.14.1.7')
})

test('a compose file\'s pinned image is read; our own and an unpinned one are not', () => {
  const text = [
    'services:',
    '  db:',
    `    image: postgres:16-alpine@${d('a')}`,
    `    image: "caddy:2.10.2-alpine@${d('b')}" # quoted`,
    '    image: postgres:16-alpine',
    '    image: agenthix-hq-server',
  ].join('\n')
  assert.deepEqual(parseComposeImages(text), [
    { name: 'postgres', tag: '16-alpine', digest: d('a') },
    { name: 'caddy', tag: '2.10.2-alpine', digest: d('b') },
  ])
})

test('a pinned image in a source string constant is read, in any kind of quote', () => {
  const text = [
    `export const A = 'postgres:16-alpine@${d('a')}'`,
    `const b = "ghcr.io/x/y:v1.2.3@${d('b')}"`,
    'const c = `localhost:3000`',
    `const e = 'postgres:16-alpine@${d('c')}.old'`,
  ].join('\n')
  assert.deepEqual(parseSourceImages(text), [
    { name: 'postgres', tag: '16-alpine', digest: d('a') },
    { name: 'ghcr.io/x/y', tag: 'v1.2.3', digest: d('b') },
  ])
})

test('each file kind is read by its own rule, and a test file\'s example strings are not images', () => {
  const ref = `postgres:16-alpine@${d('a')}`
  assert.equal(imageRefsOf('hq/compose.yml', `image: ${ref}`).length, 1)
  assert.equal(imageRefsOf('docker-compose.yml', `image: ${ref}`).length, 1)
  assert.equal(imageRefsOf('hq/docker/Dockerfile', `FROM ${ref}`).length, 1)
  assert.equal(imageRefsOf('hq/docker/relay.Dockerfile', `FROM ${ref}`).length, 1)
  assert.equal(imageRefsOf('host/src/images/published.ts', `const X = '${ref}'`).length, 1)
  assert.equal(imageRefsOf('host/src/images/published.test.ts', `const X = '${ref}'`).length, 0)
  assert.equal(imageRefsOf('host/src/__tests__/x.ts', `const X = '${ref}'`).length, 0)
  assert.equal(imageRefsOf('README.md', `image: ${ref}`).length, 0)
})
