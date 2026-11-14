// node --test scripts/upgrade-test/__tests__/rows.test.mjs
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const { rowsOf, differences } = createRequire(import.meta.url)('../rows.cjs')

test('each mark has its own rows, linked to one another, an organisation to a stored provider', () => {
  const rows = rowsOf('one')
  assert.deepEqual(rows.map(([model]) => model), ['org', 'user', 'project', 'task', 'conversation', 'conversationMessage', 'aiProvider'])
  const by = Object.fromEntries(rows)
  assert.equal(by.task.projectId, by.project.id)
  assert.equal(by.task.onBehalfOfUserId, by.user.id)
  assert.equal(by.conversationMessage.conversationId, by.conversation.id)
  assert.notDeepEqual(rowsOf('two').map(([, r]) => r.id), rows.map(([, r]) => r.id))
  assert.throws(() => rowsOf('One; DROP'), /Not a mark/)
})

test('a check says which row is missing or changed, and nothing when all is there', () => {
  const [, org] = rowsOf('one')[0]
  assert.deepEqual(differences('org', org, { ...org }), [])
  assert.deepEqual(differences('org', org, null), ['org upgrade-test-one-org is missing'])
  assert.deepEqual(differences('org', org, { ...org, name: 'x' }), ['org upgrade-test-one-org: name is "x", not "Upgrade test organisation one"'])
})
