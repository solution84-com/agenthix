/**
 * Moving the Fleet Console without breaking any machine's pin (host-management spec §7; core's join.ts), hq's part.
 * The running Fleet Console opens a handover with the lookup of a code it made on its own machine, and hq keeps only
 * the lookup's hash. A new Fleet Console that presents the lookup claims it, once; hq passes its identity and binding to
 * the running one, and the running one's answer back, reading neither. When the new one says it holds the machines,
 * hq gives it a lasting credential and keeps only its hash on the handover (SENT). Only once the new one acknowledges
 * it — on the same connection, or by presenting it when that connection dropped first — is the move done (DONE): hq
 * retires the one before (the credential and the pairing secret), routes every machine's envelopes to the new
 * fingerprint, and keeps the signed certificate to hand each machine as it connects. Until then the running one keeps
 * its credential and its machines, so a connection lost in between leaves the fleet where it was.
 *
 * Nothing here is what keeps a machine safe: a machine follows only a certificate its own pinned Fleet Console signed,
 * and that Fleet Console signs only for an identity whose binding needs the code, which hq never sees.
 */
import { createHash } from 'node:crypto'
import { prisma } from 'wasp/server'
import { CONSOLE_CREDENTIAL_PREFIX, parseHandoverCertificate, type HostIdentity, type ConsoleHandoverCertificate } from '@agenthix/core'
import { fingerprintOf } from '@agenthix/core/host-crypto'
import { credentialMatches, generateCredential, hashCredential } from '../sites/credentials'
import { MAX_JOIN_TTL_MS, ConsoleRefusal } from './consoleMethods'

const lookupHash = (lookup: string) => createHash('sha256').update(lookup.toLowerCase(), 'utf8').digest('hex')

/** How many certificates a machine is handed as it connects: enough to follow every move it slept through. */
const CERTIFICATES_KEPT = 20
/** How long a new Fleet Console has to acknowledge its credential, past the code's hour if need be. */
const ACKNOWLEDGE_WITHIN_MS = 10 * 60_000
const WAITING = ['OPEN', 'CLAIMED', 'ACCEPTED', 'SENT']

export async function openHandover(input: { lookup: string; expiresAt: string }, now = new Date()): Promise<{ handoverId: string }> {
  const asked = Date.parse(input.expiresAt)
  if (!(asked > now.getTime())) throw new ConsoleRefusal('not_allowed', 'That code has already expired.')
  try {
    const row = await prisma.$transaction(async tx => {
      // One handover at a time: a new code withdraws any earlier one not yet done.
      await tx.consoleHandover.updateMany({ where: { state: { in: WAITING } }, data: { state: 'CLOSED' } })
      return tx.consoleHandover.create({
        data: { lookupHash: lookupHash(input.lookup), expiresAt: new Date(Math.min(asked, now.getTime() + MAX_JOIN_TTL_MS)) },
      })
    })
    return { handoverId: row.id }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw new ConsoleRefusal('not_allowed', 'That code was used before; make a new one.')
    throw err
  }
}

/** Spends the lookup: the handover it opens, or null. */
export async function claimHandover(lookup: string, now = new Date()): Promise<{ handoverId: string; expiresAt: Date } | null> {
  const hash = lookupHash(lookup)
  const { count } = await prisma.consoleHandover.updateMany({
    where: { lookupHash: hash, state: 'OPEN', expiresAt: { gt: now } },
    data: { state: 'CLAIMED' },
  })
  if (count !== 1) return null
  const row = await prisma.consoleHandover.findUnique({ where: { lookupHash: hash } })
  return row && { handoverId: row.id, expiresAt: row.expiresAt }
}

/** The new Fleet Console's fingerprint, computed here from the identity it sent; once. */
export async function recordHandoverAsk(handoverId: string, identity: HostIdentity, now = new Date()): Promise<string | null> {
  const newFingerprint = await fingerprintOf(identity)
  const { count } = await prisma.consoleHandover.updateMany({
    where: { id: handoverId, state: 'CLAIMED', newFingerprint: null, expiresAt: { gt: now } },
    data: { newFingerprint },
  })
  return count === 1 ? newFingerprint : null
}

export async function acceptHandover(handoverId: string, oldIdentity: HostIdentity, now = new Date()): Promise<boolean> {
  const { count } = await prisma.consoleHandover.updateMany({
    where: { id: handoverId, state: 'CLAIMED', newFingerprint: { not: null }, expiresAt: { gt: now } },
    data: { state: 'ACCEPTED', oldFingerprint: await fingerprintOf(oldIdentity) },
  })
  return count === 1
}

