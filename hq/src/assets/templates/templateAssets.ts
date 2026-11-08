/**
 * Agent and board templates as the Library holds them (adr-0157): `Asset` rows of kind `agent` or `board`, each pinned
 * to one version whose content is the whole package. What a template makes reads that pinned content once and keeps
 * only a link to the version it was made from (adr-0072): it never follows the template's later versions.
 */
import { AGENTHIX_PUBLISHER, ASSET_MANIFEST_FILE, parseAssetIdentity } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import type { PackageFile } from '../../library/packages/packageZip'
import { readContent } from '../content'
import { readParts } from '../install/parts'

export type TemplateKind = 'AGENT' | 'BOARD' | 'TEAM' | 'TASK_TEMPLATE'

export type TemplateAsset = {
  id: string
  kind: TemplateKind
  publisher: string
  name: string
  currentVersion: { id: string; version: string; digest: string; source: string }
}

const SELECT = {
  id: true, kind: true, publisher: true, name: true, removedAt: true,
  currentVersion: { select: { id: true, version: true, digest: true, source: true } },
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = { id: string; kind: string; publisher: string; name: string; removedAt: Date | null; currentVersion: TemplateAsset['currentVersion'] | null }

function usable(row: Row | null, kind: TemplateKind): TemplateAsset | null {
  if (!row || row.kind !== kind || row.removedAt || !row.currentVersion) return null
  return { id: row.id, kind, publisher: row.publisher, name: row.name, currentVersion: row.currentVersion }
}

/**
 * A template in the Library by its asset id, its identity (`publisher/name`), or its bare name (Agenthix's first, else
 * the one template of that name); null when there is none, it was removed, or it has no version.
 */
export async function findTemplate(db: Db, kind: TemplateKind, ref: unknown): Promise<TemplateAsset | null> {
  if (typeof ref !== 'string' || ref === '' || ref.length > 200) return null
  if (UUID.test(ref)) return usable(await db.asset.findUnique({ where: { id: ref }, select: SELECT }), kind)
  const identity = parseAssetIdentity(ref)
  if (identity) return usable(await db.asset.findUnique({ where: { kind_publisher_name: { kind, ...identity } }, select: SELECT }), kind)
  const name = ref
  const own = usable(await db.asset.findUnique({ where: { kind_publisher_name: { kind, publisher: AGENTHIX_PUBLISHER, name } }, select: SELECT }), kind)
  if (own) return own
  const others = await db.asset.findMany({ where: { kind, name, removedAt: null, currentVersionId: { not: null } }, select: SELECT, take: 2 })
  return others.length === 1 ? usable(others[0], kind) : null
}

export async function listTemplates(db: Db, kind: TemplateKind): Promise<TemplateAsset[]> {
  const rows = await db.asset.findMany({
    where: { kind, removedAt: null, currentVersionId: { not: null } },
    select: SELECT,
    orderBy: [{ name: 'asc' }, { publisher: 'asc' }],
  })
  return rows.map(r => usable(r, kind)).filter((t): t is TemplateAsset => t !== null)
}

/** The pinned version's files: the whole package, its carried skills included. */
export function templateFiles(db: Db, template: TemplateAsset): Promise<PackageFile[]> {
  return readContent(template.currentVersion.digest, db)
}

/** The names of the skills a template carries, as installed under its publisher: role skills `template/skill`, shared ones their own. */
export function carriedSkillNames(template: Pick<TemplateAsset, 'name'>, files: PackageFile[]): string[] {
  return readParts({ root: template.name, files }).embedded.map(p => p.name)
}

/**
 * The name a skill folder of the template is installed under: a shared skill (with its own `package.json`) by its
 * folder, which is its name; a role skill as `template/folder`.
 */
export function carriedSkillName(template: Pick<TemplateAsset, 'name'>, files: PackageFile[], folder: string): string {
  return files.some(f => f.path === `skills/${folder}/${ASSET_MANIFEST_FILE}`) ? folder : `${template.name}/${folder}`
}

/**
 * The skills a template carries as this organisation holds them now, for granting to what it makes (D23): each by
 * identity under the template's publisher, at whatever version is pinned here. One removed from the Library is left
 * out and named, so the agent's page can show it as missing.
 */
export async function carriedSkills(db: Db, template: TemplateAsset, files: PackageFile[], only?: string[]): Promise<{ assetIds: string[]; missing: string[] }> {
  const names = only ?? carriedSkillNames(template, files)
  if (names.length === 0) return { assetIds: [], missing: [] }
  const held = await db.asset.findMany({
    where: { kind: 'SKILL', publisher: template.publisher, name: { in: names }, removedAt: null, currentVersionId: { not: null } },
    select: { id: true, name: true },
  })
  return { assetIds: held.map(h => h.id), missing: names.filter(n => !held.some(h => h.name === n)) }
}
