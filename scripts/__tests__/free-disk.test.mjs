import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_FLOOR_GB, floorGb, refusal } from '../images/free-disk.mjs'

test('a build with room above the floor is allowed', () => {
  assert.equal(refusal({ freeBytes: 30e9, floor: DEFAULT_FLOOR_GB, where: '/var/lib/docker' }), null)
})

test('below the floor it refuses, saying how much is free, the floor and how to make room', () => {
  const message = refusal({ freeBytes: 4.2e9, floor: 20, where: '/var/lib/docker' })
  assert.match(message, /Only 4\.2 GB is free on \/var\/lib\/docker/)
  assert.match(message, /at least 20 GB/)
  assert.match(message, /docker builder prune/)
  assert.match(message, /Nothing was built\.$/)
})

test('the floor comes from IMAGE_BUILD_MIN_FREE_GB, and a value that is not a number is refused', () => {
  assert.equal(floorGb({}), 20)
  assert.equal(floorGb({ IMAGE_BUILD_MIN_FREE_GB: '5' }), 5)
  assert.throws(() => floorGb({ IMAGE_BUILD_MIN_FREE_GB: 'lots' }), /not a number of gigabytes/)
})
