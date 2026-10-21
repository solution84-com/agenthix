/**
 * Moving the Fleet Console (host-management spec §7), hq's part against the real test database: a handover opened by
 * the running Fleet Console's lookup, claimed once, answered, and done — after which the new Fleet Console's credential
 * is the only one, every machine is routed to it, and the certificate is kept for machines that connect later.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { fingerprintOf, generateHostKeys, signHandoverCertificate } from '@agenthix/core/host-crypto'
import {
  acceptHandover, claimHandover, closeHandover, completeHandover, completeHandoverWithCredential, handoverCertificates,
  issueHandoverCredential, openHandover, recordHandoverAsk,
} from '../handover'
import { authenticateConsole } from '../consoleCredential'

const SECRET = 'p'.repeat(40)
const env = { HQ_CONSOLE_PAIRING_SECRET: SECRET } as NodeJS.ProcessEnv
const LOOKUP = 'd'.repeat(64)
const inAnHour = () => new Date(Date.now() + 3600_000).toISOString()

async function consoles() {
  const old = await generateHostKeys('console')
  const next = await generateHostKeys('console')
  return { old, next, oldFp: await fingerprintOf(old.identity), newFp: await fingerprintOf(next.identity) }
}

async function aHost(consoleFingerprint: string, fingerprint = 'e'.repeat(64)) {
  return prisma.relayHost.create({
    data: { fingerprint, signingKey: 's', sealingKey: 's', machineName: 'office-server', consoleFingerprint, credentialHash: `h-${fingerprint}` },
  })
}

describe('a handover @SC-937', () => {
  it('is claimed once, by its lookup, and keeps only the lookup’s hash', async () => {
    const { handoverId } = await openHandover({ lookup: LOOKUP, expiresAt: inAnHour() })
    expect(JSON.stringify(await prisma.consoleHandover.findMany())).not.toContain(LOOKUP)
    expect(await claimHandover(LOOKUP)).toMatchObject({ handoverId })
    expect(await claimHandover(LOOKUP)).toBeNull()
  })

  it('withdraws an earlier one still open when a new one opens', async () => {
    await openHandover({ lookup: LOOKUP, expiresAt: inAnHour() })
    await openHandover({ lookup: 'f'.repeat(64), expiresAt: inAnHour() })
    expect(await claimHandover(LOOKUP)).toBeNull()
  })

  it('when done, retires the credential and the pairing secret, routes every machine to the new one and keeps the certificate', async () => {
    const { old, next, oldFp, newFp } = await consoles()
    const host = await aHost(oldFp)
    const { handoverId } = await openHandover({ lookup: LOOKUP, expiresAt: inAnHour() })
    await claimHandover(LOOKUP)
    expect(await recordHandoverAsk(handoverId, next.identity)).toBe(newFp)
    expect(await acceptHandover(handoverId, old.identity)).toBe(true)
    const certificate = await signHandoverCertificate(old, next.identity, 'laptop')
    const credential = await issueHandoverCredential(handoverId, certificate)
    expect(credential).toMatch(/^fcc_/)
    expect(JSON.stringify(await prisma.consoleHandover.findMany())).not.toContain(credential!)
    // Not done until the new one acknowledges it: the running one keeps its pairing secret and its machines.
    expect(await authenticateConsole(SECRET, env)).toBe(true)
    expect(await authenticateConsole(credential!, env)).toBe(false)
    expect(await handoverCertificates()).toEqual([])
    expect((await prisma.relayHost.findUnique({ where: { id: host.id } }))?.consoleFingerprint).toBe(oldFp)

    const done = await completeHandover(handoverId)
    expect(done).toEqual({ oldFingerprint: oldFp, newFingerprint: newFp, certificate })
    expect(await authenticateConsole(credential!, env)).toBe(true)
    expect(await authenticateConsole(SECRET, env)).toBe(false)
    expect((await prisma.relayHost.findUnique({ where: { id: host.id } }))?.consoleFingerprint).toBe(newFp)
    expect(await handoverCertificates()).toEqual([certificate])
    // Done once.
    expect(await completeHandover(handoverId)).toBeNull()
    expect(await completeHandoverWithCredential(credential!)).toBeNull()
  })

  it('is done when the new one presents its credential instead of acknowledging it, and not with any other', async () => {
    const { old, next, oldFp, newFp } = await consoles()
    await aHost(oldFp)
    const { handoverId } = await openHandover({ lookup: LOOKUP, expiresAt: inAnHour() })
    await claimHandover(LOOKUP)
    await recordHandoverAsk(handoverId, next.identity)
    await acceptHandover(handoverId, old.identity)
    const credential = await issueHandoverCredential(handoverId, await signHandoverCertificate(old, next.identity, 'laptop'))
    expect(await completeHandoverWithCredential('fcc_not-the-one')).toBeNull()
    expect(await completeHandoverWithCredential(credential!)).toMatchObject({ handoverId, oldFingerprint: oldFp, newFingerprint: newFp })
    expect(await authenticateConsole(credential!, env)).toBe(true)
  })

  it('leaves the running one in place when the new one never acknowledges in time', async () => {
    const { old, next, oldFp } = await consoles()
    const host = await aHost(oldFp)
    const { handoverId } = await openHandover({ lookup: LOOKUP, expiresAt: inAnHour() })
    await claimHandover(LOOKUP)
    await recordHandoverAsk(handoverId, next.identity)
    await acceptHandover(handoverId, old.identity)
    const credential = await issueHandoverCredential(handoverId, await signHandoverCertificate(old, next.identity, 'laptop'))
    const later = new Date(Date.now() + 2 * 3600_000)
    expect(await completeHandover(handoverId, later)).toBeNull()
    expect(await completeHandoverWithCredential(credential!, later)).toBeNull()
    expect(await authenticateConsole(SECRET, env)).toBe(true)
    expect((await prisma.relayHost.findUnique({ where: { id: host.id } }))?.consoleFingerprint).toBe(oldFp)
  })

  it('is not done with a certificate that names another Fleet Console, or before the running one answered', async () => {
    const { old, next } = await consoles()
    const intruder = await generateHostKeys('console')
    const { handoverId } = await openHandover({ lookup: LOOKUP, expiresAt: inAnHour() })
    await claimHandover(LOOKUP)
    await recordHandoverAsk(handoverId, next.identity)
    expect(await issueHandoverCredential(handoverId, await signHandoverCertificate(old, next.identity, 'laptop'))).toBeNull()
    await acceptHandover(handoverId, old.identity)
    expect(await issueHandoverCredential(handoverId, await signHandoverCertificate(old, intruder.identity, 'laptop'))).toBeNull()
    expect(await issueHandoverCredential(handoverId, await signHandoverCertificate(intruder, next.identity, 'laptop'))).toBeNull()
    expect(await completeHandover(handoverId)).toBeNull()
    expect(await prisma.consoleCredential.count()).toBe(0)
  })

  it('takes one half from the new Fleet Console, and is closed by the running one', async () => {
    const { next } = await consoles()
    const other = await generateHostKeys('console')
    const { handoverId } = await openHandover({ lookup: LOOKUP, expiresAt: inAnHour() })
    await claimHandover(LOOKUP)
    expect(await recordHandoverAsk(handoverId, next.identity)).not.toBeNull()
    expect(await recordHandoverAsk(handoverId, other.identity)).toBeNull()
    expect(await closeHandover(handoverId)).toBe(true)
    expect(await closeHandover(handoverId)).toBe(false)
  })
})
