import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agreementSentence, claVersion, exemption, hasAgreed, isAgreement, withSignature } from '../agreement.mjs'

const CLA = '# Contributor Licence Agreement\n\nTerms.\n\n---\n\nThis agreement is version 3. A later version applies only…\n'

test('the version is read from the agreement itself, and an agreement without one is refused', () => {
  assert.equal(claVersion(CLA), 3)
  assert.throws(() => claVersion('# An agreement with no version line'), /does not say its version/)
})

test('the sentence to reply with names the version agreed to', () => {
  assert.equal(agreementSentence(3), 'I have read the Contributor Licence Agreement, version 3, and I agree to it.')
})

test('a reply agrees only when it is the sentence, whatever its case, spacing or final full stop', () => {
  assert.equal(isAgreement('I have read the Contributor Licence Agreement, version 3, and I agree to it.', 3), true)
  assert.equal(isAgreement('  i have read the contributor licence agreement,\nversion 3, and I agree to it  ', 3), true)
  assert.equal(isAgreement('I have read the Contributor Licence Agreement, version 2, and I agree to it.', 3), false)
  assert.equal(isAgreement('I have read the Contributor Licence Agreement, version 3, and I agree to it. But not part 4.', 3), false)
  assert.equal(isAgreement('> I have read the Contributor Licence Agreement, version 3, and I agree to it.', 3), false)
  assert.equal(isAgreement('', 3), false)
})

test('bots and the maintainers are not asked; everyone else is', () => {
  assert.equal(exemption({ type: 'Bot', association: 'NONE' }), 'a bot')
  assert.equal(exemption({ type: 'User', association: 'OWNER' }), 'a maintainer')
  assert.equal(exemption({ type: 'User', association: 'MEMBER' }), 'a maintainer')
  assert.equal(exemption({ type: 'User', association: 'COLLABORATOR' }), 'a maintainer')
  assert.equal(exemption({ type: 'User', association: 'CONTRIBUTOR' }), null)
  assert.equal(exemption({ type: 'User', association: 'FIRST_TIME_CONTRIBUTOR' }), null)
  assert.equal(exemption({ type: 'User', association: 'NONE' }), null)
})

test('an agreement counts for the account that made it, by its id, and for that version only', () => {
  const record = { signatures: [{ login: 'avery-old-name', id: 42, version: 3 }] }
  assert.equal(hasAgreed(record, 42, 3), true)
  assert.equal(hasAgreed(record, 43, 3), false)
  assert.equal(hasAgreed(record, 42, 4), false)
  assert.equal(hasAgreed({ signatures: [] }, 42, 3), false)
})

test('adding an agreement keeps the ones before it, and adds nothing when it is already there', () => {
  const before = { about: 'kept', signatures: [{ login: 'avery', id: 42, version: 3 }] }
  const after = withSignature(before, { login: 'jordan', id: 7, version: 3, agreedAt: '2026-11-11T00:00:00Z' })
  assert.deepEqual(after.signatures.map((s) => s.id), [42, 7])
  assert.equal(after.about, 'kept')
  assert.equal(before.signatures.length, 1)
  assert.equal(withSignature(after, { login: 'jordan', id: 7, version: 3 }), after)
})
