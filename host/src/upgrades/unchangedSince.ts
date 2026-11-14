/**
 * The release each part's running image was first built for ("hq-server 0.2.3, unchanged since 0.2.1"): the oldest
 * release of the same major.minor line, not newer than the running one, whose index in the registry lists the same
 * platform image. A release that changed nothing in a part publishes that part's image again unchanged, under a new
 * tag, so the tags tell which releases share it.
 *
 * Asked of the registry as `versions.ts` asks for tags (with the same credential, if any, and the same timeout) once per part and version,
 * then kept in the state folder. A registry that cannot be read leaves the answer out and keeps nothing, and never
 * fails `status`.
 */
import { imageName } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { isDevelopmentBuild } from '../images/images'
import { isReleaseVersion, type PublishedPart } from '../images/published'
import { compare, OWNER, REGISTRY_HOST, registryTags, registryToken, sameLine, TIMEOUT_MS, type RegistryLogin } from './versions'

/** The platform image (`sha256:…`) an index lists for this machine, given a tag or the index's digest; null when it lists none. */
export type PlatformDigest = (repository: string, reference: string, signal?: AbortSignal) => Promise<string | null>

/** The image each part of `status` stands for. */
const IMAGE_OF = { hq: 'hq-server', site: 'site-server' } as const satisfies Record<'hq' | 'site', PublishedPart>

export type UnchangedSince = Partial<Record<'hq' | 'site', string>>

const FILE = 'unchanged-since.json'
/** `status` does not wait longer than this for the registry. */
const BUDGET_MS = 10_000
/** After a registry that did not answer, `status` leaves it alone this long, so that each call is not made to wait again. */
const RETRY_AFTER_MS = 5 * 60_000
/** When the registry last failed to answer for a part and version, by state folder. */
const failedAt = new Map<string, number>()
const DIGEST_IN_PIN = /@(sha256:[0-9a-f]{64})$/
const INDEX_TYPES = [
  'application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

const architecture = () => (process.arch === 'x64' ? 'amd64' : process.arch)

export function registryPlatformDigestWith(login?: RegistryLogin): PlatformDigest {
  return async (repository, reference, outer) => {
    const signal = outer ? AbortSignal.any([outer, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS)
    const token = await registryToken(repository, signal, login?.())
    const answer = await fetch(`https://${REGISTRY_HOST}/v2/${repository}/manifests/${reference}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: INDEX_TYPES }, signal,
    })
    if (!answer.ok) throw new Error('the registry did not give the image index')
    const body = (await answer.json()) as { manifests?: { digest?: unknown; platform?: { os?: unknown; architecture?: unknown } }[] }
    if (!Array.isArray(body.manifests)) return reference.startsWith('sha256:') ? reference : answer.headers.get('docker-content-digest')
    const mine = body.manifests.find(m => m.platform?.os === 'linux' && m.platform.architecture === architecture())
    return typeof mine?.digest === 'string' ? mine.digest : null
  }
}

export const registryPlatformDigest: PlatformDigest = registryPlatformDigestWith()

type Kept = Record<string, string | null>

function readKept(ctx: Context): Kept {
  const kept = ctx.state.readJson(FILE)
  return kept && typeof kept === 'object' && !Array.isArray(kept) ? (kept as Kept) : {}
}

/** The oldest release the image was published for; undefined when that cannot be worked out. */
async function oldestRelease(ctx: Context, part: PublishedPart, version: string, indexDigest: string, signal: AbortSignal): Promise<string | undefined> {
  const repository = `${OWNER}/${imageName(part)}`
  const digestOf = ctx.registryPlatformDigest ?? registryPlatformDigest
  try {
    const mine = await digestOf(repository, indexDigest, signal)
    if (!mine) return undefined
    const older = (await (ctx.registryTags ?? registryTags)(repository))
      .filter(t => isReleaseVersion(t) && sameLine(t, version) && compare(t, version) < 0)
      .sort((a, b) => compare(b, a))
    let oldest = version
    for (const tag of older) {
      if ((await digestOf(repository, tag, signal)) !== mine) break
      oldest = tag
    }
    return oldest
  } catch {
    return undefined
  }
}

/** The work's answer, or undefined when it did not come within `ms`; the work is told to stop then. */
async function within<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
  const stop = new AbortController()
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([work(stop.signal), new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), ms) })])
  } finally {
    clearTimeout(timer)
    stop.abort()
  }
}

/** For each of HQ and the site that runs a published release: the release its image was first built for, when earlier than the running one. */
export async function unchangedSince(ctx: Context): Promise<UnchangedSince> {
  if (isDevelopmentBuild(ctx.machine.hostServiceVersion)) return {}
  const there = installed(ctx)
  const out: UnchangedSince = {}
  const kept = readKept(ctx)
  let asked = false
  await Promise.all((['hq', 'site'] as const).map(async target => {
    const settings = there[target]?.settings
    const part = IMAGE_OF[target]
    const digest = DIGEST_IN_PIN.exec(settings?.images?.[part] ?? '')?.[1]
    if (!settings || !digest || !isReleaseVersion(settings.version)) return
    const key = `${part}@${settings.version}`
    let since: string | null | undefined = kept[key]
    const failedKey = `${ctx.state.root}\u0000${key}`
    const failed = failedAt.get(failedKey)
    if (since === undefined && failed !== undefined && ctx.now().getTime() - failed < RETRY_AFTER_MS) return
    if (since === undefined) {
      asked = true
      since = (await within(BUDGET_MS, signal => oldestRelease(ctx, part, settings.version, digest, signal))) ?? undefined
      if (since === undefined) failedAt.set(failedKey, ctx.now().getTime())
      else failedAt.delete(failedKey)
      if (since !== undefined) kept[key] = since === settings.version ? null : since
      since = since === settings.version ? null : since
    }
    if (since) out[target] = since
  }))
  if (asked) ctx.state.writeJson([FILE], kept)
  return out
}
