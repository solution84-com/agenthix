/**
 * The organisation's picture and cover before sign-in (getting-in spec, Signing in), against the real test database:
 * only the current two files, and only while its admin chose the whole cover, may be opened without a session.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
import { uploadAccess } from '../../server/files/uploadAccess'

async function fetchSignedOut(filename: string): Promise<number> {
  const access = await uploadAccess(`/org/images/${filename}`, null)
  return access.ok ? 200 : access.status
}

describe("the organisation's images before sign-in @SC-663", () => {
  it('lets the current cover and picture past the session check while the whole cover is shown', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp', coverUrl: '/org/images/c.png', avatarUrl: '/org/images/a.png' } })
    // Past the session check, the file itself is missing here: 404, never 401.
    expect(await fetchSignedOut('c.png')).toBe(404)
    expect(await fetchSignedOut('a.png')).toBe(404)
  })

  it('refuses any other file, and every file once an admin shows less', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp', coverUrl: '/org/images/c.png' } })
    expect(await fetchSignedOut('old.png')).toBe(401)

    await prisma.org.updateMany({ data: { signInShows: 'NAME' } })
    expect(await fetchSignedOut('c.png')).toBe(401)
  })
})
