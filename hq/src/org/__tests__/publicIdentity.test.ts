import { describe, it, expect } from 'vitest'
import { hqVersions, orgCardOf, parseSignInShows, publicOrgIdentity } from '../publicIdentity'
import { BUILD_INFO } from '../../server/buildInfo'

// The organisation before sign-in shows as much as its admin chose (getting-in spec, Signing in).

const org = {
  name: 'Acme Corp', handle: 'acmecorp', vision: 'Shops online.', avatarUrl: '/org/images/a.png', coverUrl: '/org/images/c.png',
}

describe('publicOrgIdentity @SC-712', () => {
  it('shows the whole cover by default', () => {
    expect(publicOrgIdentity({ ...org, signInShows: 'COVER' })).toEqual({ shows: 'cover', ...org })
  })

  it('shows the name only, or nothing at all, when the admin chose that', () => {
    expect(publicOrgIdentity({ ...org, signInShows: 'NAME' })).toEqual({
      shows: 'name', name: 'Acme Corp', handle: null, vision: null, avatarUrl: null, coverUrl: null,
    })
    expect(publicOrgIdentity({ ...org, signInShows: 'NOTHING' })).toEqual({
      shows: 'nothing', name: null, handle: null, vision: null, avatarUrl: null, coverUrl: null,
    })
  })

  it('reads a missing organisation as the default one', () => {
    expect(publicOrgIdentity(null)).toMatchObject({ shows: 'cover', name: 'My Organisation' })
    expect(orgCardOf(null).name).toBe('My Organisation')
  })
})

describe('parseSignInShows @SC-712', () => {
  it('takes the three choices and refuses anything else', () => {
    expect(['cover', 'name', 'nothing'].map(parseSignInShows)).toEqual(['cover', 'name', 'nothing'])
    expect(() => parseSignInShows('everything')).toThrow()
  })
})

describe('hq\'s versions before sign-in @SC-1140', () => {
  it('states its release, the value its image is labelled with, and the client protocol it speaks', () => {
    expect(hqVersions()).toEqual({ release: BUILD_INFO.version, clientProtocolVersion: '1.0' })
  })
})
