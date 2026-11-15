import { test } from 'node:test'
import assert from 'node:assert/strict'
import { skipLine, squashedAt } from '../regression/squashed.mjs'

const release = ['20261021000000_init', '20261101000000_runs']

test('the same history is not squashed @SC-2168', () => {
  assert.equal(squashedAt(release, release), null)
})

test('a tree that only adds migrations is not squashed @SC-2168', () => {
  assert.equal(squashedAt(release, [...release, '20261120000000_more']), null)
})

test('a tree with one new initial migration is squashed @SC-2168', () => {
  assert.equal(squashedAt(release, ['20270101000000_init']), '20261021000000_init')
})

test('one app squashed and the other not are judged apart @SC-2168', () => {
  const hq = squashedAt(release, ['20270101000000_init'])
  const site = squashedAt(['20261021000000_init'], ['20261021000000_init', '20261120000000_more'])
  assert.equal(hq, '20261021000000_init')
  assert.equal(site, null)
})

test('both squashed @SC-2168', () => {
  assert.ok(squashedAt(release, ['20270101000000_init']))
  assert.ok(squashedAt(['20261010000000_init'], ['20270101000000_init']))
})

test('a release with no migrations is not squashed @SC-2168', () => {
  assert.equal(squashedAt([], ['20270101000000_init']), null)
})

test('the skip line says why and what happens instead @SC-2168', () => {
  assert.equal(skipLine('v0.1.0-alpha.5', 'hq', '20261021000000_init'),
    "Skipped: the migrations were squashed after v0.1.0-alpha.5 (hq's first migration there, 20261021000000_init, is not in this tree). An installation of v0.1.0-alpha.5 is reinstalled, not upgraded.")
})
