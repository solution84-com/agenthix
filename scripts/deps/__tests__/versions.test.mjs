import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newestWithin, parseVersionTag } from '../versions.mjs'

test('a tag splits into its prefix, numbers and suffix; a tag with no leading number has no version', () => {
  assert.deepEqual(parseVersionTag('24.14.1-alpine3.23'), { prefix: '', numbers: [24, 14, 1], suffix: '-alpine3.23' })
  assert.deepEqual(parseVersionTag('v3.1.3'), { prefix: 'v', numbers: [3, 1, 3], suffix: '' })
  assert.deepEqual(parseVersionTag('2-alpine'), { prefix: '', numbers: [2], suffix: '-alpine' })
  assert.equal(parseVersionTag('latest'), null)
  assert.equal(parseVersionTag('bookworm'), null)
})

test('the newest tag of the same shape and major is chosen, never a lower one', () => {
  const tags = ['24.14.1-alpine3.23', '24.22.3-alpine3.23', '24.9.0-alpine3.23', '26.1.0-alpine3.23', '24.23.0-alpine3.24', '24.22-alpine3.23', '24.30.0-alpine3.23-rc']
  assert.equal(newestWithin('24.14.1-alpine3.23', tags), '24.22.3-alpine3.23')
  assert.equal(newestWithin('24.30.1-alpine3.23', tags), '24.30.1-alpine3.23')
})

test('a tag with fewer numbers moves within its major (Alpine 3.23 to 3.24), and a major-only tag stays', () => {
  assert.equal(newestWithin('3.23', ['3.22', '3.23', '3.24', '3.24.1', '4.0', 'edge']), '3.24')
  assert.equal(newestWithin('2-alpine', ['2-alpine', '3-alpine', '2.10-alpine']), '2-alpine')
})

test('a v prefix is kept, and a prerelease is never taken', () => {
  assert.equal(newestWithin('v3.1.3', ['v3.1.4', 'v3.2.0-rc.1', '3.9.9', 'v4.0.0', 'v3.1.10']), 'v3.1.10')
})

test('a tag with no version is kept as it is', () => {
  assert.equal(newestWithin('latest', ['latest', '1.0.0']), 'latest')
})
