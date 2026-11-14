import { afterEach, describe, expect, it, vi } from 'vitest'
import { compare, newest, NothingPublished, parseVersion, registryTags, registryTagsWith } from '../versions'

describe('versions, pre-releases included @SC-820 @SC-1052', () => {
  it('orders a pre-release before its release, an alpha before a beta before a release candidate, and each by its number', () => {
    const ordered = ['0.9.9', '1.0.0-alpha.1', '1.0.0-alpha.2', '1.0.0-beta.1', '1.0.0-beta.2', '1.0.0-beta.10', '1.0.0-rc.1', '1.0.0', '1.0.1-beta.1']
    expect([...ordered].reverse().sort(compare)).toEqual(ordered)
    expect(parseVersion('1.0.0-rc.1')).toEqual([1, 0, 0])
  })

  it('offers only a release as the newest, never a pre-release', () => {
    expect(newest(['1.0.0-alpha.1', '1.0.0-beta.1', '1.0.0-rc.1'])).toBeNull()
    expect(newest(['0.9.0', '1.0.0-rc.1'])).toBe('0.9.0')
  })
})

describe("the registry's published versions, read with the machine's credential while the images are private", () => {
  const LOGIN = Buffer.from('someone:a-read-token').toString('base64')
  type Asked = { url: string; authorization: string | null }

  function registry(token: number, tags = 200): Asked[] {
    const asked: Asked[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('authorization')
      asked.push({ url, authorization })
      if (url.includes('/token?')) return new Response(JSON.stringify({ token: 'pull-token' }), { status: token })
      return new Response(JSON.stringify({ tags: ['0.1.0-alpha.3', '0.1.0-alpha.4'] }), { status: tags })
    })
    return asked
  }

  afterEach(() => vi.unstubAllGlobals())

  it('sends the credential as the basic login for the pull token, then lists with that token', async () => {
    const asked = registry(200)
    expect(await registryTagsWith(() => LOGIN)('solution84-com/agenthix-host')).toEqual(['0.1.0-alpha.3', '0.1.0-alpha.4'])
    expect(asked.map(a => a.authorization)).toEqual([`Basic ${LOGIN}`, 'Bearer pull-token'])
  })

  it('asks anonymously when the machine has no credential', async () => {
    const asked = registry(200)
    await registryTags('solution84-com/agenthix-host')
    expect(asked[0].authorization).toBeNull()
    await registryTagsWith(() => undefined)('solution84-com/agenthix-host')
    expect(asked[2].authorization).toBeNull()
  })

  it('says a private image could not be read, not that nothing is published, and never shows the credential', async () => {
    registry(401)
    await expect(registryTags('solution84-com/agenthix-host')).rejects.toThrow('the registry asks for a credential to read it, and this machine has none')
    registry(403)
    const refused = await registryTagsWith(() => LOGIN)('solution84-com/agenthix-host').catch((err: Error) => err)
    expect(refused).not.toBeInstanceOf(NothingPublished)
    expect((refused as Error).message).toBe("the registry refused this machine's registry credential")
    expect((refused as Error).message).not.toContain(LOGIN)
  })

  it('still says nothing is published when the registry holds no such image', async () => {
    registry(403)
    await expect(registryTags('solution84-com/agenthix-nothing')).rejects.toBeInstanceOf(NothingPublished)
    registry(200, 404)
    await expect(registryTagsWith(() => LOGIN)('solution84-com/agenthix-nothing')).rejects.toBeInstanceOf(NothingPublished)
  })
})
