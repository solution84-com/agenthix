/**
 * How the console proves itself to hq (C8): the lasting credential a one-time code bought, kept in the state folder,
 * when it holds one; otherwise, on hq's machine, the pairing secret set at install; otherwise, the first time only,
 * the lookup derived from its one-time code — never the code, which hq must not learn when it is a handover code.
 */
import type { ConsoleCodeKind } from '@agenthix/core'
import type { StateFolder } from '../state/folder'

const CREDENTIAL_FILE = 'hq-credential'
const CREDENTIAL = /^[\x21-\x7e]{16,512}$/

/** `handover`: the code came from the running Fleet Console, so a credential may come only with its machines. */
export type LinkProof = { kind: 'bearer'; value: string } | { kind: 'code'; lookup: string; handover: boolean }

/** The one-time code the console was started with: its lookup, and what its first character says it is for. */
export type StartCode = { lookup: string; kind: ConsoleCodeKind }

export class HqCredentials {
  constructor(
    private readonly state: StateFolder,
    private readonly pairingSecret: string | null,
    private readonly code: StartCode | null,
  ) {}

  /** What to present on the next connection; null when the console holds nothing hq would accept. */
  current(): LinkProof | null {
    // A lasting credential comes first: once a code has been redeemed, hq refuses the pairing secret.
    const stored = this.stored()
    if (stored) return { kind: 'bearer', value: stored }
    if (this.pairingSecret) return { kind: 'bearer', value: this.pairingSecret }
    return this.code ? { kind: 'code', lookup: this.code.lookup, handover: this.code.kind === 'handover' } : null
  }

  /** The lasting credential a code bought, which the move check proves; null while it holds none. */
  lasting(): string | null {
    return this.stored()
  }

  /** Keeps the credential hq gave for the code. Refuses one that is not a plain token, rather than storing it. */
  saveRedeemed(credential: unknown): void {
    if (typeof credential !== 'string' || !CREDENTIAL.test(credential)) throw new Error('hq sent a credential that is not a token.')
    this.state.writePrivate([CREDENTIAL_FILE], credential)
  }

  private stored(): string | null {
    let text: string | null
    try {
      text = this.state.readText(CREDENTIAL_FILE)
    } catch {
      return null
    }
    const value = text?.trim()
    return value && CREDENTIAL.test(value) ? value : null
  }
}
