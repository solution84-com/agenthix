/**
 * Who may hold the console link (host-management spec §4 C8, §7). On hq's machine the Fleet Console presents the
 * pairing secret the host service set at install (`HQ_CONSOLE_PAIRING_SECRET`). To run it elsewhere while it runs,
 * the running Fleet Console hands over (handover.ts). When none runs, a machine admin of hq's machine makes a one-time
 * code here (`console-code`); the new Fleet Console redeems it once, by the code's lookup (core's `consoleCodeLookup`),
 * for a lasting credential, and starts with no machines. hq keeps hashes only. One Fleet Console at a time: a redeemed
 * code replaces any credential before it, and once a credential exists the pairing secret is no longer accepted, so
 * the Fleet Console it replaced is retired.
 */
import { createHash } from 'node:crypto'
import { prisma } from 'wasp/server'
import { CONSOLE_CODE_TTL_MS, CONSOLE_CREDENTIAL_PREFIX, formatJoinCode } from '@agenthix/core'
import { generateConsoleCode, consoleCodeLookup } from '@agenthix/core/host-crypto'
import { credentialMatches, generateCredential, hashCredential } from '../sites/credentials'

const MIN_SECRET_LENGTH = 32

export function consolePairingSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.HQ_CONSOLE_PAIRING_SECRET?.trim()
  return value && value.length >= MIN_SECRET_LENGTH ? value : null
}

export async function authenticateConsole(presented: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const issued = await prisma.consoleCredential.findFirst({ orderBy: { issuedAt: 'desc' } })
  if (issued) return credentialMatches(presented, issued.credentialHash)
  const secret = consolePairingSecret(env)
  return secret !== null && credentialMatches(presented, hashCredential(secret))
}

const lookupHash = (lookup: string) => createHash('sha256').update(lookup.toLowerCase(), 'utf8').digest('hex')
const LOOKUP = /^[0-9a-f]{64}$/i

/**
 * A new one-time code, withdrawing any earlier one that is still open. Its first character marks it as hq's own
 * (core's `consoleCodeKind`), so the new Fleet Console expects no machines with it and takes none.
 */
export async function issueConsoleCode(now = new Date()): Promise<{ code: string; expiresAt: Date }> {
  const code = generateConsoleCode('fresh')
  const expiresAt = new Date(now.getTime() + CONSOLE_CODE_TTL_MS)
  await prisma.$transaction([
    prisma.consoleCode.updateMany({ where: { usedAt: null, revokedAt: null }, data: { revokedAt: now } }),
    prisma.consoleCode.create({ data: { codeHash: lookupHash(await consoleCodeLookup(code)), expiresAt } }),
  ])
  return { code: formatJoinCode(code), expiresAt }
}

/** Spends a code once, within its hour, by its lookup: the new lasting credential, or null. */
export async function redeemConsoleCode(lookup: string, now = new Date()): Promise<string | null> {
  if (!LOOKUP.test(lookup)) return null
  const { value: credential } = generateCredential(CONSOLE_CREDENTIAL_PREFIX)
  return prisma.$transaction(async tx => {
    const spent = await tx.consoleCode.updateMany({
      where: { codeHash: lookupHash(lookup), usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (spent.count !== 1) return null
    await tx.consoleCredential.deleteMany({})
    await tx.consoleCredential.create({ data: { credentialHash: hashCredential(credential), issuedAt: now } })
    return credential
  })
}
