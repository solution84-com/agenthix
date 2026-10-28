import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { AssetFileListError } from '@agenthix/core'
import { PackageReadError } from '../../install/archive'
import { LINK_UNREADABLE, LinkRefusal, linkArrival, sameReadError } from '../link'
import type { Connect, Resolve } from '../urlFetch'

const LINK = 'https://example.com/skills/pdf.zip'

/** One public server answering the package with `body`, and no signature. */
function serving(body: Uint8Array) {
  const resolve: Resolve = async () => [{ address: '140.82.112.3', family: 4 }]
  const connect: Connect = async ({ url }) => {
    const found = url.href === LINK
    return {
      status: found ? 200 : 404,
      headers: {},
      body: (async function* () { if (found) yield body })(),
      close: () => {},
    }
  }
  return { resolve, connect }
}

async function zip(files: Record<string, string>): Promise<Uint8Array> {
  const z = new JSZip()
  for (const [path, text] of Object.entries(files)) z.file(path, text)
  return z.generateAsync({ type: 'uint8array' })
}

async function failure(p: Promise<unknown>): Promise<Error> {
  const err = await p.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(Error)
  return err as Error
}

describe('a package from a link', () => {
  it('arrives as a URL source recording the link as given, less its fragment', async () => {
    const body = await zip({ 'pdf/SKILL.md': '---\nname: pdf\ndescription: Reads PDFs\n---\n' })
    const arrival = await linkArrival(`${LINK}#readme`, serving(body))
    expect(arrival).toMatchObject({ source: 'url', bundle: null, sourceUrl: LINK })
    expect(arrival.arrived).toBeTruthy()
  })

  it('shows the fetch refusal\'s own message, and nothing more', async () => {
    const err = await failure(linkArrival('http://example.com/p.zip', serving(new Uint8Array())))
    expect(err).toBeInstanceOf(LinkRefusal)
    expect(err.message).toContain('https://')
    expect((await failure(linkArrival(42, serving(new Uint8Array())))).message).toContain('not a link')
  })

  it('says the same thing whatever is wrong with what came back (M3)', async () => {
    const bodies = [
      new TextEncoder().encode('<html>not a zip</html>'),
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]),
      await zip({ 'a/SKILL.md': 'x', 'b/SKILL.md': 'y' }),
      await zip({ 'pdf/../../etc/passwd': 'x' }),
    ]
    const messages = new Set<string>()
    for (const body of bodies) messages.add((await failure(linkArrival(LINK, serving(body)))).message)
    expect([...messages]).toEqual([LINK_UNREADABLE])
  })

  it('makes the pipeline\'s own read errors alike, and lets every other error through', async () => {
    expect((await failure(sameReadError(async () => { throw new PackageReadError('package.json is not valid JSON') })))).toMatchObject({ message: LINK_UNREADABLE })
    expect((await failure(sameReadError(async () => { throw new AssetFileListError([]) })))).toMatchObject({ message: LINK_UNREADABLE })
    const policy = new Error('Installing from outside the Library is for administrators.')
    expect(await failure(sameReadError(async () => { throw policy }))).toBe(policy)
  })
})
