/**
 * The executor image a run's steps start from: the one its version was approved with, pinned by the digest in the
 * run instruction (workflows spec part 2, *How an executor container is started*). That is a published image's
 * digest — `EXECUTOR_IMAGE`'s repository at that digest — or, for an image built on this machine, which has no
 * published digest, its image id. The steps run by the image id this machine resolves it to, so nothing a tag is
 * moved to can stand in for it.
 */
import { executorImageName } from '../agents/runtime/agentImage'
import { dockerWithin } from '../agents/runtime/containerLifecycle'

const INSPECT_TIMEOUT_MS = 30_000

/** `registry:5000/name:tag` or `name@sha256:…` → `registry:5000/name`. */
export function imageRepository(reference: string): string {
  const at = reference.indexOf('@')
  const withoutDigest = at >= 0 ? reference.slice(0, at) : reference
  const lastSlash = withoutDigest.lastIndexOf('/')
  const colon = withoutDigest.lastIndexOf(':')
  return colon > lastSlash ? withoutDigest.slice(0, colon) : withoutDigest
}

export function imageCandidates(digest: string, configured = executorImageName()): string[] {
  return [`${imageRepository(configured)}@${digest}`, digest]
}

/** The image id to run, or null when this machine has no image at that digest. */
export async function resolveExecutorImage(digest: string): Promise<string | null> {
  for (const ref of imageCandidates(digest)) {
    try {
      const { stdout } = await dockerWithin(['image', 'inspect', '--format', '{{.Id}}', ref], INSPECT_TIMEOUT_MS)
      const id = stdout.trim()
      if (/^sha256:[0-9a-f]{64}$/.test(id)) return id
    } catch {
      // Not this one.
    }
  }
  return null
}
