import { beforeAll, describe, expect, it } from 'vitest'
import {
  fingerprintOf, generateHostKeys, generateJoinCode, generateConsoleCode, hostJoinBinding, joinLookup, consoleCodeLookup, consoleJoinBinding,
  newConsoleBinding, oldConsoleBinding, signHandoverCertificate, verifyHandoverCertificate, verifyHostJoinBinding,
  verifyConsoleJoinBinding, verifyNewConsoleBinding, verifyOldConsoleBinding,
} from '../crypto/index.js'
import { fromHex, toBase64url } from '../crypto/webCrypto.js'
import {
  JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, CONSOLE_FRESH_CODE_MARK, formatJoinCode, consoleCodeKind, normalizeJoinCode,
  parseHandoverCertificate, parseRestoreClaim,
} from '../join.js'

describe('the restore claim a joining machine makes', () => {
  it('names a site and the moment its backup was taken, and nothing else', () => {
    const claim = { siteName: 'office-server', takenAt: '2026-10-14T02:00:00.000Z' }
    expect(parseRestoreClaim({ ...claim, extra: 1 })).toEqual(claim)
    expect(parseRestoreClaim({ ...claim, siteName: '' })).toBeNull()
    expect(parseRestoreClaim({ ...claim, siteName: 'a\nb' })).toBeNull()
    expect(parseRestoreClaim({ ...claim, siteName: 'x'.repeat(65) })).toBeNull()
    expect(parseRestoreClaim({ ...claim, takenAt: 'last night' })).toBeNull()
    expect(parseRestoreClaim({ ...claim, takenAt: '2026-10-14T02:00:00Z' })).toBeNull()
    expect(parseRestoreClaim(null)).toBeNull()
    expect(parseRestoreClaim([claim])).toBeNull()
  })
})

describe('join codes', () => {
  it('are twelve characters of Crockford base32, printed in groups of four', () => {
    const code = generateJoinCode()
    expect(code).toHaveLength(JOIN_CODE_LENGTH)
    expect(normalizeJoinCode(code)).toBe(code)
    expect(formatJoinCode('K7QM4XPD93TB')).toBe('K7QM-4XPD-93TB')
  })

  it('read the way a person types them', () => {
    expect(normalizeJoinCode(' k7qm-4xpd-93tb ')).toBe('K7QM4XPD93TB')
    expect(normalizeJoinCode('K7QM 4XPD 93TO')).toBe('K7QM4XPD93T0')
    expect(normalizeJoinCode('K7QM-4XPD')).toBeNull()
    expect(normalizeJoinCode('K7QM-4XPD-93TU')).toBeNull()
  })
})

describe("a Fleet Console's one-time code says what it is for", () => {
  it('in its first character: H for a fresh code hq made, anything else for a handover code', () => {
    for (let i = 0; i < 200; i++) {
      const fresh = generateConsoleCode('fresh')
      const handover = generateConsoleCode('handover')
      expect(normalizeJoinCode(fresh)).toBe(fresh)
      expect(normalizeJoinCode(handover)).toBe(handover)
      expect(fresh[0]).toBe(CONSOLE_FRESH_CODE_MARK)
      expect(handover[0]).not.toBe(CONSOLE_FRESH_CODE_MARK)
      expect(consoleCodeKind(fresh)).toBe('fresh')
      expect(consoleCodeKind(formatJoinCode(handover).toLowerCase())).toBe('handover')
    }
    expect(consoleCodeKind('H7QM-4XPD-93TB')).toBe('fresh')
    expect(consoleCodeKind('K7QM-4XPD-93TB')).toBe('handover')
    expect(consoleCodeKind('not a code')).toBeNull()
  })

  it('draws a handover code’s first character from all 31 others', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) seen.add(generateConsoleCode('handover')[0])
    expect(seen.size).toBe(JOIN_CODE_ALPHABET.length - 1)
  })
})

describe('joining binds both identities to the code', () => {
  const code = 'K7QM4XPD93TB'
  let host: string
  let fleetConsole: string
  let intruder: string
  beforeAll(async () => {
    host = await fingerprintOf((await generateHostKeys('host')).identity)
    fleetConsole = await fingerprintOf((await generateHostKeys('console')).identity)
    intruder = await fingerprintOf((await generateHostKeys('console')).identity)
  })

  it('gives hq a lookup it cannot turn into a binding', async () => {
    const lookup = await joinLookup('k7qm-4xpd-93tb')
    expect(lookup).toBe(await joinLookup(code))
    expect(lookup).toMatch(/^[0-9a-f]{64}$/)
    expect(await verifyHostJoinBinding(code, host, toBase64url(fromHex(lookup)!))).toBe(false)
  })

  it('checks each side against the code', async () => {
    const hostBinding = await hostJoinBinding(code, host)
    expect(await verifyHostJoinBinding(code, host, hostBinding)).toBe(true)
    expect(await verifyHostJoinBinding('K7QM4XPD93TC', host, hostBinding)).toBe(false)
    expect(await verifyHostJoinBinding(code, intruder, hostBinding)).toBe(false)

    // The claim that the machine runs hq is under the binding: hq, which lacks the code, can neither add nor drop it.
    const claimed = await hostJoinBinding(code, host, { runsHq: true })
    expect(claimed).not.toBe(hostBinding)
    expect(await verifyHostJoinBinding(code, host, claimed, { runsHq: true })).toBe(true)
    expect(await verifyHostJoinBinding(code, host, claimed)).toBe(false)
    expect(await verifyHostJoinBinding(code, host, hostBinding, { runsHq: true })).toBe(false)

    // So is the backup a machine says it restores (adr-0119): which site, and when the backup was taken.
    const restores = { siteName: 'office-server', takenAt: '2026-10-14T02:00:00.000Z' }
    const restoring = await hostJoinBinding(code, host, { restores })
    expect(await verifyHostJoinBinding(code, host, restoring, { restores })).toBe(true)
    expect(await verifyHostJoinBinding(code, host, restoring)).toBe(false)
    expect(await verifyHostJoinBinding(code, host, restoring, { restores: { ...restores, takenAt: '2026-10-15T02:00:00.000Z' } })).toBe(false)
    expect(await verifyHostJoinBinding(code, host, restoring, { restores: { ...restores, siteName: 'other' } })).toBe(false)
    expect(await verifyHostJoinBinding(code, host, hostBinding, { restores })).toBe(false)

    const consoleBinding = await consoleJoinBinding(code, fleetConsole, host)
    expect(await verifyConsoleJoinBinding(code, fleetConsole, host, consoleBinding)).toBe(true)
    expect(await verifyConsoleJoinBinding(code, intruder, host, consoleBinding)).toBe(false)
    expect(await verifyConsoleJoinBinding(code, fleetConsole, intruder, consoleBinding)).toBe(false)
    expect(await verifyConsoleJoinBinding(code, fleetConsole, host, hostBinding)).toBe(false)
    expect(await verifyConsoleJoinBinding('not a code', fleetConsole, host, consoleBinding)).toBe(false)
  })
})

