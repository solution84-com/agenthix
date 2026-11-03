import { describe, expect, it } from 'vitest'
import { APP_COOKIES, APP_ENTRY_PATH, isRelayCookieName, withoutCookieDomain } from '../appDoor.js'
import * as core from '../../index.js'

describe('a live app\'s door at the relay @SC-1749', () => {
  it('sets host-only cookies: partitioned under hq in the viewer, strict in a tab (S29)', () => {
    for (const c of Object.values(APP_COOKIES)) {
      expect(c.name.startsWith('__Host-')).toBe(true)
      expect(c.attributes).toMatch(/Secure/)
      expect(c.attributes).toMatch(/HttpOnly/)
      expect(c.attributes).toMatch(/Path=\//)
      expect(c.attributes).not.toMatch(/Domain/i)
    }
    expect(APP_COOKIES.frame.attributes).toMatch(/SameSite=None; Partitioned/)
    expect(APP_COOKIES.tab.attributes).toMatch(/SameSite=Strict/)
    expect(APP_ENTRY_PATH.startsWith('/')).toBe(true)
  })

  it('takes every Domain off a cookie an app sets, and drops one named as the relay\'s own (S28)', () => {
    expect(withoutCookieDomain('sid=1; Domain=.preview.example.com; Path=/; HttpOnly')).toBe('sid=1; Path=/; HttpOnly')
    expect(withoutCookieDomain('sid=1; domain=example.com;DOMAIN = x; Secure')).toBe('sid=1; Secure')
    expect(withoutCookieDomain('a=b')).toBe('a=b')
    expect(withoutCookieDomain(`${APP_COOKIES.frame.name}=forged; Path=/`)).toBeNull()
    expect(withoutCookieDomain(` ${APP_COOKIES.tab.name.toLowerCase()}=forged`)).toBeNull()
    expect(isRelayCookieName('session')).toBe(false)
  })

  it('is exported from core\'s entry', () => {
    expect(typeof core.withoutCookieDomain).toBe('function')
    expect(typeof core.appIdFromHost).toBe('function')
    expect(core.APP_TICKET_TOKEN_TYPE).toBe('app-ticket')
  })
})
