/**
 * Versions their publisher withdrew (spec part 2 *Versions* V3, D30; security review M4): installed only after a
 * warning naming why. Agenthix's list ships in hq's image beside the shelf (`library/withdrawn.json`), so the warning
 * works offline; it speaks only for Agenthix's own identities. A version row may also say it was withdrawn.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { AGENTHIX_PUBLISHER, formatAssetIdentity, isSemVer, parseAssetIdentity } from '@agenthix/core'
import { getHqAssetsRoot } from '../../server/hqAssets'

const NOTHING = 'Nothing was changed.'
const REASON_MAX = 500

export type WithdrawnEntry = { asset: string; version: string; reason: string }

export class WithdrawnListError extends Error {}

export function parseWithdrawnList(raw: unknown): WithdrawnEntry[] {
  const fail = (why: string): never => { throw new WithdrawnListError(`withdrawn.json: ${why}`) }
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== 1) return fail('format 1 is read')
  const entries = (raw as { withdrawn?: unknown }).withdrawn
  if (!Array.isArray(entries)) return fail('"withdrawn" is a list')
  return entries.map((e, i) => {
    const { asset, version, reason } = (e ?? {}) as Record<string, unknown>
    if (!parseAssetIdentity(asset)) return fail(`withdrawn[${i}].asset is publisher/name`)
    if (!isSemVer(version)) return fail(`withdrawn[${i}].version is a SemVer version`)
    if (typeof reason !== 'string' || !reason.trim() || reason.length > REASON_MAX) return fail(`withdrawn[${i}].reason is 1 to ${REASON_MAX} characters`)
    return { asset: asset as string, version, reason: reason.trim() }
  })
}

export function withdrawnListPath(): string {
  return path.join(getHqAssetsRoot(), 'library', 'withdrawn.json')
}

/** The list in hq's image; none when the file isn't there. A file that can't be read is a broken image, so it throws. */
export async function loadWithdrawnList(): Promise<WithdrawnEntry[]> {
  let text: string
  try {
    text = await fs.readFile(withdrawnListPath(), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  return parseWithdrawnList(JSON.parse(text))
}

export type VersionOf = { publisher: string; name: string; version: string; withdrawn?: boolean; withdrawnReason?: string | null }

/** Why this version was withdrawn, or null when it wasn't. */
export function withdrawnReason(list: WithdrawnEntry[], v: VersionOf): string | null {
  if (v.publisher === AGENTHIX_PUBLISHER) {
    const identity = formatAssetIdentity(v)
    const listed = list.find(e => e.asset === identity && e.version === v.version)
    if (listed) return listed.reason
  }
  if (v.withdrawn) return v.withdrawnReason?.trim() || 'Its publisher withdrew it.'
  return null
}

/** The warning a withdrawn version needs accepted before the pin moves to it. */
export function withdrawnRefusal(identity: string, version: string, reason: string | null, accepted: boolean): string | null {
  if (reason === null || accepted) return null
  return `The publisher withdrew ${identity} ${version}: ${reason} Confirm that you want it anyway. ${NOTHING}`
}
