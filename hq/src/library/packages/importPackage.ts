/**
 * Imports a package into the library. Every kind is an asset and goes through the install pipeline
 * (`assets/install/`), signature check included; a template's skills are de-duplicated by identity as it installs.
 * A package from before assets (format 1) is refused with what to do.
 */
import { prisma } from 'wasp/server'
import { readZipPackage } from '../../assets/install/archive'
import { installPackage } from '../../assets/install/commit'
import { previewInstall } from '../../assets/install/preview'
import type { Arrival } from '../../assets/install/types'
import type { PersonActor } from '../../assets/policy'
import { createVerifier } from '../../assets/signing'
import type { PackageKind } from './packageManifest'

export class PackageImportError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) {
    super(message)
  }
}

export type ImportedItem = { kind: PackageKind; id: string; name: string }

/**
 * Import installs an asset when nothing needs confirming: Agenthix's own, or one signed by a publisher this
 * organisation trusts. An unsigned package or a new publisher needs the person to read it and choose, which Import
 * can't ask, so it is refused with what to do.
 */
async function importAsset(arrival: Arrival, actor: PersonActor): Promise<ImportedItem> {
  const deps = { db: prisma, verifier: createVerifier(), now: new Date() }
  const preview = await previewInstall(arrival, actor, deps)
  if (preview.refusal) throw new PackageImportError(preview.refusal)
  if (preview.needs.unsignedRead || preview.needs.publisherChoice) {
    throw new PackageImportError(`${preview.title} ${preview.needs.unsignedRead ? "isn't signed" : `is signed by ${preview.signedBy}, a publisher this organisation hasn't trusted`}, so it must be read and confirmed before it is installed, which Import can't ask for. Nothing was changed.`, 409)
  }
  const result = await installPackage(arrival, { fingerprint: preview.fingerprint }, actor, deps)
  return { kind: preview.kind, id: result.assetId ?? '', name: preview.title }
}

/** A package that can't be read, a format 1 one included, is refused by the pipeline's reader in its own words. */
export async function importLibraryPackage(buffer: Buffer, actor: PersonActor): Promise<ImportedItem> {
  const arrived = await readZipPackage(buffer)
  return importAsset({ source: 'upload', arrived, bundle: null, sourceUrl: null }, actor)
}
