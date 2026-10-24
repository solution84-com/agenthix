/**
 * The images an install runs: each one's signature checked before anything is fetched, then fetched by the digest
 * the signature covers (host-management spec §11, adr-0117). A host service of a published version runs only
 * published, signed images. Only a development build — one started from an image built on the machine, whose version
 * is `dev` (`ownVersion.ts`) — runs images built on the machine, and it never fetches them. Anything else fails closed.
 */
import { Refusal } from '../owner/results'
import { product } from '../cli/words'
import type { Context } from '../service/context'
import { imageRef, isPublishedVersion, pinnedRef, TRUSTED_PUBLISHERS, trustedSigners, type PublishedPart, type Signer, type TrustedPublisher } from './published'
import type { SignatureCheck } from './signatures'

/** What each image runs as, fixed when its signature was checked: `<repository>@sha256:…`, or a local build's name. */
export type ImagePins = Partial<Record<PublishedPart, string>>

export type WantedImage = { part: PublishedPart; version: string }

/** A host service started from a local build, not a published image: the one kind that may run images built there. */
export const isDevelopmentBuild = (hostServiceVersion: string) => hostServiceVersion === 'dev'

const SIGNER = `${product}'s publishing workflow`
const NOTHING = 'Nothing was fetched or started.'

/** A signature check, or an image whose name no trusted publisher has, which is never checked. */
export type TrustCheck = SignatureCheck | { kind: 'untrusted' }

/**
 * Accepted when a signer of a publisher whose names include the image's signed it. Only `wrongSigner` moves on to
 * the next signer: unsigned, missing and unchecked hold whoever the signer is, and fail closed.
 */
export async function checkTrusted(
  check: (ref: string, signer: Signer) => Promise<SignatureCheck>, ref: string, version: string,
  publishers: readonly TrustedPublisher[] = TRUSTED_PUBLISHERS,
): Promise<TrustCheck> {
  const signers = trustedSigners(ref, version, publishers)
  if (signers.length === 0) return { kind: 'untrusted' }
  for (const signer of signers) {
    const result = await check(ref, signer)
    if (result.kind !== 'wrongSigner') return result
  }
  return { kind: 'wrongSigner' }
}

function refusalFor(ref: string, version: string, check: Exclude<TrustCheck, { kind: 'signed' }>): Refusal {
  switch (check.kind) {
    case 'untrusted':
      return new Refusal('unsigned_image', `The image ${ref} is not one of ${product}'s published images, so it is not trusted. ${NOTHING}`)
    case 'missing':
      return new Refusal('failed', `The image ${ref} is not in the registry, so version ${version} cannot be installed. ${NOTHING}`)
    case 'unsigned':
      return new Refusal('unsigned_image', `The image ${ref} carries no signature, so it is not ${product}'s own release. ${NOTHING}`)
    case 'wrongSigner':
      return new Refusal('unsigned_image', `The image ${ref} is signed, but not by ${SIGNER} for version ${version}. ${NOTHING}`)
    case 'unchecked':
      return new Refusal('failed', `The signature of ${ref} could not be checked (${check.reason}), so it was not fetched. Check this machine's internet connection, then run this again.`)
  }
}

/**
 * Checks every wanted image before any is fetched, and says what each runs as. `checked` is false when a
 * development build runs only images built on the machine, which carry no signature.
 */
export async function checkImages(ctx: Context, wanted: WantedImage[]): Promise<{ pins: ImagePins; checked: boolean }> {
  const development = isDevelopmentBuild(ctx.machine.hostServiceVersion)
  const pins: ImagePins = {}
  let checked = false
  for (const { part, version } of wanted) {
    const ref = imageRef(part, version)
    if (!isPublishedVersion(version)) {
      if (!development) {
        throw new Refusal('unsigned_image', `This host service runs only ${product}'s published, signed images, and ${ref} is a build made on a machine. ${NOTHING}`)
      }
      pins[part] = ref
      continue
    }
    const check = await checkTrusted(ctx.signatures, ref, version)
    if (check.kind !== 'signed') throw refusalFor(ref, version, check)
    pins[part] = pinnedRef(ref, check.digest)
    checked = true
  }
  return { pins, checked }
}

/**
 * Fetches each image that is not on the machine yet. A pinned image is fetched by its digest, so the registry
 * cannot serve anything but the content that was checked. A local build is never fetched.
 */
export async function fetchImages(ctx: Context, refs: string[]): Promise<void> {
  for (const ref of refs) {
    if (await ctx.docker.imageExists(ref)) continue
    if (!ref.includes('@')) {
      throw new Refusal('failed', `The image ${ref} is not on this machine. This host service is a development build, so it runs images built here: build ${ref} on this machine, then run this again.`)
    }
    try {
      await ctx.docker.pull(ref, ctx.registryEnv?.())
    } catch {
      throw new Refusal('failed', `The image ${ref} could not be fetched. Check this machine's internet connection, then run this again.`)
    }
  }
}
