/**
 * The install pipeline's second half: the package is looked at again, and installed only as the person confirmed it
 * (spec part 3 *The four states*, part 2 *Versions* V1 and *History*). The confirmation names the fingerprint that
 * was shown, so what is installed is exactly what was looked at; an unsigned package needs "I've read it"; a new
 * signer needs a choice, trusting it or installing once. Content is stored by digest and every pin move is recorded,
 * in one transaction. A newer version is stored and offered, never pinned by itself.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import { formatAssetIdentity, type BasedOnLine } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { storeContent } from '../content'
import { kindRow } from '../kinds'
import { assertMay, type PersonActor } from '../policy'
import { publisherNameProblem } from '../publisherNames'
import { canonicalSigner } from '../signing/signer'
import type { SignerIdentity } from '../signing/types'
import { readParts, type PackagePart, type PackageParts } from './parts'
import { previewInstall, type PipelineDeps } from './preview'
import type { PlanItem } from './plan'
import type { Arrival, InstallConfirmation, InstallPreview, InstallResult, NewPublisherChoice } from './types'

const NOTHING = 'Nothing was changed.'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

export class InstallRefusedError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 409 = 400) { super(message) }
}

const SOURCE_ROW = { image: 'BUILT_IN', upload: 'UPLOAD', url: 'URL' } as const

/** Credit a package brings is the package's statement: only lines hq writes in this organisation read as verified (M5). */
function statedLines(lines: BasedOnLine[]): BasedOnLine[] {
  return lines.map(l => ({ ...l, recorded: 'stated' as const }))
}

function confirmRefusal(preview: InstallPreview, confirmation: InstallConfirmation): string | null {
  if (preview.refusal) return preview.refusal
  if (confirmation.fingerprint !== preview.fingerprint) return `This package changed since it was shown. Look at it again before installing. ${NOTHING}`
  if (preview.needs.unsignedRead && confirmation.unsignedRead !== true) return `Tick “I've read it” before installing an unsigned ${preview.kind === 'skill' ? 'skill' : 'template'}. ${NOTHING}`
  if (preview.needs.publisherChoice && !confirmation.newPublisher) return `Choose whether to trust this publisher or install this once. ${NOTHING}`
  return null
}

/** Records a new signer: trusted from now on, or only remembered, so its name stays its own (`TrustedPublisher`). */
async function recordSigner(tx: Db, signer: SignerIdentity, choice: NewPublisherChoice, preview: InstallPreview, byId: string): Promise<{ name: string; trustedId: string | null }> {
  if (signer.kind !== 'keyless') throw new InstallRefusedError(`A key is trusted by adding it in the organisation's settings. ${NOTHING}`)
  const signerIdentity = canonicalSigner(signer)
  const known = await tx.trustedPublisher.findUnique({ where: { signerIdentity } })
  if (known) {
    if (choice.choice === 'once') return { name: known.name, trustedId: null }
    await tx.trustedPublisher.update({ where: { id: known.id }, data: { removedAt: null, removedById: null } })
    return { name: known.name, trustedId: known.id }
  }
  const name = preview.publisherFixed ? preview.publisher ?? choice.name : choice.name
  const [org, publishers] = await Promise.all([
    tx.org.findFirst({ select: { publisherName: true } }),
    tx.trustedPublisher.findMany({ select: { name: true } }),
  ])
  const problem = publisherNameProblem(name, { organisation: org?.publisherName ?? null, publishers: publishers.map(p => p.name) })
  if (problem) throw new InstallRefusedError(`${problem} ${NOTHING}`)
  const displayName = choice.displayName.trim().slice(0, 100) || name
  const tag = signer.ref?.startsWith('refs/tags/') ?? false
  const branch = signer.ref?.startsWith('refs/heads/') ? signer.ref.slice('refs/heads/'.length) : null
  const once = choice.choice === 'once'
  const row = await tx.trustedPublisher.create({
    data: {
      name, displayName, signerKind: 'KEYLESS', signerIdentity, issuer: signer.issuer, certificateIdentity: signer.identity,
      repository: signer.repository, allowTags: tag, allowedBranch: branch, addedById: byId,
      // Installed once: remembered, never trusted, so its name can't go to another signer and it asks again.
      removedAt: once ? new Date() : null, removedById: once ? byId : null,
    },
  })
  return { name, trustedId: once ? null : row.id }
}

function resultMessage(item: PlanItem): string {
  switch (item.outcome) {
    case 'new': return `Installed. ${item.title} ${item.version} is in the Library. No agent has it yet.`
    case 'restore': return `${item.title} is back in the Library at ${item.version}.`
    case 'update': return `${item.title} ${item.version} is ready as an update. Accept it on its page.`
    case 'same': return `${item.title} ${item.version} was already installed. ${NOTHING}`
    case 'older': return `You already have a newer ${item.title} (${item.installedVersion}). ${NOTHING}`
    case 'refused': return item.reason ?? NOTHING
  }
}

