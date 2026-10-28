/**
 * An asset's credit as hq holds it (spec part 2 *Provenance*, D19; security review M5): the based-on list of its
 * newest version, each line marked verified or stated (`provenance.ts`), and the licence. People add stated credits;
 * a credit is appended to the newest version's list and carried by every version published after it. Nothing
 * rewrites a line.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { BASED_ON_MAX_LINES, formatAssetIdentity, parseAssetIdentity } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { organisationPublisher } from '../organisationPublisher'
import type { Actor } from '../policy'
import { LifecycleError } from './errors'
import { heldLines, markLines, ProvenanceError, statedLine, type ShownLine, type StatedInput } from './provenance'
import { assertLibrary, byOf, librarySkill } from './records'

const NOTHING = 'Nothing was changed.'

export type Credit = { lines: ShownLine[]; licence: string | null }

async function newestVersion(db: Db, assetId: string) {
  return db.assetVersion.findFirst({ where: { assetId }, orderBy: { createdAt: 'desc' } })
}

/** The fingerprints hq holds for the identities and versions the lines name. */
async function heldFingerprints(db: Db, lines: { skill: string; version?: string }[]): Promise<Map<string, string>> {
  const held = new Map<string, string>()
  for (const line of lines) {
    const identity = parseAssetIdentity(line.skill)
    if (!identity || !line.version) continue
    const row = await db.assetVersion.findFirst({
      where: { version: line.version, asset: { publisher: identity.publisher, name: identity.name } },
      select: { digest: true },
    })
    if (row) held.set(`${formatAssetIdentity(identity)}@${line.version}`, row.digest)
  }
  return held
}

export async function creditOf(db: Db, assetId: unknown): Promise<Credit> {
  const asset = await librarySkill(db, assetId)
  const newest = await newestVersion(db, asset.id)
  if (!newest) return { lines: [], licence: null }
  const lines = heldLines(newest.basedOn)
  const held = await heldFingerprints(db, lines.filter(l => l.recorded === 'hq'))
  return {
    lines: markLines(lines, { madeHere: newest.source === 'MADE_HERE', publisher: asset.publisher }, (identity, version) => held.get(`${identity}@${version}`) ?? null),
    licence: newest.licence,
  }
}

/** Adds a stated credit for a source hq never saw, on a skill the organisation made or copied. */
export async function addStatedCredit(db: PrismaClient, actor: Actor, input: { assetId: unknown } & StatedInput, now: Date): Promise<Credit> {
  await assertLibrary(actor, 'editDraft', db)
  byOf(actor)
  const asset = await librarySkill(db, input.assetId)
  const publisher = await organisationPublisher(db)
  if (asset.publisher !== publisher) throw new LifecycleError(`Credit is added to the organisation's own skills; ${asset.publisher} states its own. ${NOTHING}`, 409)
  let line
  try {
    line = statedLine(input, publisher, now)
  } catch (err) {
    if (err instanceof ProvenanceError) throw new LifecycleError(err.message)
    throw err
  }
  await db.$transaction(async tx => {
    const newest = await newestVersion(tx, asset.id)
    if (!newest) throw new LifecycleError(`Publish the skill first; its credit goes with its versions. ${NOTHING}`, 409)
    const raw = Array.isArray(newest.basedOn) ? newest.basedOn : []
    if (raw.length >= BASED_ON_MAX_LINES) throw new LifecycleError(`A skill credits at most ${BASED_ON_MAX_LINES} sources. ${NOTHING}`, 409)
    const { count } = await tx.assetVersion.updateMany({ where: { id: newest.id, basedOn: { equals: newest.basedOn ?? [] } }, data: { basedOn: [...raw, line] as Prisma.InputJsonValue[] } })
    if (count === 0) throw new LifecycleError(`Someone changed this skill's credit at the same moment. Look again. ${NOTHING}`, 409)
  })
  return creditOf(db, asset.id)
}
