/**
 * The host service's own version (ADR-0117), learnt once at start from the image reference its container was started
 * from — never built into it. A trusted publisher's host image by a published version's tag (`…/agenthix-host:0.3.0`,
 * with or without `@sha256:…` after it) is that version, once its signature for that version checks and the image
 * the container runs is the one signed; anything else — a local build's name, a bare digest, not in a container —
 * is `dev`, a development build. A failed check stops the host service rather than leave it unchecked.
 *
 * The image that passed is written down by its id, so a start without network (a machine starting again) trusts the
 * same content without asking again, and the launcher, run from the same image by its id, reads its version there.
 */
import { product } from '../cli/words'
import { containerIdIn, type ContainerOps } from '../docker/containers'
import type { StateFolder } from '../state/folder'
import { checkTrusted } from './images'
import { hostVersionOf, isPublishedVersion, parseReference, TRUSTED_PUBLISHERS, type Signer, type TrustedPublisher } from './published'
import type { SignatureCheck } from './signatures'

export const DEVELOPMENT = 'dev'
const FILE = ['launcher', 'image.json']
/** The images kept: the one running, and the ones a switch may put back. */
const KEEP = 3

/** An image whose signature passed for `version`, by the id Docker holds it under. */
export type CheckedImage = { imageId: string; reference: string; version: string; digest: string; checkedAt: string }

export type OwnVersionEnv = {
  containers: Pick<ContainerOps, 'inspect' | 'image'>
  state: StateFolder
  /** This process's mount table, which names its container when it runs in one. */
  mountinfo: string
  /** Whether the machine's Docker socket was given to it. */
  hasDocker: boolean
  check: (ref: string, signer: Signer) => Promise<SignatureCheck>
  now: () => Date
  publishers?: readonly TrustedPublisher[]
}

function readChecked(state: StateFolder): CheckedImage[] {
  const raw = state.readJson(...FILE) as { images?: unknown } | null
  if (!raw || !Array.isArray(raw.images)) return []
  return raw.images.filter((i): i is CheckedImage => {
    const x = i as Partial<Record<keyof CheckedImage, unknown>>
    return !!x && typeof x.imageId === 'string' && typeof x.reference === 'string' && typeof x.version === 'string'
      && isPublishedVersion(x.version) && typeof x.digest === 'string' && typeof x.checkedAt === 'string'
  })
}

/** The version recorded for the image Docker holds as `imageId`, once its signature passed; `dev` when none was. */
export function checkedVersion(state: StateFolder, imageId: string): string {
  return readChecked(state).find(i => i.imageId === imageId)?.version ?? DEVELOPMENT
}

function refused(name: string, ref: string, version: string, check: Exclude<SignatureCheck, { kind: 'signed' }> | { kind: 'untrusted' }): Error {
  const startedAs = `${name} was started from ${ref}, as version ${version}, but`
  const how = `Start it from ${product}'s published image of a version (the docker run in the install guide, with the version in its tag), or from an image built on this machine by its local name, as a development build. Nothing was changed.`
  switch (check.kind) {
    case 'unchecked':
      return new Error(`${startedAs} its signature could not be checked (${check.reason}). Check this machine's internet connection; Docker starts the host service again by itself, and it checks once more. Nothing was changed.`)
    case 'missing':
      return new Error(`${startedAs} the registry has no such image. ${how}`)
    case 'unsigned':
      return new Error(`${startedAs} that image carries no signature. ${how}`)
    case 'wrongSigner':
    case 'untrusted':
      return new Error(`${startedAs} that image is not signed by ${product}'s publishing workflow for version ${version}. ${how}`)
  }
}

/**
 * The version this host service is. Throws, with what to do, when its container names a published version whose
 * signature does not pass, or Docker cannot say what the container runs.
 */
export async function ownVersion(env: OwnVersionEnv): Promise<string> {
  const id = containerIdIn(env.mountinfo)
  // Without the Docker socket it can start no image at all, so there is nothing for a version to trust.
  if (!id || !env.hasDocker) return DEVELOPMENT
  const self = await env.containers.inspect(id)
  if (!self) throw new Error(`Docker has no container ${id}, though this host service runs in it, so it cannot tell which version it is. Nothing was changed.`)
  const ref = self.reference
  const version = hostVersionOf(ref, env.publishers)
  if (!version) return DEVELOPMENT
  const known = readChecked(env.state)
  if (known.some(i => i.imageId === self.image && i.reference === ref && i.version === version)) return version

  const { name, digest: given } = parseReference(ref)
  const checked = await checkTrusted(env.check, given ? `${name}@${given}` : `${name}:${version}`, version, env.publishers ?? TRUSTED_PUBLISHERS)
  if (checked.kind !== 'signed') throw refused(self.name, ref, version, checked)
  const image = await env.containers.image(self.image)
  const runs = !!image && (self.image === checked.digest || image.repoDigests.includes(`${name}@${checked.digest}`))
  if (!runs || (given && given !== checked.digest)) {
    throw new Error(`${self.name} was started from ${ref}, but the image it runs is not the one ${product}'s publishing workflow signed for version ${version} (${checked.digest}). Fetch it again with docker pull ${name}@${checked.digest}, then start the host service from it. Nothing was changed.`)
  }
  const entry: CheckedImage = { imageId: self.image, reference: ref, version, digest: checked.digest, checkedAt: env.now().toISOString() }
  env.state.writeJson(FILE, { images: [entry, ...known.filter(i => i.imageId !== self.image)].slice(0, KEEP) })
  return version
}