export type CompletedHandover = { oldFingerprint: string; newFingerprint: string; certificate: ConsoleHandoverCertificate }

/**
 * The new Fleet Console holds the machines: its lasting credential, of which hq keeps the hash on the handover until it
 * is acknowledged. Null when the certificate does not name the two Fleet Consoles of this handover, or the handover is
 * not waiting for it.
 */
export async function issueHandoverCredential(handoverId: string, raw: unknown, now = new Date()): Promise<string | null> {
  const certificate = parseHandoverCertificate(raw)
  if (!certificate) return null
  const newFingerprint = await fingerprintOf(certificate.to)
  const row = await prisma.consoleHandover.findUnique({ where: { id: handoverId } })
  if (!row || row.state !== 'ACCEPTED' || row.expiresAt <= now || !row.oldFingerprint) return null
  if (row.newFingerprint !== newFingerprint || certificate.from !== row.oldFingerprint) return null
  const { value: credential } = generateCredential(CONSOLE_CREDENTIAL_PREFIX)
  const { count } = await prisma.consoleHandover.updateMany({
    where: { id: handoverId, state: 'ACCEPTED' },
    data: {
      state: 'SENT', certificate, credentialHash: hashCredential(credential),
      expiresAt: new Date(Math.max(row.expiresAt.getTime(), now.getTime() + ACKNOWLEDGE_WITHIN_MS)),
    },
  })
  return count === 1 ? credential : null
}

/**
 * The new Fleet Console keeps its credential: the move is done, in one transaction — its credential the only one, the
 * one before and the pairing secret retired, every machine routed to it. Null when the handover is not waiting for it.
 */
export async function completeHandover(handoverId: string, now = new Date()): Promise<CompletedHandover | null> {
  return prisma.$transaction(async tx => {
    const { count } = await tx.consoleHandover.updateMany({
      where: { id: handoverId, state: 'SENT', expiresAt: { gt: now } },
      data: { state: 'DONE', completedAt: now },
    })
    if (count !== 1) return null
    const row = await tx.consoleHandover.findUnique({ where: { id: handoverId } })
    const certificate = parseHandoverCertificate(row?.certificate)
    if (!row?.credentialHash || !row.oldFingerprint || !row.newFingerprint || !certificate) {
      throw new Error('A handover waiting for its acknowledgement holds no credential or certificate.')
    }
    // One Fleet Console at a time: the credential before it goes, and with any credential the pairing secret.
    await tx.consoleCredential.deleteMany({})
    await tx.consoleCredential.create({ data: { credentialHash: row.credentialHash, issuedAt: now } })
    await tx.consoleCode.updateMany({ where: { usedAt: null, revokedAt: null }, data: { revokedAt: now } })
    await tx.relayHost.updateMany({ where: { consoleFingerprint: row.oldFingerprint }, data: { consoleFingerprint: row.newFingerprint } })
    return { oldFingerprint: row.oldFingerprint, newFingerprint: row.newFingerprint, certificate }
  })
}

/** A new Fleet Console whose connection dropped before it acknowledged presents the credential instead: the same. */
export async function completeHandoverWithCredential(
  presented: string, now = new Date(),
): Promise<(CompletedHandover & { handoverId: string }) | null> {
  const row = await prisma.consoleHandover.findFirst({
    where: { state: 'SENT', credentialHash: hashCredential(presented), expiresAt: { gt: now } },
  })
  if (!row?.credentialHash || !credentialMatches(presented, row.credentialHash)) return null
  const done = await completeHandover(row.id, now)
  return done && { ...done, handoverId: row.id }
}

export async function closeHandover(handoverId: string): Promise<boolean> {
  const { count } = await prisma.consoleHandover.updateMany({
    where: { id: handoverId, state: { in: WAITING } },
    data: { state: 'CLOSED' },
  })
  return count === 1
}

/** Every certificate of a finished move, oldest first, for a machine that connects. */
export async function handoverCertificates(): Promise<ConsoleHandoverCertificate[]> {
  const rows = await prisma.consoleHandover.findMany({
    where: { state: 'DONE' }, orderBy: { completedAt: 'desc' }, take: CERTIFICATES_KEPT, select: { certificate: true },
  })
  return rows.reverse().map(r => parseHandoverCertificate(r.certificate)).filter((c): c is ConsoleHandoverCertificate => c !== null)
}
