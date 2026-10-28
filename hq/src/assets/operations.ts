/**
 * Installing as Wasp operations (spec part 3; board U4): what installing a package would do, then installing it as
 * confirmed. Both go through the one pipeline (`install/`), which checks the policy itself. Hosted in `assets.wasp.ts`.
 */
import { HttpError, prisma } from 'wasp/server'
import { AssetFileListError } from '@agenthix/core'
import { PackageReadError } from './install/archive'
import { InstallRefusedError, installPackage } from './install/commit'
import { previewInstall } from './install/preview'
import type { Arrival, InstallConfirmation, InstallPreview, InstallResult } from './install/types'
import { PolicyError } from './policy'
import { personActor } from './policyActors'
import { createVerifier } from './signing'
import { NotOnShelfError, shelfArrival } from './sources/imageShelf'
import { uploadArrival, type UploadArgs } from './sources/upload'
import { linkArrival, sameReadError } from './sources/link'

type Ctx = { user?: { id: string } | null }

export type PackageFrom = { from: 'shelf'; name: string } | ({ from: 'upload' } & UploadArgs) | { from: 'url'; link: string }

function arrivalFor(args: PackageFrom): Promise<Arrival> {
  if (args?.from === 'shelf') return shelfArrival(args.name)
  if (args?.from === 'upload') return uploadArrival(args)
  if (args?.from === 'url') return linkArrival(args.link)
  throw new HttpError(400, 'Say where the package comes from: Agenthix, an upload or a link.')
}

/** A link's read errors all look alike (security review M3); other sources say what is wrong. */
function fromSource<T>(args: PackageFrom, work: () => Promise<T>): Promise<T> {
  return args?.from === 'url' ? sameReadError(work) : work()
}

/** Every refusal the pipeline makes, as the status a person's request gets. */
export async function asHttp<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof PolicyError) throw new HttpError(403, err.message)
    if (err instanceof InstallRefusedError) throw new HttpError(err.status, err.message)
    if (err instanceof NotOnShelfError) throw new HttpError(404, err.message)
    if (err instanceof PackageReadError || err instanceof AssetFileListError) throw new HttpError(400, err.message)
    throw err
  }
}

export const previewAssetInstall = async (args: PackageFrom, context: Ctx): Promise<InstallPreview> => {
  if (!context.user) throw new HttpError(401)
  const actor = await personActor(context.user.id, prisma)
  return asHttp(() => fromSource(args, async () => previewInstall(await arrivalFor(args), actor, { db: prisma, verifier: createVerifier(), now: new Date() })))
}

export const installAsset = async (args: PackageFrom & { confirm: InstallConfirmation }, context: Ctx): Promise<InstallResult> => {
  if (!context.user) throw new HttpError(401)
  if (!args?.confirm || typeof args.confirm.fingerprint !== 'string') throw new HttpError(400, 'Look at the package before installing it. Nothing was changed.')
  const actor = await personActor(context.user.id, prisma)
  return asHttp(() => fromSource(args, async () => installPackage(await arrivalFor(args), args.confirm, actor, { db: prisma, verifier: createVerifier(), now: new Date() })))
}
