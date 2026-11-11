// What counts as agreeing to the contributor licence agreement (CLA.md), and the record of who has. No I/O here: the
// check that talks to GitHub is check.mjs.

/** The agreement's version, from its closing line: "This agreement is version N." */
export function claVersion(claText) {
  const match = /This agreement is version (\d+)\./.exec(claText)
  if (!match) throw new Error('CLA.md does not say its version ("This agreement is version N.").')
  return Number(match[1])
}

export function agreementSentence(version) {
  return `I have read the Contributor Licence Agreement, version ${version}, and I agree to it.`
}

const plain = (text) => text.trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase()

/** The whole reply is the sentence: nothing added, nothing quoted from someone else. */
export function isAgreement(body, version) {
  return plain(body ?? '') === plain(agreementSentence(version))
}

const MAINTAINERS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

/** Why a pull request's author is not asked, or null when they are. */
export function exemption({ type, association }) {
  if (type === 'Bot') return 'a bot'
  if (MAINTAINERS.has(association)) return 'a maintainer'
  return null
}

/** By the account's id, which a renamed account keeps. */
export function hasAgreed(record, userId, version) {
  return record.signatures.some((s) => s.id === userId && s.version === version)
}

export function withSignature(record, signature) {
  if (hasAgreed(record, signature.id, signature.version)) return record
  return { ...record, signatures: [...record.signatures, signature] }
}
