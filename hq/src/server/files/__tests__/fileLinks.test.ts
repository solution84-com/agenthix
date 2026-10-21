/**
 * Signed links to uploaded files (host-management spec §16): one file, one person, a short life, and nothing in
 * them that can be changed without the link failing.
 */
import { describe, it, expect } from 'vitest'
import { checkLink, makeLink, LINK_LIFETIME_S } from '../fileLinks'

const ENV = { JWT_SECRET: 'a-secret-only-hq-knows' } as NodeJS.ProcessEnv
const NOW = new Date('2026-10-14T10:00:00Z')
const ORIGIN = 'https://files.hq.acme.example'
const PATH = '/files/task/tsk_1/u-1/plan v2.pdf'

function made(userId: string | null = 'usr_alice', download = false, path = PATH) {
  const { url, expiresAt } = makeLink(ORIGIN, { path, userId, download }, NOW, ENV)
  const u = new URL(url)
  return { url: u, query: Object.fromEntries(u.searchParams), expiresAt }
}

describe('a link to an uploaded file', () => {
  it('is on the files origin, for that file, and checks for the person it was made for', () => {
    const { url, query } = made()
    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/files/task/tsk_1/u-1/plan%20v2.pdf')
    expect(checkLink(PATH, query, NOW, ENV)).toEqual({ ok: true, grant: { path: PATH, userId: 'usr_alice', download: false } })
  })

  it('lives five to ten minutes', () => {
    const { expiresAt } = made()
    const life = (new Date(expiresAt).getTime() - NOW.getTime()) / 1000
    expect(life).toBeGreaterThanOrEqual(LINK_LIFETIME_S)
    expect(life).toBeLessThanOrEqual(2 * LINK_LIFETIME_S)
  })

  it('is refused once it has expired', () => {
    const { query, expiresAt } = made()
    expect(checkLink(PATH, query, new Date(expiresAt), ENV)).toEqual({ ok: false, reason: 'expired' })
  })

  it('made for one person, is refused when it names another', () => {
    const { query } = made('usr_alice')
    expect(checkLink(PATH, { ...query, u: 'usr_bob' }, NOW, ENV)).toEqual({ ok: false, reason: 'tampered' })
    expect(checkLink(PATH, { ...query, u: '' }, NOW, ENV)).toEqual({ ok: false, reason: 'tampered' })
  })

  it('is refused for another file, a later expiry, a changed signature, or as a download it was not made as', () => {
    const { query } = made()
    expect(checkLink('/files/task/tsk_1/u-1/other.pdf', query, NOW, ENV).ok).toBe(false)
    expect(checkLink(PATH, { ...query, e: String(Number(query.e) + 3600) }, NOW, ENV).ok).toBe(false)
    expect(checkLink(PATH, { ...query, s: query.s.slice(0, -2) + 'AA' }, NOW, ENV).ok).toBe(false)
    expect(checkLink(PATH, { ...query, d: '1' }, NOW, ENV).ok).toBe(false)
  })

  it('is refused when made with another key, or carrying no signature', () => {
    const { query } = made()
    expect(checkLink(PATH, query, NOW, { JWT_SECRET: 'another' } as NodeJS.ProcessEnv).ok).toBe(false)
    const { s: _s, ...unsigned } = query
    expect(checkLink(PATH, unsigned, NOW, ENV)).toEqual({ ok: false, reason: 'unsigned' })
  })

  it('may be made without a person, for a picture shown before sign-in, and as a download', () => {
    const { query } = made(null, true, '/org/images/cover.png')
    expect(checkLink('/org/images/cover.png', query, NOW, ENV)).toEqual({ ok: true, grant: { path: '/org/images/cover.png', userId: null, download: true } })
  })
})
