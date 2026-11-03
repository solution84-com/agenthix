/**
 * A run writes its harness home, so what the site finds there as the
 * credentials document — or as the Claude folder holding it — is hostile: a
 * link to another person's home, a device, a second name, a huge file, or a
 * document claiming an expiry no refresh gives. None of it is read, copied
 * into another home, kept over what hq handed out, or reported to hq.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { RunCredential } from '@agenthix/core'

vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn(), connectionState: vi.fn(() => 'connected') },
}))
vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))

import { hqConnectionManager } from '../../../server/hq/hqConnection'
import { readCredentialExpiresAt, REFRESHED_EXPIRY_CEILING_MS } from '../agentCredentials'
import { clearRunCredential, writeRunCredential } from '../boundaryClaudeHome'
import { readCredentialFile, writeCredentialFile } from '../credentialFile'
import { _resetSubscriptionLoginsForTests, joinSubscriptionLogin, sweepSubscriptionLogins } from '../subscriptionLogins'

const mockSendEvent = vi.mocked(hqConnectionManager.sendEvent)
const HOUR = 60 * 60 * 1000
const NOW = Date.now()

const doc = (expiresAt: number, who = 'x') =>
  JSON.stringify({ claudeAiOauth: { accessToken: `at-${who}-${expiresAt}`, refreshToken: `rt-${who}-${expiresAt}`, expiresAt } })
const granted = (oauthJson: string, grantId: string, loginId: string): RunCredential =>
  ({ kind: 'subscription', provider: 'anthropic', oauthJson, grantId, loginId })

let root: string
/** `<root>/users/<person>/<project>/.claude`, as harnessHomes.ts lays homes out. */
const homeOf = (person: string) => path.join(root, 'users', person, 'p1', '.claude')
const docPath = (home: string) => path.join(home, '.credentials.json')

beforeEach(async () => {
  vi.clearAllMocks()
  _resetSubscriptionLoginsForTests()
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'credential-links-'))
})
afterEach(async () => {
  _resetSubscriptionLoginsForTests()
  await fs.rm(root, { recursive: true, force: true })
})

describe('reading the document', () => {
  it('reads an ordinary document', async () => {
    const home = homeOf('ana')
    await writeCredentialFile(home, doc(NOW + HOUR))
    expect(await readCredentialFile(home)).toEqual({ state: 'read', text: doc(NOW + HOUR) })
  })

  it("refuses a link to another person's document", async () => {
    const mine = homeOf('ana')
    const theirs = homeOf('ben')
    await writeCredentialFile(theirs, doc(NOW + HOUR, 'ben'))
    await fs.mkdir(mine, { recursive: true })
    await fs.symlink('../../../ben/p1/.claude/.credentials.json', docPath(mine))
    expect(await readCredentialFile(mine)).toEqual({ state: 'refused' })
  })

  it('refuses a hard link, a link to a device and a huge file', async () => {
    const home = homeOf('ana')
    await fs.mkdir(home, { recursive: true })
    await fs.writeFile(path.join(root, 'other'), doc(NOW + HOUR, 'ben'))
    await fs.link(path.join(root, 'other'), docPath(home))
    expect(await readCredentialFile(home)).toEqual({ state: 'refused' })

    await fs.rm(docPath(home))
    await fs.symlink('/dev/zero', docPath(home))
    expect(await readCredentialFile(home)).toEqual({ state: 'refused' })

    await fs.rm(docPath(home))
    await fs.writeFile(docPath(home), 'x'.repeat(1024 * 1024))
    expect(await readCredentialFile(home)).toEqual({ state: 'refused' })
  })

  it("refuses a Claude folder the run replaced with a link to another person's", async () => {
    const mine = homeOf('ana')
    await writeCredentialFile(homeOf('ben'), doc(NOW + HOUR, 'ben'))
    await fs.mkdir(path.dirname(mine), { recursive: true })
    await fs.symlink('../../ben/p1/.claude', mine)
    expect(await readCredentialFile(mine)).toEqual({ state: 'refused' })
    expect(await readCredentialExpiresAt(mine)).toBe(0)
  })
})

