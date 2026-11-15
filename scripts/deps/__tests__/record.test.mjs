import assert from 'node:assert/strict'
import { test } from 'node:test'
import { raiseEpoch, summary, taken } from '../record.mjs'

const npm = { moves: [{ module: 'site', name: 'zod', from: '4.1.0', to: '4.1.5' }], others: { site: 3, hq: 1 } }
const images = [{ module: 'hq', name: 'caddy', from: '2-alpine@eb4d35b7452d', to: '2-alpine@003a97808e78' }, { module: 'Node', name: 'Node.js', from: '24.14.1', to: '24.22.3' }]
const actions = [{ module: 'actions', name: 'docker/login-action', from: 'v4.6.0', to: 'v4.8.0' }]

test('the record holds the date and what moved, by module @SC-2161', () => {
  assert.deepEqual(taken('2026-12-01', npm, images, actions), {
    date: '2026-12-01',
    moved: {
      Node: [{ name: 'Node.js', from: '24.14.1', to: '24.22.3' }],
      actions: [{ name: 'docker/login-action', from: 'v4.6.0', to: 'v4.8.0' }],
      hq: [{ name: 'caddy', from: '2-alpine@eb4d35b7452d', to: '2-alpine@003a97808e78' }],
      site: [{ name: 'zod', from: '4.1.0', to: '4.1.5' }],
    },
    others: { hq: 1, site: 3 },
  })
})

test('the summary lists each module, version to version, and says when Node moved @SC-2161', () => {
  const text = summary(taken('2026-12-01', npm, images, actions))
  assert.match(text, /\*\*site\*\*[\s\S]*\| zod \| 4\.1\.0 \| 4\.1\.5 \|[\s\S]*3 other packages/)
  assert.match(text, /\| docker\/login-action \| v4\.6\.0 \| v4\.8\.0 \|/)
  assert.match(text, /\*\*hq\*\*[\s\S]*1 other package in its lockfile/)
  assert.match(text, /Node moved to 24\.22\.3/)
})

test('nothing moved says so @SC-2161', () => {
  const text = summary(taken('2026-12-01', { moves: [], others: {} }, [], []))
  assert.match(text, /Nothing moved/)
  assert.doesNotMatch(text, /Node moved/)
})

test('the epoch is raised by one, the rest of parts.json left as it is @SC-2161', () => {
  const text = '{\n  "rebuildEpoch": 4,\n  "parts": { "a": {} }\n}\n'
  assert.equal(raiseEpoch(text), '{\n  "rebuildEpoch": 5,\n  "parts": { "a": {} }\n}\n')
  assert.throws(() => raiseEpoch('{"parts":{}}'), /rebuildEpoch/)
})
