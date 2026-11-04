/**
 * "Read it first" (board U4, D26): the files of a package that has not been installed, as text, so a person can read
 * what they are about to give to agents. Read through the same sources as installing, and only for a person who may
 * install it from where it comes. Text only and bounded; the page draws it as text, never as a page.
 */
import { HttpError, prisma } from 'wasp/server'
import { may, type AssetAction } from '../../policy'
import { organisationTarget, personActor } from '../../policyActors'
import { NotOnShelfError, shelfArrival } from '../../sources/imageShelf'
import { sameReadError, linkArrival } from '../../sources/link'
import { uploadArrival } from '../../sources/upload'
import { PackageReadError } from '../../install/archive'
import type { Arrival } from '../../install/types'

type Ctx = { user?: { id: string } | null }
type From = { from: 'shelf'; name: string } | { from: 'upload'; zip?: string; folder?: Array<{ path: string; base64: string }>; signature?: string | null } | { from: 'url'; link: string }

export const PACKAGE_TEXT_LIMIT = 200 * 1024
export const PACKAGE_FILES_LIMIT = 60

export type PackageFilesView = { files: Array<{ path: string; size: number; text: string | null }>; more: number }

const isText = (b: Buffer) => !b.subarray(0, 8192).includes(0)

export function packageFilesView(arrival: Arrival): PackageFilesView {
  const files = [...arrival.arrived.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return {
    files: files.slice(0, PACKAGE_FILES_LIMIT).map(f => ({
      path: f.path, size: f.content.length,
      text: f.content.length <= PACKAGE_TEXT_LIMIT && isText(f.content) ? f.content.toString('utf-8') : null,
    })),
    more: Math.max(0, files.length - PACKAGE_FILES_LIMIT),
  }
}

async function arrivalOf(args: From): Promise<Arrival> {
  if (args?.from === 'shelf') return shelfArrival(args.name)
  if (args?.from === 'upload') return uploadArrival(args)
  if (args?.from === 'url') return sameReadError(() => linkArrival(args.link))
  throw new HttpError(400, 'Say where the package comes from: Agenthix, an upload or a link. Nothing was changed.')
}

/** Reading a package needs the permission installing it would: from Agenthix's shelf, or from outside the Library. */
export const readAction = (args: Pick<From, 'from'> | undefined): AssetAction => (args?.from === 'shelf' ? 'install' : 'installFromOutside')

export const getPackageFiles = async (args: From, context: Ctx): Promise<PackageFilesView> => {
  if (!context.user) throw new HttpError(401)
  const actor = await personActor(context.user.id, prisma)
  const target = await organisationTarget(prisma)
  if (!may(actor, readAction(args), target)) {
    throw new HttpError(403, args?.from === 'shelf'
      ? 'Reading a package before installing it is for the people who may install. Nothing was changed.'
      : "Reading a package from a link or an upload before installing it is for the people the organisation lets install from outside Agenthix. Nothing was changed.")
  }
  try {
    return packageFilesView(await arrivalOf(args))
  } catch (err) {
    if (err instanceof NotOnShelfError) throw new HttpError(404, err.message)
    if (err instanceof PackageReadError) throw new HttpError(400, err.message)
    throw err
  }
}