describe('writing and removing the document', () => {
  it("never writes or removes through a Claude folder replaced with a link to another person's", async () => {
    const mine = homeOf('ana')
    const theirs = homeOf('ben')
    await writeCredentialFile(theirs, doc(NOW + HOUR, 'ben'))
    await fs.mkdir(path.dirname(mine), { recursive: true })
    await fs.symlink('../../ben/p1/.claude', mine)

    await expect(writeRunCredential(mine, granted(doc(NOW + 2 * HOUR, 'ana'), 'g-ana', 'login-ana'))).rejects.toThrow(/Forbidden/)
    await expect(clearRunCredential(mine)).rejects.toThrow(/Forbidden/)
    expect(await fs.readFile(docPath(theirs), 'utf-8')).toBe(doc(NOW + HOUR, 'ben'))
  })

  it('replaces a link planted as the document, leaving its target alone', async () => {
    const home = homeOf('ana')
    await fs.mkdir(home, { recursive: true })
    await fs.writeFile(path.join(root, 'target'), 'untouched')
    await fs.symlink(path.join(root, 'target'), docPath(home))

    await writeRunCredential(home, granted(doc(NOW + HOUR, 'ana'), 'g-ana', 'login-ana'))

    expect(await fs.readFile(path.join(root, 'target'), 'utf-8')).toBe('untouched')
    expect((await fs.lstat(docPath(home))).isSymbolicLink()).toBe(false)
    expect(await fs.readFile(docPath(home), 'utf-8')).toBe(doc(NOW + HOUR, 'ana'))
  })
})

describe('the sweep takes only a real refresh as one', () => {
  async function twoHomesOnOneLogin() {
    const a = homeOf('ana')
    const b = path.join(root, 'users', 'ana', 'personal', '.claude')
    for (const [home, grant] of [[a, 'g-1'], [b, 'g-2']] as const) {
      const credential = granted(doc(NOW + HOUR, 'ana'), grant, 'login-ana')
      joinSubscriptionLogin(home, credential)
      await writeRunCredential(home, credential)
    }
    return { a, b }
  }

  it("never copies or reports another person's document reached through a link", async () => {
    const { a, b } = await twoHomesOnOneLogin()
    await writeCredentialFile(homeOf('ben'), doc(NOW + 5 * HOUR, 'ben'))
    await fs.rm(docPath(a))
    await fs.symlink('../../../ben/p1/.claude/.credentials.json', docPath(a))

    await sweepSubscriptionLogins()

    expect(await fs.readFile(docPath(b), 'utf-8')).toBe(doc(NOW + HOUR, 'ana'))
    expect(mockSendEvent).not.toHaveBeenCalled()
  })

  it('never copies or reports a document claiming an expiry past the ceiling', async () => {
    const { a, b } = await twoHomesOnOneLogin()
    const forged = doc(NOW + REFRESHED_EXPIRY_CEILING_MS + HOUR, 'mallory')
    await fs.writeFile(docPath(a), forged)

    await sweepSubscriptionLogins()

    expect(await fs.readFile(docPath(b), 'utf-8')).toBe(doc(NOW + HOUR, 'ana'))
    expect(mockSendEvent).not.toHaveBeenCalled()
  })

  it('never copies or reports a document without both tokens', async () => {
    const { a, b } = await twoHomesOnOneLogin()
    await fs.writeFile(docPath(a), JSON.stringify({ claudeAiOauth: { accessToken: 'at', expiresAt: NOW + 3 * HOUR } }))

    await sweepSubscriptionLogins()

    expect(await fs.readFile(docPath(b), 'utf-8')).toBe(doc(NOW + HOUR, 'ana'))
    expect(mockSendEvent).not.toHaveBeenCalled()
  })

  it('a forged document left in a home is replaced by what hq hands the next run', async () => {
    const home = homeOf('ana')
    await fs.mkdir(home, { recursive: true })
    await fs.writeFile(docPath(home), doc(NOW + REFRESHED_EXPIRY_CEILING_MS + HOUR, 'mallory'))

    await writeRunCredential(home, granted(doc(NOW + HOUR, 'ana'), 'g-ana', 'login-ana'))

    expect(await fs.readFile(docPath(home), 'utf-8')).toBe(doc(NOW + HOUR, 'ana'))
  })
})
