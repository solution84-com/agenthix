import type { SignerIdentity } from '../signing/types'
import type { ArrivedPackage } from './archive'
import type { InstallState, SourceKind } from './decide'
import type { PlanItem } from './plan'

/** A package as a source hands it to the pipeline: its files, the signature beside it, and where it came from. */
export type Arrival = {
  source: SourceKind
  arrived: ArrivedPackage
  /** `package.sigstore.json`, when there is one. Ignored for hq's own image. */
  bundle: Buffer | null
  sourceUrl: string | null
}

/** What installing would do, shown before anything is done (I6), and what the person must confirm. */
export type InstallPreview = {
  source: SourceKind
  sourceUrl: string | null
  state: InstallState
  /** The publisher it installs under; for a new signer, the name offered (`publisherFixed` when it can't change). */
  publisher: string | null
  publisherFixed: boolean
  signer: SignerIdentity | null
  /** "Signed by …": what the signature proves, never more. */
  signedBy: string | null
  trustRoot: { issuedAt: string; expired: boolean } | null
  kind: PlanItem['kind']
  name: string
  version: string
  title: string
  description: string
  licence: string | null
  /** The fingerprint the confirmation must name, so the package installed is the one that was looked at. */
  fingerprint: string
  main: PlanItem
  embedded: PlanItem[]
  summary: string
  warnings: string[]
  /** Set when it can't be installed, whatever is confirmed. */
  refusal: string | null
  needs: { unsignedRead: boolean; publisherChoice: boolean }
}

export type NewPublisherChoice = {
  /** Trust this signer from now on, or install this package once and be asked again next time. */
  choice: 'trust' | 'once'
  /** The publisher segment, a slug; ignored when the signer already has one here. */
  name: string
  /** What "Signed by …" says, the name the administrator gives it. */
  displayName: string
}

export type InstallConfirmation = {
  fingerprint: string
  /** "I've read it", required for an unsigned package (D26). */
  unsignedRead?: boolean
  newPublisher?: NewPublisherChoice
  note?: string
}

export type InstallResult = {
  assetId: string | null
  identity: string
  version: string
  outcome: PlanItem['outcome']
  message: string
}
