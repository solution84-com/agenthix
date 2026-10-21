/**
 * Who may hold the console link (host-management spec §4 C8, §7), against the real test database: the pairing secret
 * on hq's machine, or a credential redeemed once from a code `console-code` made; one Fleet Console at a time.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { consoleCodeKind } from '@agenthix/core'
import { consoleCodeLookup } from '@agenthix/core/host-crypto'
import { authenticateConsole, issueConsoleCode, redeemConsoleCode as redeemLookup } from '../consoleCredential'
import { runHqMachineCommand } from '../../auth/machine/hqMachineCommands'

const SECRET = 'p'.repeat(40)
/** The new Fleet Console presents the code's lookup, never the code. */
const redeemConsoleCode = async (code: string, now?: Date) => redeemLookup(await consoleCodeLookup(code), now)
const env = { HQ_CONSOLE_PAIRING_SECRET: SECRET } as NodeJS.ProcessEnv

describe('the pairing secret @SC-924', () => {
  it('admits the Fleet Console on hq’s machine; a wrong or short one does not', async () => {
    expect(await authenticateConsole(SECRET, env)).toBe(true)
    expect(await authenticateConsole('q'.repeat(40), env)).toBe(false)
    expect(await authenticateConsole('short', { HQ_CONSOLE_PAIRING_SECRET: 'short' } as NodeJS.ProcessEnv)).toBe(false)
    expect(await authenticateConsole(SECRET, {} as NodeJS.ProcessEnv)).toBe(false)
  })
})

describe('a Fleet Console on another machine @SC-924', () => {
  it('redeems its code once, for a credential kept only as a hash, and the pairing secret is retired', async () => {
    const result = await runHqMachineCommand('console-code', [])
    expect(result).toMatchObject({ ok: true, data: { code: expect.stringMatching(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/) } })
    const { code } = (result as unknown as { data: { code: string } }).data
    // Marked as hq's own, so the new Fleet Console expects no machines with it.
    expect(consoleCodeKind(code)).toBe('fresh')
    expect(JSON.stringify(await prisma.consoleCode.findMany())).not.toContain(code.replace(/-/g, ''))
    // The code itself is not accepted in place of its lookup.
    expect(await redeemLookup(code)).toBeNull()

    const credential = await redeemConsoleCode(code.toLowerCase())
    expect(credential).toMatch(/^fcc_/)
    expect(await redeemConsoleCode(code)).toBeNull()
    expect(JSON.stringify(await prisma.consoleCredential.findMany())).not.toContain(credential!)
    expect(await authenticateConsole(credential!, env)).toBe(true)
    expect(await authenticateConsole(SECRET, env)).toBe(false)
  })

  it('retires the credential before it when a newer code is redeemed', async () => {
    const first = await redeemConsoleCode((await issueConsoleCode()).code)
    const second = await redeemConsoleCode((await issueConsoleCode()).code)
    expect(await authenticateConsole(first!, env)).toBe(false)
    expect(await authenticateConsole(second!, env)).toBe(true)
  })

  it('cannot use a code after its hour, or one a newer code withdrew', async () => {
    const now = new Date()
    const old = await issueConsoleCode(now)
    expect(await redeemConsoleCode(old.code, new Date(now.getTime() + 3600_001))).toBeNull()
    const withdrawn = await issueConsoleCode()
    await issueConsoleCode()
    expect(await redeemConsoleCode(withdrawn.code)).toBeNull()
  })
})
