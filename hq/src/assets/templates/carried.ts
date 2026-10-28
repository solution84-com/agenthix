/**
 * The skills a template carries, installed when the template is first used: an agent or team made from it (D14). Boot
 * installs Agenthix's templates and nothing they carry, so a new organisation's Library holds no shelf skill it didn't
 * choose; the first agent made from a template brings what that agent needs.
 *
 * Each carried skill is matched by identity under the template's publisher, as installing does (I3): one not here is
 * installed and pinned, a newer one is stored and offered as an update, one here at that version or newer is left
 * alone. One an administrator removed stays removed: the agent is made without it, and its page shows it as missing.
 * The versions written record the template version's own source and signer, since that is where they came from.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import { formatAssetIdentity } from '@agenthix/core'
import type { PackageFile } from '../../library/packages/packageZip'
import { fingerprintOf } from '../content'
import { writeCarried } from '../install/commit'
import { findExisting } from '../install/lookup'
import { readParts } from '../install/parts'
import { classify } from '../install/plan'
import type { TemplateAsset } from './templateAssets'

const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

async function installOnce(db: PrismaClient, template: TemplateAsset, files: PackageFile[], byId: string | null): Promise<void> {
  const parts = readParts({ root: template.name, files })
  if (parts.embedded.length === 0) return
  await db.$transaction(async tx => {
    const version = await tx.assetVersion.findUniqueOrThrow({ where: { id: template.currentVersion.id } })
    const items = await Promise.all(parts.embedded.map(async part => classify(
      await findExisting(tx, 'skill', template.publisher, part.name),
      { kind: 'skill', name: part.name, title: part.title, version: part.version, fingerprint: fingerprintOf(part.files) },
      template.publisher,
      version.signerIdentity,
    )))
    await writeCarried(tx, items, parts, {
      source: version.source, sourceUrl: version.sourceUrl, signerKind: version.signerKind, signerIdentity: version.signerIdentity,
      trustedPublisherId: version.trustedPublisherId, byId, note: null,
    }, `Installed with ${formatAssetIdentity(template)} ${template.currentVersion.version}, when first used`, ['new', 'update'])
  }, TRANSACTION)
}

export async function installCarriedSkills(db: PrismaClient, template: TemplateAsset, files: PackageFile[], byId: string | null): Promise<void> {
  try {
    await installOnce(db, template, files, byId)
  } catch (err) {
    // Two first uses at once: the other one installed them, so this one looks again.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
    await installOnce(db, template, files, byId)
  }
}