async function write(tx: Db, item: PlanItem, part: PackagePart, version: Prisma.AssetVersionUncheckedCreateInput, reason: string): Promise<string> {
  const assetId = item.existingId ?? (await tx.asset.create({
    data: { kind: kindRow(item.kind), publisher: item.publisher, name: item.name, suitedTo: part.suitedTo },
  })).id
  const held = item.held ? await tx.assetVersion.findUnique({ where: { assetId_version: { assetId, version: item.version } } }) : null
  const stored = held ?? await tx.assetVersion.create({ data: { ...version, assetId, digest: await storeContent(part.files, tx) } })
  if (item.outcome === 'update') return assetId
  const asset = await tx.asset.update({
    where: { id: assetId },
    data: { removedAt: null, removedById: null, suitedTo: part.suitedTo },
    select: { currentVersionId: true },
  })
  if (asset.currentVersionId !== stored.id) {
    await tx.asset.update({ where: { id: assetId }, data: { currentVersionId: stored.id } })
    await tx.assetPinChange.create({
      data: {
        assetId, fromVersionId: asset.currentVersionId, toVersionId: stored.id, byId: version.byId ?? null,
        requestedByAgentId: version.requestedByAgentId ?? null, reason,
      },
    })
  }
  return assetId
}

const WRITES: readonly PlanItem['outcome'][] = ['new', 'restore', 'update']

type VersionFields = Omit<Prisma.AssetVersionUncheckedCreateInput, 'assetId' | 'digest' | 'version' | 'basedOn' | 'licence'>

function versionRow(version: VersionFields, part: PackagePart, item: PlanItem, licence: string | null): Prisma.AssetVersionUncheckedCreateInput {
  return {
    ...version, assetId: '', digest: '', version: item.version, basedOn: statedLines(part.basedOn), licence: part.licence ?? licence,
    note: item.outcome === 'update' ? (version.note ?? 'Offered as an update') : version.note,
  }
}

/**
 * Writes the skills a template carries, each by its own outcome (I3): a new one installed and pinned, an update stored
 * and offered, a removed one brought back only where `outcomes` says so. In the caller's transaction.
 */
export async function writeCarried(
  tx: Db,
  items: PlanItem[],
  parts: PackageParts,
  version: VersionFields,
  reason: string,
  outcomes: readonly PlanItem['outcome'][] = WRITES,
): Promise<void> {
  for (const item of items) {
    if (!outcomes.includes(item.outcome)) continue
    const part = parts.embedded.find(p => p.name === item.name)
    if (part) await write(tx, item, part, versionRow(version, part, item, parts.licence), reason)
  }
}

/**
 * Writes what the plan says, in the caller's transaction: the package's own asset, then each skill a template carries,
 * de-duplicated by identity (I3): one already here at that version is reused, a newer one is offered as an update, an
 * older one leaves the installed one alone. Each carried skill keeps its own version; a role skill has its template's.
 * Nothing is written when the package itself is already here or older.
 */
export async function writePlan(
  tx: Db,
  plan: { main: PlanItem; embedded: PlanItem[] },
  parts: PackageParts,
  version: VersionFields,
  reason: string,
): Promise<string> {
  const assetId = await write(tx, plan.main, parts, versionRow(version, parts, plan.main, parts.licence), reason)
  await writeCarried(tx, plan.embedded, parts, version, `${reason}, with ${formatAssetIdentity(plan.main)}`)
  return assetId
}

export async function installPackage(
  arrival: Arrival,
  confirmation: InstallConfirmation,
  actor: PersonActor,
  deps: Omit<PipelineDeps, 'db'> & { db: PrismaClient },
  /** The agent whose request this person approved (D31): hq's record, never part of what a client confirms. */
  options: { requestedByAgentId?: string | null } = {},
): Promise<InstallResult> {
  const preview = await previewInstall(arrival, actor, deps)
  const refusal = confirmRefusal(preview, confirmation)
  if (refusal) throw new InstallRefusedError(refusal)
  const choice = preview.needs.publisherChoice ? confirmation.newPublisher! : null
  if (choice?.choice === 'trust') assertMay(actor, 'trust', { level: 'organisation', outsideInstallers: 'ADMINS' })
  const part = readParts(arrival.arrived)
  const note = confirmation.note?.trim().slice(0, 1000) || null
  try {
    return await deps.db.$transaction(async tx => {
      let { main } = preview
      let trustedId = preview.state === 'trusted' ? (await tx.trustedPublisher.findUnique({ where: { name: preview.publisher! }, select: { id: true } }))?.id ?? null : null
      if (choice && preview.signer) {
        const recorded = await recordSigner(tx, preview.signer, choice, preview, actor.userId)
        trustedId = recorded.trustedId
        if (recorded.name !== preview.publisher) throw new InstallRefusedError(`The publisher's name changed since this was shown. Look at it again. ${NOTHING}`, 409)
      }
      if (main.outcome === 'same' || main.outcome === 'older') return { assetId: main.existingId, identity: main.identity, version: main.version, outcome: main.outcome, message: resultMessage(main) }
      const signer = preview.signer
      const how = arrival.source === 'image' ? 'from Agenthix' : arrival.source === 'url' ? `from ${arrival.sourceUrl}` : 'from an upload'
      const assetId = await writePlan(tx, preview, part, {
        source: SOURCE_ROW[arrival.source], sourceUrl: arrival.sourceUrl,
        signerKind: signer ? (signer.kind === 'keyless' ? 'KEYLESS' : 'KEY') : 'NONE', signerIdentity: signer ? canonicalSigner(signer) : null,
        trustedPublisherId: trustedId, note, byId: actor.userId, requestedByAgentId: options.requestedByAgentId ?? null,
      }, note ?? `Installed ${how}`)
      main = { ...main, existingId: assetId }
      return { assetId, identity: formatAssetIdentity(main), version: main.version, outcome: main.outcome, message: resultMessage(main) }
    }, TRANSACTION)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new InstallRefusedError(`Someone installed this at the same moment. Look at it again. ${NOTHING}`, 409)
    }
    throw err
  }
}
