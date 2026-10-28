/**
 * The organisation's trusted publishers (P1; spec part 3 *Who signs*), administrators only: the list, adding a
 * keyless publisher or a key pair, trusting one remembered from an install, renaming one, and removing one. Agenthix is always on
 * the list and can't be removed: its packages come from HQ's own image, trusted by where they are (adr-0117). A row
 * is never deleted, so a publisher's name can never pass to a different signer.
 */
import { HttpError, prisma } from 'wasp/server'
import { AGENTHIX_PUBLISHER } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { publisherNameProblem } from '../publisherNames'
import { organisationTarget, requireMay } from '../policyActors'
import { publisherBinding, refsAllowed, type PublisherBinding } from './publisherInput'

type Ctx = { user?: { id: string } | null }

const NOTHING = 'Nothing was changed.'

export type TrustedPublisherView = {
  id: string | null
  name: string
  displayName: string
  kind: 'built-in' | 'keyless' | 'key'
  issuer: string | null
  identity: string | null
  repository: string | null
  /** What may sign, in words ("tags and branch main"); null for a person's identity, a key, or Agenthix. */
  refs: string | null
  keyId: string | null
  /** `remembered`: installed once, or removed; trusting it again keeps its name. */
  status: 'trusted' | 'remembered'
  removable: boolean
  addedById: string | null
  addedAt: string | null
  /** How many assets it signed are in the Library now. */
  installed: number
}

const AGENTHIX: TrustedPublisherView = {
  id: null, name: AGENTHIX_PUBLISHER, displayName: 'Agenthix', kind: 'built-in', issuer: null, identity: null,
  repository: null, refs: null, keyId: null, status: 'trusted', removable: false, addedById: null, addedAt: null, installed: 0,
}

type Row = Awaited<ReturnType<typeof prisma.trustedPublisher.findMany>>[number]

function view(row: Row, installed = 0): TrustedPublisherView {
  const key = row.signerKind === 'KEY'
  return {
    id: row.id, name: row.name, displayName: row.displayName, kind: key ? 'key' : 'keyless',
    issuer: row.issuer, identity: row.certificateIdentity, repository: row.repository,
    refs: key ? null : refsAllowed(row), keyId: key ? row.signerIdentity.replace(/^key:/, '') : null,
    status: row.removedAt ? 'remembered' : 'trusted', removable: !row.builtIn && !row.removedAt,
    addedById: row.addedById, addedAt: row.createdAt.toISOString(), installed,
  }
}

/** Assets in the Library now, by the publisher that signed them. */
async function installedBy(db: Db): Promise<Map<string, number>> {
  const groups = await db.asset.groupBy({ by: ['publisher'], where: { removedAt: null }, _count: { _all: true } })
  return new Map(groups.map(g => [g.publisher, g._count._all]))
}

async function requireTrust(context: Ctx, db: Db) {
  return requireMay(context, 'trust', await organisationTarget(db), db)
}

export const listTrustedPublishers = async (_args: unknown, context: Ctx): Promise<TrustedPublisherView[]> => {
  await requireTrust(context, prisma)
  const [rows, installed] = await Promise.all([
    prisma.trustedPublisher.findMany({ orderBy: [{ removedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }] }),
    installedBy(prisma),
  ])
  const count = (name: string) => installed.get(name) ?? 0
  return [{ ...AGENTHIX, installed: count(AGENTHIX_PUBLISHER) }, ...rows.filter(r => r.name !== AGENTHIX_PUBLISHER).map(r => view(r, count(r.name)))]
}

export type AddPublisherResult = { publisher: TrustedPublisherView; message: string }

/** Restores a remembered row for the same signer, with the bindings given now; its name stays its own. */
async function restore(row: Row, binding: PublisherBinding, byId: string): Promise<AddPublisherResult> {
  if (!row.removedAt) {
    throw new HttpError(409, `This signer is already trusted, as “${row.displayName}” (${row.name}). ${NOTHING}`)
  }
  if (row.builtIn) throw new HttpError(409, `This signer is Agenthix's own. ${NOTHING}`)
  const updated = await prisma.trustedPublisher.update({
    where: { id: row.id },
    data: {
      displayName: binding.displayName, repository: binding.repository, allowTags: binding.allowTags,
      allowedBranch: binding.allowedBranch, publicKey: binding.publicKey, removedAt: null, removedById: null, addedById: byId,
    },
  })
  const kept = row.name === binding.name ? '' : ` It keeps the name “${row.name}” it had, since what it signed is already named so.`
  return { publisher: view(updated), message: `${updated.displayName} is trusted again.${kept}` }
}

