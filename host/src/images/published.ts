/**
 * Where the published images are and who signs them (host-management spec §11, adr-0117). Every image is built
 * and signed by one workflow of this repository, `.github/workflows/publish-images.yml`, run for a version tag
 * (a release's, or a pre-release's);
 * Sigstore's keyless signing binds each signature to that workflow at that tag, so the host service checks the
 * exact signer it expects for the version it runs. The workflow derives the same registry from the repository's
 * owner, and a test holds the two together.
 *
 * The host service trusts a list of publishers, so a release can publish under a new name and an old one at once and
 * be trusted under both; the first is where this release's images are fetched from. An image is accepted when its
 * name is one of an entry's and that entry's signer signed it, each checked exactly as strictly as the one was.
 */
import { BRANDING, imageName, isPublishedVersion } from '@agenthix/core'

/** The images this repository publishes, by the part `imageName` turns into a name. */
export const PUBLISHED_PARTS = ['hq-server', 'hq-web', 'relay', 'site-server', 'agent', 'executor', 'host', 'console'] as const
export type PublishedPart = (typeof PUBLISHED_PARTS)[number]

export type TrustedPublisher = {
  /** The registry and owner its images are under: `<registry>/<imagePrefix>-<part>`. */
  registry: string
  imagePrefix: string
  /** The repository and workflow whose run, at the version's tag, signs them. */
  repository: string
  workflow: string
  /** The identity provider whose token the keyless signature's certificate was issued for. */
  issuer: string
}

/** What cosign is told to require of a signature's certificate: this exact identity, from this exact issuer. */
export type Signer = { identity: string; issuer: string }

export const TRUSTED_PUBLISHERS: readonly [TrustedPublisher, ...TrustedPublisher[]] = [
  {
    registry: 'ghcr.io/solution84-com',
    imagePrefix: BRANDING.imagePrefix,
    repository: 'https://github.com/solution84-com/agenthix',
    workflow: '.github/workflows/publish-images.yml',
    /** GitHub Actions' identity provider, which issues the token keyless signing exchanges for a certificate. */
    issuer: 'https://token.actions.githubusercontent.com',
  },
]
const [CURRENT] = TRUSTED_PUBLISHERS

export const REGISTRY = CURRENT.registry
export const PUBLISHING_REPOSITORY = CURRENT.repository
export const PUBLISHING_WORKFLOW = CURRENT.workflow
export const SIGNING_ISSUER = CURRENT.issuer

/** A release number or a pre-release of one, the forms the workflow runs for; anything else (`dev`) is a local build. */
export { isPublishedVersion }

/** A release proper, not a pre-release: the only kind an upgrade is offered or chosen by itself. */
export const isReleaseVersion = (version: string) => /^\d+\.\d+\.\d+$/.test(version)

/** The signer a publisher's image of `version` carries: its workflow, run for that version's tag. */
export const signerFor = (version: string, publisher: TrustedPublisher = CURRENT): Signer => ({
  identity: `${publisher.repository}/${publisher.workflow}@refs/tags/v${version}`,
  issuer: publisher.issuer,
})

const repositoryOf = (publisher: TrustedPublisher, part: string) => `${publisher.registry}/${publisher.imagePrefix}-${part}`

/**
 * The signers an image may carry, one for each trusted publisher whose image names include its name (tag or digest
 * aside); none for a name outside the list.
 */
export function trustedSigners(ref: string, version: string, publishers: readonly TrustedPublisher[] = TRUSTED_PUBLISHERS): Signer[] {
  const name = ref.replace(/@sha256:[0-9a-f]+$/, '').replace(/:[^/:@]+$/, '')
  const signers: Signer[] = []
  for (const publisher of publishers) {
    if (!PUBLISHED_PARTS.some(part => repositoryOf(publisher, part) === name)) continue
    const signer = signerFor(version, publisher)
    if (!signers.some(s => s.identity === signer.identity && s.issuer === signer.issuer)) signers.push(signer)
  }
  return signers
}

/** A published image by its tag in the current publisher's registry; a local build by its bare name, never fetched. */
export function imageRef(part: string, version: string): string {
  return isPublishedVersion(version) ? `${repositoryOf(CURRENT, part)}:${version}` : imageName(part)
}

/** A reference's repository, and its tag and digest when it names them; a bare image id has neither. */
export function parseReference(ref: string): { name: string; tag: string | null; digest: string | null } {
  const at = /@(sha256:[0-9a-f]{64})$/.exec(ref)
  const rest = at ? ref.slice(0, at.index) : ref
  const tagged = /^(.*[^/:]):([A-Za-z0-9_][A-Za-z0-9_.-]{0,127})$/.exec(rest)
  return tagged
    ? { name: tagged[1], tag: tagged[2], digest: at?.[1] ?? null }
    : { name: rest, tag: null, digest: at?.[1] ?? null }
}

/**
 * The version a host service started from `ref` is: the tag, when `ref` is a trusted publisher's host image by a
 * published version's tag (with or without a digest after it). Null for anything else — a local build's name, a bare
 * digest, another repository — which is a development build.
 */
export function hostVersionOf(ref: string, publishers: readonly TrustedPublisher[] = TRUSTED_PUBLISHERS): string | null {
  const { name, tag } = parseReference(ref)
  if (!tag || !isPublishedVersion(tag)) return null
  return publishers.some(p => repositoryOf(p, 'host') === name) ? tag : null
}

/** Whether `ref` names one of a trusted publisher's images, whatever its tag or digest: a published image, never a local build. */
export function fromTrustedPublisher(ref: string, publishers: readonly TrustedPublisher[] = TRUSTED_PUBLISHERS): boolean {
  const { name } = parseReference(ref)
  return publishers.some(p => PUBLISHED_PARTS.some(part => repositoryOf(p, part) === name))
}

/** A pinned image that still says which version it was signed as: `<repository>:<version>@sha256:…`. */
export function versionedRef(pinned: string, version: string): string {
  const { name, digest } = parseReference(pinned)
  if (!digest) throw new Error(`${pinned} is not fixed by a digest`)
  return `${name}:${version}@${digest}`
}

/** An image fixed to the content its signature covers: `<repository>@sha256:…`, with any tag dropped. */
export function pinnedRef(ref: string, digest: string): string {
  return `${ref.replace(/:[^/:@]+$/, '')}@${digest}`
}

export const isDigest = (value: string) => /^sha256:[0-9a-f]{64}$/.test(value)

/**
 * hq's and the site's database, Docker's official image. It is not ours to sign, so it is fixed by the digest of
 * its multi-platform index: what runs is exactly the content this release was tested with, whatever the registry
 * later serves under the tag. Moved forward deliberately, with a release.
 */
export const POSTGRES_IMAGE = 'postgres:16-alpine@sha256:f377d590e5474681d4d7838635031a2b50647923b7abfa803ce9b5ff35d5c663'