describe('moving the Fleet Console binds both consoles to the handover code', () => {
  const code = 'K7QM4XPD93TB'
  it('gives hq a lookup of its own label, never the join lookup', async () => {
    const lookup = await consoleCodeLookup('k7qm-4xpd-93tb')
    expect(lookup).toMatch(/^[0-9a-f]{64}$/)
    expect(lookup).toBe(await consoleCodeLookup(code))
    expect(lookup).not.toBe(await joinLookup(code))
  })

  it('accepts only bindings made with the code, over the fingerprints they name', async () => {
    const oldFp = await fingerprintOf((await generateHostKeys('console')).identity)
    const newFp = await fingerprintOf((await generateHostKeys('console')).identity)
    const hqFp = await fingerprintOf((await generateHostKeys('console')).identity)
    const asked = await newConsoleBinding(code, newFp)
    expect(await verifyNewConsoleBinding(code, newFp, asked)).toBe(true)
    expect(await verifyNewConsoleBinding(code, hqFp, asked)).toBe(false)
    expect(await verifyNewConsoleBinding('ZZZZZZZZZZZZ', newFp, asked)).toBe(false)
    // A join's binding under the same code is not a handover's.
    expect(await verifyNewConsoleBinding(code, newFp, await hostJoinBinding(code, newFp))).toBe(false)
    const answered = await oldConsoleBinding(code, oldFp, newFp)
    expect(await verifyOldConsoleBinding(code, oldFp, newFp, answered)).toBe(true)
    expect(await verifyOldConsoleBinding(code, hqFp, newFp, answered)).toBe(false)
    expect(await verifyOldConsoleBinding(code, oldFp, hqFp, answered)).toBe(false)
  })
})

describe('handover certificates', () => {
  it('are followed only when signed by the pinned Fleet Console, for the identity they name', async () => {
    const old = await generateHostKeys('console')
    const next = await generateHostKeys('console')
    const other = await generateHostKeys('console')
    const cert = await signHandoverCertificate(old, next.identity, 'laptop', 1_000)
    expect(await verifyHandoverCertificate(cert, old.identity)).toEqual({
      identity: next.identity, fingerprint: await fingerprintOf(next.identity), machineName: 'laptop',
    })
    // A machine pinned to another Fleet Console ignores it.
    expect(await verifyHandoverCertificate(cert, other.identity)).toBeNull()
    // hq swapping in its own identity breaks the signature.
    expect(await verifyHandoverCertificate({ ...cert, to: other.identity }, old.identity)).toBeNull()
    expect(await verifyHandoverCertificate({ ...cert, machineName: 'hq-box' }, old.identity)).toBeNull()
    // Signed by someone else claiming to be the pinned one.
    const forged = await signHandoverCertificate(other, other.identity, 'laptop', 1_000).catch(() => null)
    expect(forged).not.toBeNull()
    expect(await verifyHandoverCertificate({ ...(await signHandoverCertificate(other, next.identity, 'laptop', 1_000)), from: cert.from }, old.identity)).toBeNull()
    expect(parseHandoverCertificate({ ...cert, v: 2 })).toBeNull()
  })

  it('answers null, not a throw, when the new key is not canonical base64url', async () => {
    const old = await generateHostKeys('console')
    const next = await generateHostKeys('console')
    const cert = await signHandoverCertificate(old, next.identity, 'laptop', 1_000)
    const key = cert.to.signingKey
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    // The 43rd character carries two bits past the key's 256: setting one makes the text a different spelling.
    const spelled = key.slice(0, 42) + alphabet[alphabet.indexOf(key[42]) | 1]
    const odd = { ...cert, to: { ...cert.to, signingKey: spelled } }
    expect(parseHandoverCertificate(odd)).not.toBeNull()
    expect(await verifyHandoverCertificate(odd, old.identity)).toBeNull()
  })

  it('cannot hand a Fleet Console over to itself', async () => {
    const old = await generateHostKeys('console')
    expect(await verifyHandoverCertificate(await signHandoverCertificate(old, old.identity, 'hq-box'), old.identity)).toBeNull()
  })
})
