/**
 * Skills the organisation makes in hq's editor (spec part 2 *Identity*, *Editing*): published under the
 * organisation's own publisher name, as version 1.0.0 and then each next minor version, with history. Validated as
 * every save is (`validation.ts`).
 *
 * The Library's current skill editor publishes each save directly; the shared draft, publishing the exact revision
 * seen, and the own copy on editing another publisher's skill replace this with the asset lifecycle.
 */
import type { PrismaClient } from '@prisma/client'
import { formatAssetIdentity, parseSemVer } from '@agenthix/core'
import type { PackageFile } from '../library/packages/packageZip'
import { readContent, storeContent } from './content'
import { organisationPublisher } from './organisationPublisher'
import { SKILL_FILE, readSkillMd } from './skillFile'
import { validateSkill } from './validation'

const NOTHING = 'Nothing was changed.'
const FIRST_VERSION = '1.0.0'

export class MadeHereError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) { super(message) }
}

/** A SKILL.md from what the editor sends: its name and description as front matter, the body as written, its title as the first heading. */
export function skillMdText(name: string, description: string, title: string, content: string): string {
  const body = readSkillMd(content).body.trim()
  const titled = /^#[ \t]+\S/m.test(body) || !title.trim() ? body : `# ${title.trim()}\n\n${body}`
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description.trim())}\n---\n\n${titled}\n`
}

function nextVersion(version: string): string {
  const v = parseSemVer(version)
  return v ? `${v.major}.${v.minor + 1}.0` : FIRST_VERSION
}

function checked(name: string, files: PackageFile[]): void {
  const { errors } = validateSkill(name, files)
  if (errors.length) throw new MadeHereError(`${errors.join(' ')} ${NOTHING}`)
}

export async function createMadeHereSkill(
  db: PrismaClient,
  input: { name: string; title: string; description: string; content: string; byId: string },
): Promise<{ id: string; identity: string }> {
  const files = [{ path: SKILL_FILE, content: Buffer.from(skillMdText(input.name, input.description, input.title, input.content), 'utf-8') }]
  checked(input.name, files)
  const publisher = await organisationPublisher(db)
  const taken = await db.asset.findUnique({ where: { kind_publisher_name: { kind: 'SKILL', publisher, name: input.name } }, select: { id: true } })
  if (taken) throw new MadeHereError(`The Library already has a skill called ${input.name}. Choose another name. ${NOTHING}`, 409)
  return db.$transaction(async tx => {
    const asset = await tx.asset.create({ data: { kind: 'SKILL', publisher, name: input.name } })
    const version = await tx.assetVersion.create({
      data: { assetId: asset.id, version: FIRST_VERSION, digest: await storeContent(files, tx), source: 'MADE_HERE', byId: input.byId, note: 'Made here' },
    })
    await tx.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
    await tx.assetPinChange.create({ data: { assetId: asset.id, toVersionId: version.id, byId: input.byId, reason: 'Published' } })
    return { id: asset.id, identity: formatAssetIdentity({ publisher, name: input.name }) }
  })
}

/** The next version of a skill made here: its SKILL.md rewritten, its other files kept. */
export async function publishMadeHereEdit(
  db: PrismaClient,
  input: { assetId: string; description?: string; content?: string; byId: string },
): Promise<{ id: string; version: string }> {
  const asset = await db.asset.findUnique({ where: { id: input.assetId }, include: { currentVersion: true } })
  if (!asset || asset.removedAt || asset.kind !== 'SKILL' || !asset.currentVersion) throw new MadeHereError(`That skill isn't in the Library. ${NOTHING}`, 404)
  if (asset.publisher !== (await organisationPublisher(db))) {
    throw new MadeHereError(`${formatAssetIdentity(asset)} is published by ${asset.publisher}. Editing it makes the organisation's own copy, which this editor can't make yet. ${NOTHING}`, 409)
  }
  const current = asset.currentVersion
  const files = await readContent(current.digest, db)
  const md = readSkillMd(files.find(f => f.path === SKILL_FILE)?.content.toString('utf-8') ?? '')
  const description = input.description ?? (typeof md.header?.description === 'string' ? md.header.description : '')
  const text = skillMdText(asset.name, description, '', input.content ?? md.body)
  const next = [...files.filter(f => f.path !== SKILL_FILE), { path: SKILL_FILE, content: Buffer.from(text, 'utf-8') }]
  checked(asset.name, next)
  const version = nextVersion(current.version)
  return db.$transaction(async tx => {
    const digest = await storeContent(next, tx)
    if (digest === current.digest) return { id: asset.id, version: current.version }
    const row = await tx.assetVersion.create({ data: { assetId: asset.id, version, digest, source: 'MADE_HERE', byId: input.byId, note: 'Edited' } })
    const { count } = await tx.asset.updateMany({ where: { id: asset.id, currentVersionId: current.id }, data: { currentVersionId: row.id } })
    if (count === 0) throw new MadeHereError(`Someone changed this skill at the same moment. Reload it and edit again. ${NOTHING}`, 409)
    await tx.assetPinChange.create({ data: { assetId: asset.id, fromVersionId: current.id, toVersionId: row.id, byId: input.byId, reason: 'Published' } })
    return { id: asset.id, version }
  })
}
