/**
 * The organisation before sign-in (getting-in spec, Signing in), against the
 * real test database: the public read shows as much as an admin chose, and only
 * an admin chooses.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { publicOrgIdentityHandler, setSignInShows } from '../publicIdentity'
import { getOrgIdentity } from '../identity'
import { BUILD_INFO } from '../../server/buildInfo'

const VERSIONS = { release: BUILD_INFO.version, clientProtocolVersion: '1.0' }

const ctx = (user?: { id: string }) => ({ user }) as any

async function read() {
  const out: { body: unknown; headers: Record<string, string> } = { body: null, headers: {} }
  const res: any = {
    set: (k: string, v: string) => { out.headers[k] = v; return res },
    json: (data: unknown) => { out.body = data; return res },
  }
  await publicOrgIdentityHandler({} as any, res, {} as any)
  return out
}

describe('the public read of the organisation @SC-712', () => {
  it('shows the whole cover until an admin chooses less, and is never cached @SC-1140', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp', handle: 'acmecorp', vision: 'Shops online.', coverUrl: '/org/images/c.png' } })

    const first = await read()
    expect(first.body).toEqual({
      shows: 'cover', name: 'Acme Corp', handle: 'acmecorp', vision: 'Shops online.', avatarUrl: null, coverUrl: '/org/images/c.png',
      ...VERSIONS,
    })
    expect(first.headers['Cache-Control']).toBe('no-store')

    const admin = await createUserWithRole('ADMIN')
    await expect(setSignInShows({ shows: 'name' }, ctx(admin))).resolves.toEqual({ shows: 'name' })
    expect((await read()).body).toEqual({ shows: 'name', name: 'Acme Corp', handle: null, vision: null, avatarUrl: null, coverUrl: null, ...VERSIONS })
    expect((await getOrgIdentity(undefined, ctx(admin))).signInShows).toBe('name')
  })

  it('lets only an admin choose, and only one of the three', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp' } })
    const member = await createUserWithRole('MEMBER')
    const admin = await createUserWithRole('ADMIN')
    await expect(setSignInShows({ shows: 'nothing' }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(setSignInShows({ shows: 'everything' as any }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.org.findFirstOrThrow()).signInShows).toBe('COVER')
  })
})
