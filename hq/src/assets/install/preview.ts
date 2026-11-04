/**
 * The install pipeline's first half (adr-0158; spec part 3): an arrived package read, validated, fingerprinted over
 * exactly its files, its signature checked against the signed statement, its state and publisher decided, and every
 * asset in it matched against what is installed, before anything is written. Installing (`commit.ts`) runs this
 * again and acts only on what the person confirmed.
 */
import { ASSET_MANIFEST_FORMAT, UNSIGNED_PUBLISHER, formatAssetIdentity, signedStatement } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { fingerprintOf } from '../content'
import { assertMay, may, type Actor } from '../policy'
import { publisherNameProblem, suggestedPublisherName } from '../publisherNames'
import { canonicalSigner, describeSigner, trustedPublisherRecord } from '../signing/signer'
import type { SignatureVerifier, TrustedPublisherRecord, VerifyOutcome } from '../signing/types'
import { validateSkill } from '../validation'
import { validateTemplate } from './templateFiles'
import { validateTeamTemplate } from './teamTemplateFile'
import { decide, type Decision } from './decide'
import { findExisting } from './lookup'
import { readParts, type PackagePart, type PackageParts } from './parts'
import { classify, summarise, type PlanItem } from './plan'
import type { Arrival, InstallPreview } from './types'

export type PipelineDeps = { db: Db; verifier: SignatureVerifier; now: Date }

const NOTHING = 'Nothing was changed.'

function validationOf(parts: PackageParts): { errors: string[]; warnings: string[] } {
  const skills: PackagePart[] = parts.kind === 'skill' ? [parts] : parts.embedded
  const results = skills.map(s => {
    // A role skill runs under its own last part (`template/skill` stages as `skill`), so that part is what is checked.
    const v = validateSkill(s.name.slice(s.name.lastIndexOf('/') + 1), s.files)
    const prefix = parts.kind === 'skill' ? '' : `${s.name}: `
    return { errors: v.errors.map(e => prefix + e), warnings: v.warnings.map(w => prefix + w) }
  })
  if (parts.kind === 'agent' || parts.kind === 'board') results.unshift(validateTemplate(parts.kind, parts.files))
  if (parts.kind === 'team') results.unshift(validateTeamTemplate(parts.files))
  return { errors: results.flatMap(r => r.errors), warnings: results.flatMap(r => r.warnings) }
}

async function checkSignature(arrival: Arrival, parts: PackageParts, fingerprint: string, deps: PipelineDeps) {
  if (arrival.source === 'image') return { outcome: null, trustRoot: null }
  if (parts.plain || parts.claim === null) return { outcome: { state: 'unsigned' } as VerifyOutcome, trustRoot: null }
  const rows = await deps.db.trustedPublisher.findMany({ where: { removedAt: null } })
  const trusted = rows.map(trustedPublisherRecord).filter((r): r is TrustedPublisherRecord => r !== null)
  const statement = Buffer.from(signedStatement({
    format: ASSET_MANIFEST_FORMAT, kind: parts.kind, publisher: parts.claim, name: parts.name, version: parts.version, fingerprint,
  }), 'utf-8')
  const outcome = await deps.verifier.verify({ statement, bundle: arrival.bundle, trusted, now: deps.now })
  const age = arrival.bundle ? deps.verifier.trustRootAge(deps.now) : null
  return { outcome, trustRoot: age && { issuedAt: age.issuedAt.toISOString(), expired: age.expired } }
}

/** A new signer's publisher: the name it already has here, or a free one to offer. */
async function newSignerPublisher(d: Decision, db: Db, organisation: string | null): Promise<{ publisher: string | null; fixed: boolean; refusal: string | null }> {
  if (!d.signer) return { publisher: null, fixed: false, refusal: null }
  const known = await db.trustedPublisher.findUnique({ where: { signerIdentity: canonicalSigner(d.signer) } })
  if (known && !known.removedAt) {
    // The signer is trusted, but this signature doesn't meet its constraints: a branch it doesn't release from (H2).
    return { publisher: null, fixed: true, refusal: `This was signed by ${describeSigner(d.signer)}, which isn't where ${known.displayName} releases from. It won't be installed. ${NOTHING}` }
  }
  if (known) return { publisher: known.name, fixed: true, refusal: null }
  const publishers = (await db.trustedPublisher.findMany({ select: { name: true } })).map(p => p.name)
  const base = suggestedPublisherName(d.signer)
  let name = base
  for (let n = 2; publisherNameProblem(name, { organisation, publishers }) !== null && n < 100; n++) name = `${base.slice(0, 60)}-${n}`
  return { publisher: name, fixed: false, refusal: null }
}

