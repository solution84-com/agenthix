/**
 * Any version on purpose (spec part 2 *Versions* V3, D30; security review M4): an administrator or Library
 * maintainer installs a particular version of a skill already installed, newer or older, from a package at hand. It
 * goes through the install pipeline's check as any install does (`install/preview.ts`), names the fingerprint that was
 * shown, needs a reason, and says plainly when it goes back; a withdrawn version needs its warning accepted. The pin
 * moves to it at once and the history records who, when and why.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import type { Db } from '../../packages/packageStore'
import { storeContent } from '../content'
import { readParts } from '../install/parts'
import { previewInstall, type PipelineDeps } from '../install/preview'
import type { Arrival, InstallPreview } from '../install/types'
import { assertMay, type PersonActor } from '../policy'
import { canonicalSigner } from '../signing/signer'
import { LifecycleError } from './errors'
import { libraryTarget, movePin } from './records'
import { heldLines } from './provenance'
import { loadWithdrawnList, withdrawnReason, withdrawnRefusal } from './withdrawn'

const NOTHING = 'Nothing was changed.'
const REASON_MAX = 1000
const SOURCE_ROW = { image: 'BUILT_IN', upload: 'UPLOAD', url: 'URL' } as const

export type OnPurposeConfirmation = {
  /** The skill whose page the person is on; a package of any other skill is refused. */
  assetId?: string
  fingerprint: string
  /** Why this version, for the history (D30). */
  reason: string
  unsignedRead?: boolean
  withdrawnAccepted?: boolean
}

export function refusalOf(preview: InstallPreview, confirm: OnPurposeConfirmation): string | null {
  if (preview.refusal) return preview.refusal
  if (confirm.fingerprint !== preview.fingerprint) return `This package changed since it was shown. Look at it again. ${NOTHING}`
  if (preview.kind !== 'skill') return `Only skills can be installed this way yet. ${NOTHING}`
  if (confirm.assetId !== undefined && preview.main.existingId !== null && preview.main.existingId !== confirm.assetId) {
    return `This package is ${preview.main.identity}, not the skill whose page you are on. Open ${preview.main.identity}'s page to move its version. ${NOTHING}`
  }
  if (preview.needs.publisherChoice) {
    return `Its publisher isn't trusted here. Trust it in the organisation's settings, or install it from Add, before choosing a version. ${NOTHING}`
  }
  if (preview.needs.unsignedRead && confirm.unsignedRead !== true) return `Tick “I've read it” before installing an unsigned skill. ${NOTHING}`
  switch (preview.main.outcome) {
    case 'new': case 'restore': return `${preview.main.identity} isn't installed here. Install it from Add. ${NOTHING}`
    case 'same': return `${preview.main.identity} ${preview.version} is already the version in use. ${NOTHING}`
    default: return null
  }
}

async function trustedPublisherId(tx: Db, preview: InstallPreview): Promise<string | null> {
  if (preview.state !== 'trusted' || !preview.publisher) return null
  return (await tx.trustedPublisher.findUnique({ where: { name: preview.publisher }, select: { id: true } }))?.id ?? null
}

export async function installVersionOnPurpose(
  arrival: Arrival,
  confirm: OnPurposeConfirmation,
  actor: PersonActor,
  deps: Omit<PipelineDeps, 'db'> & { db: PrismaClient },
): Promise<{ identity: string; version: string; back: boolean; message: string }> {
  assertMay(actor, 'rollBack', await libraryTarget(deps.db))
  const reason = typeof confirm?.reason === 'string' ? confirm.reason.trim().slice(0, REASON_MAX) : ''
  if (!reason) throw new LifecycleError(`Say why you are installing this version; it goes in the history. ${NOTHING}`)
  const preview = await previewInstall(arrival, actor, deps)
  const refusal = refusalOf(preview, confirm)
  if (refusal) throw new LifecycleError(refusal, 409)
  const { main } = preview
  const why = withdrawnReason(await loadWithdrawnList(), { publisher: main.publisher, name: main.name, version: main.version })
  const warning = withdrawnRefusal(main.identity, main.version, why, confirm.withdrawnAccepted === true)
  if (warning) throw new LifecycleError(warning, 409)

  const part = readParts(arrival.arrived)
  const back = main.outcome === 'older'
  await deps.db.$transaction(async tx => {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: main.existingId! }, select: { id: true, currentVersionId: true } })
    let version = await tx.assetVersion.findUnique({ where: { assetId_version: { assetId: asset.id, version: main.version } } })
    if (!version) {
      const signer = preview.signer
      const row: Prisma.AssetVersionUncheckedCreateInput = {
        assetId: asset.id, version: main.version, digest: await storeContent(part.files, tx), source: SOURCE_ROW[arrival.source],
        sourceUrl: arrival.sourceUrl, signerKind: signer ? (signer.kind === 'keyless' ? 'KEYLESS' : 'KEY') : 'NONE',
        signerIdentity: signer ? canonicalSigner(signer) : null, trustedPublisherId: await trustedPublisherId(tx, preview),
        // What a package says it is based on is its signer's statement (M5).
        basedOn: heldLines(part.basedOn).map(l => ({ ...l, recorded: 'stated' as const })),
        licence: part.licence, note: reason, byId: actor.userId, withdrawn: why !== null, withdrawnReason: why,
      }
      version = await tx.assetVersion.create({ data: row })
    }
    await movePin(tx, {
      assetId: asset.id, fromVersionId: asset.currentVersionId, toVersionId: version.id, byId: actor.userId,
      reason: `${back ? 'Went back' : 'Went forward'} to ${main.version} on purpose: ${reason}`,
    })
  }, { timeout: 30_000, maxWait: 10_000 })
  const message = back
    ? `${main.identity} went back to ${main.version}, an older version than the one that was in use (${main.installedVersion}).`
    : `${main.identity} is now at ${main.version}.`
  return { identity: main.identity, version: main.version, back, message }
}
