/**
 * The org's package (ruling P11): ORG.md and the skills the org installed for
 * every run, edited without a publish step (ADR-0072). ORG.md's name, vision and mission come
 * from the Org row at every write; its body carries over from the current content.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from 'wasp/server'
import { assertAssetDir, getHqAssetsRoot } from '../server/hqAssets'
import { getCurrentPackage, writePackage, readCurrentFiles, type Db, type PackageFileInput, type WriteResult } from './packageStore'
import { replaceSkill } from './skillFiles'
import { AGENTHIX_PUBLISHER } from '@agenthix/core'
import { listShelf, shelfDir } from '../assets/sources/imageShelf'
import { skillCopy } from '../assets/packageCopies'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Packages')

export const ORG_FILE = 'ORG.md'
const FALLBACK_BODY = '## About\n\n_Add any additional context about your organisation here._\n'

export type OrgFilesChange = (files: PackageFileInput[]) => PackageFileInput[]

export function orgFileBody(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trimStart()
}

export function renderOrgFile(org: { name: string; vision: string; mission: string }, body: string): string {
  return ['---', `name: ${org.name}`, `vision: ${org.vision}`, `mission: ${org.mission}`, '---', '', body].join('\n')
}

async function templateBody(): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(getHqAssetsRoot(), 'orgs', 'template', 'ORG.md'), 'utf-8')
    return orgFileBody(raw) || FALLBACK_BODY
  } catch {
    return FALLBACK_BODY
  }
}

/** Every skill on Agenthix's shelf in hq's image, copied into the org's first package content. */
async function initialOrgFiles(_db: Db): Promise<PackageFileInput[]> {
  // Later writes carry these skills forward, so a first write without them never gains them.
  await assertAssetDir(shelfDir())
  let files: PackageFileInput[] = [{ path: ORG_FILE, content: Buffer.from(await templateBody(), 'utf-8') }]
  for (const skill of await listShelf()) {
    try {
      files = replaceSkill(files, skill.name, skillCopy({ publisher: AGENTHIX_PUBLISHER, name: skill.name }, skill.version, skill.files).files)
    } catch (err) {
      logger.warn(`Agenthix's skill ${skill.name} not copied for the org: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return files
}

/**
 * The disk reads a first-ever org write needs — the org template and every
 * installed platform library skill's SKILL.md — done up front so a caller can
 * read them BEFORE opening a transaction (reading them inside
 * `prisma.$transaction` risks its 5s interactive-transaction timeout on the
 * sequential disk I/O). `changeOrgPackage` only uses the result when its own,
 * in-transaction check confirms the org still has no package — a
 * write that sneaks in between this call and the transaction just makes
 * this work wasted, never wrong. Returns null when there's nothing to
 * prepare: an existing org that already has a package, so
 * `changeOrgPackage` will read its current content instead.
 */
export async function prepareOrgPackage(db: Db = prisma): Promise<PackageFileInput[] | null> {
  const org = await db.org.findFirst({ select: { id: true } })
  if (org && (await getCurrentPackage('org', org.id, db))) return null
  return initialOrgFiles(db)
}

/**
 * `db` defaults to hq's own client but takes a transaction handle — a caller
 * that writes the Org row alongside this write (updateOrg, updateOrgOp)
 * passes its own `tx` so the row write and the content it feeds commit or
 * roll back together. `initialFiles`, when given, is used instead of
 * reading them from disk here — the in-transaction part of a write stays
 * DB-only; a transactional caller gets them from `prepareOrgPackage` before
 * opening its transaction.
 */
export async function changeOrgPackage(
  change: OrgFilesChange,
  updatedById: string | null,
  db: Db = prisma,
  initialFiles?: PackageFileInput[],
): Promise<WriteResult | null> {
  const org = await db.org.findFirst()
  if (!org) return null
  const current = (await readCurrentFiles('org', org.id, db)) ?? initialFiles ?? await initialOrgFiles(db)
  const next = change(current)
  const existing = next.find(f => f.path === ORG_FILE)
  const body = existing ? orgFileBody(existing.content.toString('utf-8')) : await templateBody()
  const rendered = { path: ORG_FILE, content: Buffer.from(renderOrgFile(org, body), 'utf-8') }
  return writePackage({
    kind: 'org',
    key: org.id,
    files: [rendered, ...next.filter(f => f.path !== ORG_FILE)],
    updatedById,
  }, db)
}

/**
 * Boot: the org's first content, once an org exists. Later boots write
 * nothing. Runs without a transaction, so the disk reads a first write
 * needs can stay inline — `initialOrgFiles` here is the same function
 * `prepareOrgPackage` calls, so a caller sharing this path gets identical
 * prepared files either way.
 */
export async function ensureOrgPackage(db: Db = prisma): Promise<WriteResult | null> {
  const org = await db.org.findFirst({ select: { id: true } })
  if (!org || (await getCurrentPackage('org', org.id, db))) return null
  return changeOrgPackage(files => files, null, db, await initialOrgFiles(db))
}
