/**
 * The state of an arrived package and the publisher it installs under (spec part 3 *The four states*, part 2
 * *Identity*; security review C1). Pure.
 *
 * The publisher is the verified signer's name as this organisation recorded it, never the manifest's claim. Every
 * skill inside a package takes the outer package's publisher, and one that claims another is refused. Unsigned is
 * `unsigned`. `agenthix` is taken only from hq's own image, which is trusted by where it is (adr-0117), or from a
 * signature by Agenthix's own release identity; a package claiming it otherwise is refused.
 */
import { AGENTHIX_PUBLISHER, UNSIGNED_PUBLISHER } from '@agenthix/core'
import type { SignerIdentity, TrustedPublisherRecord, VerifyOutcome } from '../signing/types'
import type { PackageParts } from './parts'

export type SourceKind = 'image' | 'upload' | 'url'
export type InstallState = 'built-in' | 'trusted' | 'new-publisher' | 'unsigned' | 'tampered' | 'unverifiable'

export type Decision = {
  state: InstallState
  /** What every asset in the package installs under; null while a new signer has no name here yet. */
  publisher: string | null
  signer: SignerIdentity | null
  trusted: TrustedPublisherRecord | null
  /** Set when it can't be installed at all, whatever anyone confirms. */
  refusal: string | null
  warnings: string[]
}

const NOTHING = 'Nothing was changed.'

function stateOf(source: SourceKind, outcome: VerifyOutcome | null): Decision {
  const base = { signer: null, trusted: null, refusal: null, warnings: [] as string[] }
  if (source === 'image') return { ...base, state: 'built-in', publisher: AGENTHIX_PUBLISHER }
  if (!outcome) return { ...base, state: 'unverifiable', publisher: null, refusal: `This package's signature wasn't checked, so it won't be installed. ${NOTHING}` }
  switch (outcome.state) {
    case 'trusted':
      return { ...base, state: 'trusted', publisher: outcome.publisher.name, signer: outcome.signer, trusted: outcome.publisher }
    case 'new-publisher':
      return {
        ...base, state: 'new-publisher', publisher: null, signer: outcome.signer,
        refusal: outcome.signer.kind === 'key'
          ? `This is signed with a key this organisation hasn't added. An administrator adds a publisher's public key in the organisation's settings; then install it again. ${NOTHING}`
          : null,
      }
    case 'unsigned':
      return { ...base, state: 'unsigned', publisher: UNSIGNED_PUBLISHER }
    case 'tampered':
      return { ...base, state: 'tampered', publisher: null, refusal: `This was changed after it was signed. It won't be installed. ${NOTHING}` }
    case 'unverifiable':
      return { ...base, state: 'unverifiable', publisher: null, refusal: `This package's signature can't be checked (${outcome.reason}), so it won't be installed. ${NOTHING}` }
  }
}

function claimRefusal(d: Decision, parts: PackageParts): string | null {
  const agenthixSigned = d.state === 'built-in' || (d.state === 'trusted' && d.publisher === AGENTHIX_PUBLISHER)
  const claims = [parts.claim, ...parts.embedded.map(e => e.claim)]
  if (!agenthixSigned && claims.includes(AGENTHIX_PUBLISHER)) {
    return `This package says it is published by Agenthix, but Agenthix didn't sign it. It won't be installed. ${NOTHING}`
  }
  if (d.state === 'built-in' && claims.some(c => c !== null && c !== AGENTHIX_PUBLISHER)) {
    return `A package in hq's image names a publisher other than Agenthix. It won't be installed. ${NOTHING}`
  }
  const stray = parts.embedded.find(e => e.claim !== null && e.claim !== parts.claim)
  if (stray) {
    return `The skill ${stray.name} inside this package says it is published by ${stray.claim}, but everything in a package is published by whoever signed the package. It won't be installed. ${NOTHING}`
  }
  return null
}

export function decide(source: SourceKind, outcome: VerifyOutcome | null, parts: PackageParts): Decision {
  const d = stateOf(source, outcome)
  if (d.refusal) return d
  const refusal = claimRefusal(d, parts)
  if (refusal) return { ...d, refusal }
  if (d.state === 'trusted' && parts.claim !== null && parts.claim !== d.publisher) {
    d.warnings.push(`The package calls its publisher ${parts.claim}; it installs as ${d.publisher}, the name this organisation gave its signer.`)
  }
  return d
}
