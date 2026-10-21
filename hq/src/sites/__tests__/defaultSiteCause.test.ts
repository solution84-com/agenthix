import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_SITE_CAUSES, causeSentence, currentDefaultSiteCause, reportDefaultSiteCause, __resetDefaultSiteCauseForTests } from '../defaultSiteCause'

// Why HQ's site is not connected, as the host service passes it on through hq's control socket.

beforeEach(() => __resetDefaultSiteCauseForTests())

describe('the default site\'s cause, from hq\'s machine', () => {
  it('keeps a cause from the closed set, with when it was reported', () => {
    const at = new Date('2026-10-14T09:14:00Z')
    expect(reportDefaultSiteCause('credentialRefused', at)).toBe('credentialRefused')
    expect(currentDefaultSiteCause()).toEqual({ cause: 'credentialRefused', at })
  })

  it('refuses anything else, keeping what it had', () => {
    reportDefaultSiteCause('unreachable', new Date())
    for (const raw of ['', 'rm -rf /', '<b>secret</b>', 'CREDENTIALREFUSED', 'x'.repeat(5000)]) {
      expect(reportDefaultSiteCause(raw, new Date())).toBeNull()
    }
    expect(currentDefaultSiteCause()?.cause).toBe('unreachable')
  })

  it('clears with "none", which the host service sends when the site is connected again', () => {
    reportDefaultSiteCause('unreachable', new Date())
    expect(reportDefaultSiteCause('none', new Date())).toBe('none')
    expect(currentDefaultSiteCause()).toBeNull()
  })

  it('has a sentence for every cause, never an internal word', () => {
    for (const cause of DEFAULT_SITE_CAUSES) {
      const sentence = causeSentence(cause)
      expect(sentence).toMatch(/^[A-Z].*\.$/)
      expect(sentence).not.toMatch(/HTTP|401|426|DEGRADED|REVOKED|credentialRefused|ECONN/)
    }
    expect(causeSentence('credentialRefused')).toMatch(/pairing secret is not the one HQ expects/)
  })
})
