/**
 * *Update…* on a skill added from the Library (spec part 4 F3): an offer, never enforced. A place skill copied in with
 * *Add to this place* keeps its origin (identity and version) on its versions in hq's record, never read from its
 * files. When the Library pins a newer version, the Skills page offers it; updating shows what would change in the
 * place's files first, then writes the Library version's files as the skill's next version, through the same skill
 * folder write as every publish, refused when the files are no longer what the person looked at (as *Put back* is).
 * Whoever publishes in the place may update; the skill's switch moves to what was written, as every publish's does.
 */
import type { PrismaClient } from '@prisma/client'
import { ASSET_MANIFEST_FILE, compareSemVer, parseAssetIdentity } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import type { PackageFile } from '../../library/packages/packageZip'
import { fingerprintOf, readContent } from '../content'
import type { Actor } from '../policy'
import { LifecycleError } from '../lifecycle/errors'
import { byOf } from '../lifecycle/records'
import { diffFiles } from '../pages/asset/pageDiff'
import type { FileChangeView } from '../pages/asset/pageTypes'
import { withSkillMetadata } from './metadata'
import { assertNotWorkspace, assertPlace, placeOfSkill, type PlaceContext } from './place'
import { liveFiles, newestVersion } from './placeDrafts'
import { publishFiles, type Origin } from './placeVersions'

const NOTHING = 'Nothing was changed.'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

type VersionOrigin = { originIdentity: string | null; originVersion: string | null }

export function originOf(v: VersionOrigin | null | undefined): Origin | null {
  return v?.originIdentity && v.originVersion ? { identity: v.originIdentity, version: v.originVersion } : null
}

/** The Library's pinned version of each origin, where it is newer than the one copied: what the page offers. */
export async function libraryOffers(db: Db, origins: Origin[]): Promise<Map<string, string>> {
  const ids = [...new Set(origins.map(o => o.identity))].map(parseAssetIdentity).filter((i): i is NonNullable<typeof i> => i !== null)
  if (ids.length === 0) return new Map()
  const assets = await db.asset.findMany({
    where: { kind: 'SKILL', removedAt: null, OR: ids.map(i => ({ publisher: i.publisher, name: i.name })) },
    select: { publisher: true, name: true, currentVersion: { select: { version: true } } },
  })
  const pinned = new Map<string, string>()
  for (const a of assets) if (a.currentVersion) pinned.set(`${a.publisher}/${a.name}`, a.currentVersion.version)
  const offers = new Map<string, string>()
  for (const o of origins) {
    const to = pinned.get(o.identity)
    if (to && compareSemVer(to, o.version) > 0) offers.set(`${o.identity}@${o.version}`, to)
  }
  return offers
}

export const offerKey = (o: Origin) => `${o.identity}@${o.version}`

type Offered = { ctx: PlaceContext; skill: Awaited<ReturnType<typeof placeOfSkill>>['skill']; origin: Origin; to: string; files: PackageFile[] }

/** The skill, its origin and the Library's newer version's files; refused when there is nothing to update to. */
async function offered(db: Db, actor: Actor, placeSkillId: unknown): Promise<Offered> {
  const { ctx, skill } = await placeOfSkill(db, placeSkillId)
  assertPlace(actor, 'publish', ctx)
  assertNotWorkspace(skill, 'Updating from the Library')
  const origin = originOf(await newestVersion(db, skill.id))
  if (!origin) throw new LifecycleError(`That skill wasn't added from the Library, so there is nothing to update it to. ${NOTHING}`, 409)
  const id = parseAssetIdentity(origin.identity)
  const asset = id
    ? await db.asset.findUnique({ where: { kind_publisher_name: { kind: 'SKILL', ...id } }, include: { currentVersion: true } })
    : null
  if (!asset || asset.removedAt || !asset.currentVersion) {
    throw new LifecycleError(`${origin.identity} isn't in the Library any more. ${NOTHING}`, 404)
  }
  const to = asset.currentVersion.version
  if (compareSemVer(to, origin.version) <= 0) {
    throw new LifecycleError(`The Library has no version of ${origin.identity} newer than ${origin.version}. ${NOTHING}`, 409)
  }
  const files = (await readContent(asset.currentVersion.digest, db)).filter(f => f.path !== ASSET_MANIFEST_FILE)
  return { ctx, skill, origin, to, files }
}

export type PlaceSkillUpdateView = {
  identity: string
  from: string
  to: string
  /** The fingerprint of the files compared, which the update names; null when the folder is gone. */
  fingerprint: string | null
  /** Whether that is what the place was last seen holding; when not, look at the place again before updating. */
  current: boolean
  /** From what the place's files hold now to exactly what updating writes. */
  files: FileChangeView[]
}

/** What *Update to …* would change in the place's files, shown before anything is written. */
export async function placeSkillUpdate(db: PrismaClient, actor: Actor, placeSkillId: unknown): Promise<PlaceSkillUpdateView> {
  const { ctx, skill, origin, to, files } = await offered(db, actor, placeSkillId)
  const now = skill.goneAt ? [] : await liveFiles(db, ctx, skill)
  const fingerprint = skill.goneAt ? null : fingerprintOf(now)
  const written = withSkillMetadata(files, { version: to, identity: origin.identity })
  return {
    identity: origin.identity, from: origin.version, to, fingerprint,
    current: fingerprint === null || fingerprint === skill.lastFingerprint,
    files: diffFiles(now, written),
  }
}

/**
 * *Update to …*: the Library version's files written as the skill's next version. The person names the version and
 * the fingerprint of the files they were shown; either having moved on refuses it.
 */
export async function updateFromLibrary(
  db: PrismaClient, actor: Actor, input: { placeSkillId: unknown; version: unknown; fingerprint: unknown },
): Promise<{ number: number; version: string }> {
  const { ctx, skill, origin, to, files } = await offered(db, actor, input.placeSkillId)
  const by = byOf(actor)
  if (input.version !== to) throw new LifecycleError(`The Library's version of ${origin.identity} changed since you looked. Look at the update again. ${NOTHING}`, 409)
  if (!skill.goneAt && (typeof input.fingerprint !== 'string' || input.fingerprint !== skill.lastFingerprint)) {
    throw new LifecycleError(`The skill's files changed since you looked at them. Look at the place again. ${NOTHING}`, 409)
  }
  const published = await db.$transaction(async tx => {
    const { count } = await tx.placeSkill.updateMany({ where: { id: skill.id, lastFingerprint: skill.lastFingerprint }, data: { lastSeenAt: new Date() } })
    if (count === 0) throw new LifecycleError(`The skill changed as you updated it. Look at it again. ${NOTHING}`, 409)
    return publishFiles(
      tx, ctx, skill, files, { publishedById: by.byId, requestedByAgentId: null }, `Updated from ${origin.identity} ${to}`,
      { copied: { identity: origin.identity, version: to } },
    )
  }, TRANSACTION)
  return { number: published.number, version: to }
}