type OrgSettings = { unsignedAssetsAllowed: boolean; outsideInstallers: 'ADMINS' | 'ADMINS_AND_MAINTAINERS'; publisherName: string | null } | null

async function orgSettings(db: Db): Promise<OrgSettings> {
  return db.org.findFirst({ select: { unsignedAssetsAllowed: true, outsideInstallers: true, publisherName: true } })
}

export async function previewInstall(arrival: Arrival, actor: Actor, deps: PipelineDeps): Promise<InstallPreview> {
  const org = await orgSettings(deps.db)
  const target = { level: 'organisation', outsideInstallers: org?.outsideInstallers ?? 'ADMINS' } as const
  assertMay(actor, arrival.source === 'image' ? 'install' : 'installFromOutside', target)
  return { ...(await planArrival(arrival, deps, org)), mayTrust: may(actor, 'trust', target) }
}

/**
 * Agenthix's own templates in hq's image, installed by hq itself at boot (`templates/imageTemplates.ts`): the same
 * plan with no person, so no policy. Only the image may be planned this way; it is trusted by where it is (adr-0117).
 */
export async function previewImageInstall(arrival: Arrival, deps: PipelineDeps): Promise<InstallPreview> {
  if (arrival.source !== 'image') throw new Error('Only a package from hq\'s image is installed without a person.')
  return planArrival(arrival, deps, await orgSettings(deps.db))
}

async function planArrival(arrival: Arrival, deps: PipelineDeps, org: OrgSettings): Promise<InstallPreview> {
  const parts = readParts(arrival.arrived)
  const fingerprint = fingerprintOf(parts.files)
  const { errors, warnings } = validationOf(parts)
  if (arrival.source !== 'image' && parts.plain && arrival.bundle) {
    warnings.push('A plain skill folder has no package.json for a signature to cover, so the signature beside it was ignored and it counts as unsigned.')
  }
  const { outcome, trustRoot } = await checkSignature(arrival, parts, fingerprint, deps)
  const decision = decide(arrival.source, outcome, parts)
  warnings.push(...decision.warnings)

  let { publisher, refusal } = decision
  let fixed = decision.state !== 'new-publisher'
  if (!refusal && decision.state === 'new-publisher') {
    const chosen = await newSignerPublisher(decision, deps.db, org?.publisherName ?? null)
    ;({ publisher, refusal } = chosen)
    fixed = chosen.fixed
  }
  if (!refusal && decision.state === 'unsigned' && org && !org.unsignedAssetsAllowed) {
    refusal = `Your organisation doesn't allow unsigned packages. An administrator can allow them in the organisation's settings. ${NOTHING}`
  }
  if (!refusal && errors.length) refusal = `This can't be installed: ${errors.slice(0, 3).join(' ')} ${NOTHING}`

  const signerIdentity = decision.signer ? canonicalSigner(decision.signer) : null
  const shown = publisher ?? parts.claim ?? UNSIGNED_PUBLISHER
  const plan = async (part: PackagePart): Promise<PlanItem> => {
    const input = { kind: part.kind, name: part.name, title: part.title, version: part.version, fingerprint: fingerprintOf(part.files) }
    if (refusal || publisher === null) return classify(null, input, shown, signerIdentity)
    return classify(await findExisting(deps.db, part.kind, publisher, part.name), input, publisher, signerIdentity)
  }
  const main = await plan(parts)
  const embedded = await Promise.all(parts.embedded.map(plan))
  const refused = [main, ...embedded].find(i => i.outcome === 'refused')
  if (!refusal && refused) refusal = `${refused.reason} ${NOTHING}`

  return {
    source: arrival.source, sourceUrl: arrival.sourceUrl, state: decision.state, publisher, publisherFixed: fixed,
    signer: decision.signer, signedBy: decision.signer ? describeSigner(decision.signer) : null, trustRoot,
    kind: parts.kind, name: parts.name, version: parts.version, title: parts.title, description: parts.description,
    licence: parts.licence, fingerprint, main, embedded, summary: refusal ? refusal : summarise(main, embedded), warnings, refusal,
    needs: { unsignedRead: decision.state === 'unsigned', publisherChoice: decision.state === 'new-publisher' && !refusal },
  }
}

export function identityOf(preview: InstallPreview): string {
  return formatAssetIdentity({ publisher: preview.publisher ?? UNSIGNED_PUBLISHER, name: preview.name })
}
