/**
 * Which published versions exist (host-management spec §11): the tags every image of a part carries in the
 * registry, read without credentials through the registry's own API. When the registry cannot be read, no version
 * is offered: an upgrade is never chosen from a guess.
 */
import { imageName } from '@agenthix/core'
import { isPublishedVersion, isReleaseVersion, REGISTRY, type PublishedPart } from '../images/published'
import type { Context } from '../service/context'

/** The tags of one image repository (`<owner>/<name>`), or a throw saying why they could not be read. */
export type TagLister = (repository: string) => Promise<string[]>

export type Version = [number, number, number]

export function parseVersion(v: string): Version | null {
  if (!isPublishedVersion(v)) return null
  const [a, b, c] = v.split('-')[0].split('.').map(Number)
  return [a, b, c]
}

const PRE_RELEASES = ['alpha', 'beta', 'rc']

/** A pre-release's place before its release: `alpha.2` is `[0, 2]`, `rc.1` is `[2, 1]`, a release comes after all. */
const preRelease = (v: string): [number, number] => {
  const m = /-(alpha|beta|rc)\.(\d+)$/.exec(v)
  return m ? [PRE_RELEASES.indexOf(m[1]), Number(m[2])] : [PRE_RELEASES.length, 0]
}

/** `a` against `b`, both published versions: negative when older, 0 when the same, positive when newer. */
export function compare(a: string, b: string): number {
  const pa = parseVersion(a)!
  const pb = parseVersion(b)!
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  const [ra, rb] = [preRelease(a), preRelease(b)]
  return ra[0] !== rb[0] ? ra[0] - rb[0] : ra[1] - rb[1]
}

/** A fix: the same major and minor version, a later patch. Only fixes are ever applied by themselves. */
export function isFixOf(next: string, current: string): boolean {
  const n = parseVersion(next)
  const c = parseVersion(current)
  return !!n && !!c && n[0] === c[0] && n[1] === c[1] && n[2] > c[2]
}

/** The same major and minor version, which a host service can run (a later patch included). */
export const sameLine = (a: string, b: string): boolean => {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  return !!pa && !!pb && pa[0] === pb[0] && pa[1] === pb[1]
}

export const lineOf = (v: string) => v.split('.').slice(0, 2).join('.')

export function newest(versions: string[]): string | null {
  return versions.filter(isReleaseVersion).sort(compare).pop() ?? null
}

const [REGISTRY_HOST, OWNER] = REGISTRY.split('/')
const TIMEOUT_MS = 20_000

/**
 * The registry's anonymous route (the OCI distribution API, as ghcr serves it): a pull token for the repository,
 * then its tag list. No credentials are held or sent.
 */
/** The registry answered that it holds no such image: nothing is published yet. */
export class NothingPublished extends Error {
  constructor() {
    super('the registry holds no published version of it')
  }
}

const NOT_THERE = new Set([401, 403, 404])

export const registryTags: TagLister = async repository => {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const tokenAnswer = await fetch(`https://${REGISTRY_HOST}/token?scope=repository:${repository}:pull&service=${REGISTRY_HOST}`, { signal })
  if (NOT_THERE.has(tokenAnswer.status)) throw new NothingPublished()
  if (!tokenAnswer.ok) throw new Error('the registry could not be asked just now')
  const { token } = (await tokenAnswer.json()) as { token?: unknown }
  if (typeof token !== 'string') throw new Error('the registry gave no way to ask it')
  const answer = await fetch(`https://${REGISTRY_HOST}/v2/${repository}/tags/list?n=1000`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  })
  if (NOT_THERE.has(answer.status)) throw new NothingPublished()
  if (!answer.ok) throw new Error('the registry did not list the versions')
  const { tags } = (await answer.json()) as { tags?: unknown }
  if (!Array.isArray(tags)) throw new Error('the registry answered without a list of versions')
  return tags.filter((t): t is string => typeof t === 'string')
}

export type Published = { ok: true; versions: string[] } | { ok: false; problem: string }

/** The versions published for every one of `parts`, oldest first; a version missing an image is not one. */
export async function publishedVersions(ctx: Context, parts: readonly PublishedPart[]): Promise<Published> {
  const list = ctx.registryTags ?? registryTags
  let common: string[] | null = null
  try {
    for (const part of parts) {
      const tags = new Set((await list(`${OWNER}/${imageName(part)}`)).filter(isReleaseVersion))
      common = (common ?? [...tags]).filter(t => tags.has(t))
    }
  } catch (err) {
    if (err instanceof NothingPublished) return { ok: false, problem: 'No version has been published yet, so no upgrade is offered.' }
    const why = err instanceof Error ? (err.name === 'TimeoutError' ? 'the registry did not answer in time' : err.message) : String(err)
    return { ok: false, problem: `The published versions could not be read (${why}), so no upgrade is offered.` }
  }
  return { ok: true, versions: [...new Set(common ?? [])].sort(compare) }
}

/** The images an upgrade of each target switches: HQ's comes with its default site. */
export const PARTS_OF = {
  hq: ['hq-server', 'hq-web', 'site-server', 'agent'],
  site: ['site-server', 'agent'],
} as const satisfies Record<'hq' | 'site', readonly PublishedPart[]>