export const addTrustedPublisher = async (args: unknown, context: Ctx): Promise<AddPublisherResult> => {
  const actor = await requireTrust(context, prisma)
  const checked = publisherBinding(args)
  if (!checked.ok) throw new HttpError(400, checked.message)
  const { binding } = checked
  const same = await prisma.trustedPublisher.findUnique({ where: { signerIdentity: binding.signerIdentity } })
  if (same) return restore(same, binding, actor.userId)
  const [org, publishers] = await Promise.all([
    prisma.org.findFirst({ select: { publisherName: true } }),
    prisma.trustedPublisher.findMany({ select: { name: true } }),
  ])
  const problem = publisherNameProblem(binding.name, { organisation: org?.publisherName ?? null, publishers: publishers.map(p => p.name) })
  if (problem) throw new HttpError(400, `${problem} ${NOTHING}`)
  const created = await prisma.trustedPublisher.create({ data: { ...binding, addedById: actor.userId } })
  return { publisher: view(created), message: `${created.displayName} is trusted. What it signs installs as ${created.name}/….` }
}

/** Trusts a publisher remembered from an install ("install this once") or removed earlier, under its own name. */
export const trustPublisher = async (args: { id?: unknown; displayName?: unknown }, context: Ctx): Promise<AddPublisherResult> => {
  const actor = await requireTrust(context, prisma)
  if (typeof args?.id !== 'string') throw new HttpError(400, `Say which publisher to trust. ${NOTHING}`)
  const row = await prisma.trustedPublisher.findUnique({ where: { id: args.id } })
  if (!row) throw new HttpError(404, `That publisher isn't known here. ${NOTHING}`)
  if (!row.removedAt) throw new HttpError(409, `${row.displayName} is already trusted. ${NOTHING}`)
  if (row.signerKind === 'KEY' && !row.publicKey) throw new HttpError(409, `Add this publisher's public key to trust it. ${NOTHING}`)
  const displayName = typeof args.displayName === 'string' && args.displayName.trim() ? args.displayName.trim().slice(0, 100) : row.displayName
  const updated = await prisma.trustedPublisher.update({
    where: { id: row.id },
    data: { displayName, removedAt: null, removedById: null, addedById: actor.userId },
  })
  return { publisher: view(updated), message: `${updated.displayName} is trusted. What it signs installs as ${updated.name}/….` }
}

/**
 * Renames a publisher: only the name shown as "Signed by …" (D9). The name in what it signs (`acme/…`) never changes,
 * so nothing installed is renamed and no identity can move to another signer.
 */
export const renameTrustedPublisher = async (args: { id?: unknown; displayName?: unknown }, context: Ctx): Promise<AddPublisherResult> => {
  await requireTrust(context, prisma)
  if (typeof args?.id !== 'string') throw new HttpError(400, `Say which publisher to rename. ${NOTHING}`)
  const displayName = typeof args.displayName === 'string' ? args.displayName.trim() : ''
  if (!displayName) throw new HttpError(400, `Give the publisher a name to show. ${NOTHING}`)
  if (displayName.length > 100) throw new HttpError(400, `A publisher's name is at most 100 characters. ${NOTHING}`)
  const row = await prisma.trustedPublisher.findUnique({ where: { id: args.id } })
  if (!row) throw new HttpError(404, `That publisher isn't known here. ${NOTHING}`)
  if (row.builtIn || row.name === AGENTHIX_PUBLISHER) throw new HttpError(409, `Agenthix's name comes with HQ itself. ${NOTHING}`)
  const updated = await prisma.trustedPublisher.update({ where: { id: row.id }, data: { displayName } })
  const installed = (await installedBy(prisma)).get(updated.name) ?? 0
  return { publisher: view(updated, installed), message: `${updated.name} is shown as “${updated.displayName}”. What it signed keeps its name, ${updated.name}/….` }
}

/**
 * Removes a publisher: nothing it signs is trusted from now on. What it already signed stays installed and keeps its
 * name; the row stays, so the name can never be given to another signer.
 */
export const removeTrustedPublisher = async (args: { id?: unknown }, context: Ctx): Promise<{ message: string }> => {
  const actor = await requireTrust(context, prisma)
  if (typeof args?.id !== 'string') throw new HttpError(400, `Say which publisher to remove. ${NOTHING}`)
  const row = await prisma.trustedPublisher.findUnique({ where: { id: args.id } })
  if (!row) throw new HttpError(404, `That publisher isn't known here. ${NOTHING}`)
  if (row.builtIn || row.name === AGENTHIX_PUBLISHER) throw new HttpError(409, `Agenthix is always trusted: its packages come with HQ itself. ${NOTHING}`)
  if (row.removedAt) throw new HttpError(409, `${row.displayName} isn't trusted. ${NOTHING}`)
  await prisma.trustedPublisher.update({ where: { id: row.id }, data: { removedAt: new Date(), removedById: actor.userId } })
  return { message: `${row.displayName} is no longer trusted. What it signed stays installed; anything new it signs asks first.` }
}
