/**
 * A trusted publisher as an administrator records it (spec part 3 *Who signs*, P1; security review H2), checked
 * before anything is stored. A keyless publisher is bound exactly: the issuer, the certificate identity less the ref
 * it ran from, and, for a workflow, the source repository with the refs that may sign (tags, or one named branch). A
 * key-pair publisher is its public key, stored by its fingerprint. Every string is compared exactly when a signature
 * is checked (`signing/publishers.ts`), so anything here that could never match, or reads like a pattern, is refused
 * rather than stored. Pure.
 */
import { keyIdOf, parsePublicKey, signerString } from '../signing'

export type KeylessPublisherInput = {
  kind: 'keyless'
  name: string
  displayName?: string
  issuer: string
  identity: string
  /** The certificate's source repository, as it gives it (`https://github.com/acme/skills`); null for a person (W3). */
  repository: string | null
  allowTags: boolean
  /** The one branch that may sign, such as the default branch; null for none. */
  allowedBranch: string | null
}

export type KeyPublisherInput = { kind: 'key'; name: string; displayName?: string; publicKey: string }

export type PublisherInput = KeylessPublisherInput | KeyPublisherInput

/** The columns a new or restored `TrustedPublisher` row takes, bar who added it. */
export type PublisherBinding = {
  name: string
  displayName: string
  signerKind: 'KEYLESS' | 'KEY'
  signerIdentity: string
  issuer: string | null
  certificateIdentity: string | null
  repository: string | null
  allowTags: boolean
  allowedBranch: string | null
  publicKey: string | null
}

export type BindingResult = { ok: true; binding: PublisherBinding } | { ok: false; message: string }

const NOTHING = 'Nothing was changed.'
const MAX_FIELD = 1000
const PATTERN_CHARACTERS = /[*?[\]^$\\|(){}\s]/
const BRANCH = /^[A-Za-z0-9._/-]+$/

const refuse = (message: string): BindingResult => ({ ok: false, message: `${message} ${NOTHING}` })

function httpsAddress(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.href.length > 'https://'.length && !url.username && !url.password
  } catch {
    return false
  }
}

function displayNameOf(input: PublisherInput): string {
  return (typeof input.displayName === 'string' ? input.displayName.trim().slice(0, 100) : '') || input.name
}

function branchProblem(branch: string): string | null {
  if (branch.length > 255 || !BRANCH.test(branch)) return 'A branch name uses letters, digits, dots, hyphens, underscores and slashes only.'
  if (branch.startsWith('refs/') || branch.startsWith('/') || branch.endsWith('/') || branch.includes('..') || branch.includes('//')) {
    return `Name the branch itself, such as “main”, not a ref or a path.`
  }
  return null
}

export function keylessBinding(input: KeylessPublisherInput): BindingResult {
  const issuer = typeof input.issuer === 'string' ? input.issuer.trim() : ''
  const identity = typeof input.identity === 'string' ? input.identity.trim() : ''
  const repository = typeof input.repository === 'string' && input.repository.trim() !== '' ? input.repository.trim() : null
  const allowedBranch = typeof input.allowedBranch === 'string' && input.allowedBranch.trim() !== '' ? input.allowedBranch.trim() : null
  const allowTags = input.allowTags === true

  if (!issuer || issuer.length > MAX_FIELD || !httpsAddress(issuer)) {
    return refuse('Give the identity provider that issues the signing certificate, as its https:// address (for GitHub Actions, https://token.actions.githubusercontent.com).')
  }
  if (!identity || identity.length > MAX_FIELD) return refuse('Give the exact certificate identity: the workflow\'s address, or the person\'s email.')
  if (PATTERN_CHARACTERS.test(identity)) {
    return refuse('The certificate identity is matched exactly, never as a pattern: give it without wildcards, spaces or pattern characters.')
  }
  if (/@refs\//.test(identity)) {
    return refuse('Leave the ref off the identity (the part from “@refs/”): a workflow\'s ref is checked on its own, against the tags or branch chosen here.')
  }
  if (repository === null) {
    // A person's identity (W3): bound by issuer and identity alone, and such a certificate carries no ref.
    if (allowedBranch !== null || allowTags) return refuse('A person\'s identity signs from no repository, so it takes no tags or branch. Give the repository too, or leave them off.')
    if (identity.startsWith('https://')) return refuse('A workflow signs from a repository: give the repository it signs from.')
  } else {
    if (repository.length > MAX_FIELD || !httpsAddress(repository)) {
      return refuse('Give the repository as the certificate names it, its https:// address (https://github.com/acme/skills).')
    }
    if (repository.endsWith('/') || repository.endsWith('.git')) {
      return refuse('Give the repository\'s address as the certificate names it, without a trailing slash or “.git”.')
    }
    if (!allowTags && allowedBranch === null) {
      return refuse('Choose what may sign: tags, a named branch, or both. A feature branch never signs as this publisher.')
    }
    if (allowedBranch !== null) {
      const problem = branchProblem(allowedBranch)
      if (problem) return refuse(problem)
    }
  }
  return {
    ok: true,
    binding: {
      name: input.name,
      displayName: displayNameOf(input),
      signerKind: 'KEYLESS',
      signerIdentity: signerString({ kind: 'keyless', issuer, identity, repository, ref: null }),
      issuer,
      certificateIdentity: identity,
      repository,
      allowTags: repository === null ? false : allowTags,
      allowedBranch: repository === null ? null : allowedBranch,
      publicKey: null,
    },
  }
}

export function keyBinding(input: KeyPublisherInput): BindingResult {
  const pem = typeof input.publicKey === 'string' ? input.publicKey.trim() : ''
  // Only a public key's own PEM: a private key would also yield one, and must never be pasted here.
  const publicPem = pem.length <= 16_384 && pem.startsWith('-----BEGIN PUBLIC KEY-----') && !pem.includes('PRIVATE')
  const key = publicPem ? parsePublicKey(pem) : null
  if (!key) return refuse('That is not a public key. Paste the publisher\'s public key in PEM form (it begins “-----BEGIN PUBLIC KEY-----”).')
  const keyId = keyIdOf(key)
  return {
    ok: true,
    binding: {
      name: input.name,
      displayName: displayNameOf(input),
      signerKind: 'KEY',
      signerIdentity: signerString({ kind: 'key', keyId }),
      issuer: null,
      certificateIdentity: null,
      repository: null,
      allowTags: false,
      allowedBranch: null,
      // Stored as the key itself re-encoded, so what is checked is exactly what the fingerprint names.
      publicKey: key.export({ type: 'spki', format: 'pem' }).toString(),
    },
  }
}

export function publisherBinding(input: unknown): BindingResult {
  const value = input as Partial<PublisherInput> | null
  if (!value || typeof value !== 'object' || typeof value.name !== 'string') return refuse('Give the publisher a name.')
  if (value.kind === 'keyless') return keylessBinding(value as KeylessPublisherInput)
  if (value.kind === 'key') return keyBinding(value as KeyPublisherInput)
  return refuse('Say whether this publisher signs keyless, with an identity, or with a key pair.')
}

/** What may sign, in words: "tags", "branch main", "tags and branch main". */
export function refsAllowed(row: { repository: string | null; allowTags: boolean; allowedBranch: string | null }): string | null {
  if (row.repository === null) return null
  const parts = [row.allowTags ? 'tags' : null, row.allowedBranch ? `branch ${row.allowedBranch}` : null].filter(Boolean)
  return parts.join(' and ') || null
}
