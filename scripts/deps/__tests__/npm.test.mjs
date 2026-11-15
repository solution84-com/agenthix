import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lockMoves } from '../npm.mjs'

const lock = versions => ({ packages: { '': {}, ...Object.fromEntries(Object.entries(versions).map(([k, v]) => [`node_modules/${k}`, { version: v }])) } })

test('the packages a module names move version to version; the rest are counted', () => {
  const pkg = { dependencies: { zod: '^4.0.0', '@scope/a': '^1.0.0' }, devDependencies: { vitest: '^3.2.0' } }
  const before = lock({ zod: '4.1.0', '@scope/a': '1.0.0', vitest: '3.2.1', 'deep/x': '1.0.0', 'node_modules/b/node_modules/c': '2.0.0', gone: '1.0.0' })
  const after = lock({ zod: '4.1.5', '@scope/a': '1.0.0', vitest: '3.2.4', 'deep/x': '1.0.1', 'node_modules/b/node_modules/c': '2.0.0', added: '1.0.0' })
  assert.deepEqual(lockMoves('site', pkg, before, after), {
    moves: [
      { module: 'site', name: 'vitest', from: '3.2.1', to: '3.2.4' },
      { module: 'site', name: 'zod', from: '4.1.0', to: '4.1.5' },
    ],
    others: 3,
  })
})

test('nothing moved, nothing listed', () => {
  const pkg = { dependencies: { zod: '^4.0.0' } }
  assert.deepEqual(lockMoves('core', pkg, lock({ zod: '4.1.0' }), lock({ zod: '4.1.0' })), { moves: [], others: 0 })
})
