/**
 * Unit tests for parseAgentZip malformed-archive handling.
 *
 * Scope (F-017c): SC-181 — importing a malformed archive (no root dir, missing /
 * invalid agent.json, or missing name/handle) is rejected with a specific
 * message. Pure parse logic over bytes: no database, no filesystem.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'

import { parseAgentZip } from '../agentZipService'
import { PackageContentError } from '../../packages/packageStore'

async function makeZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [filePath, content] of Object.entries(files)) zip.file(filePath, content)
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('parseAgentZip malformed archive @SC-181', () => {
  it('rejects an archive with no root directory', async () => {
    // A flat file at the archive root has no parent directory segment.
    const buf = await makeZip({ 'agent.json': '{}' })
    await expect(parseAgentZip(buf)).rejects.toThrow(/no root directory/i)
  })

  it('rejects an archive missing agent.json', async () => {
    const buf = await makeZip({ 'my-agent/PROFILE.md': '# hi' })
    await expect(parseAgentZip(buf)).rejects.toThrow(/agent\.json not found/i)
  })

  it('rejects an archive whose agent.json is not valid JSON', async () => {
    const buf = await makeZip({ 'my-agent/agent.json': '{ not json' })
    await expect(parseAgentZip(buf)).rejects.toThrow(/not valid JSON/i)
  })

  it('rejects an archive whose agent.json is missing name/handle', async () => {
    const buf = await makeZip({ 'my-agent/agent.json': JSON.stringify({ name: 'Only Name' }) })
    await expect(parseAgentZip(buf)).rejects.toThrow(/"name" and "handle" are required/i)
  })
})

describe('parseAgentZip formats', () => {
  it('reads a package-format archive, keeping every skill file', async () => {
    const buf = await makeZip({
      'scout/agent.json': JSON.stringify({ name: 'Scout', handle: 'scout', packageVersion: 4 }),
      'scout/instructions.md': '# Scout',
      'scout/skills/review/SKILL.md': 'r',
      'scout/skills/review/refs/a.md': 'a',
    })
    const parsed = await parseAgentZip(buf)
    expect(parsed.instructions).toBe('# Scout')
    expect(parsed.skillFiles.map(f => f.path)).toEqual(['skills/review/SKILL.md', 'skills/review/refs/a.md'])
  })

  it('merges a legacy archive\'s PROFILE and RESPONSIBILITIES by the P14 rule', async () => {
    const buf = await makeZip({
      'scout/agent.json': JSON.stringify({ name: 'Scout', handle: 'scout' }),
      'scout/PROFILE.md': '---\nname: Scout\n---\n# Scout\n',
      'scout/RESPONSIBILITIES.md': '# Responsibilities\n',
    })
    const parsed = await parseAgentZip(buf)
    expect(parsed.instructions).toBe('# Scout\n\n# Responsibilities\n')
  })

  it('refuses a skill path that could leave the package', async () => {
    const buf = await makeZip({ 'scout/agent.json': JSON.stringify({ name: 'S', handle: 'scout' }), 'scout/skills/../../evil.md': 'x' })
    await expect(parseAgentZip(buf)).rejects.toThrow(/unsafe path/i)
  })
})

// An uploaded archive is untrusted (bytes an ADMIN caller controls, not code):
// these bound it before any entry is inflated.
describe('parseAgentZip archive limits', () => {
  it('refuses an archive with too many entries, before inflating any of them', async () => {
    const zip = new JSZip()
    zip.file('scout/agent.json', JSON.stringify({ name: 'S', handle: 'scout' }))
    for (let i = 0; i < 2001; i++) zip.file(`scout/skills/x/${i}.md`, '')
    const buf = await zip.generateAsync({ type: 'nodebuffer' })
    await expect(parseAgentZip(buf)).rejects.toThrow(/entries exceeds the limit/i)
  })

  it('refuses an archive whose declared uncompressed size exceeds the package content bound', async () => {
    const zip = new JSZip()
    zip.file('scout/agent.json', JSON.stringify({ name: 'S', handle: 'scout' }))
    // Highly compressible, so the archive itself stays small — the bound is
    // read from the central directory's declared size, not the file's bytes.
    zip.file('scout/skills/x/SKILL.md', Buffer.alloc(9 * 1024 * 1024, 'a'))
    const buf = await zip.generateAsync({ type: 'nodebuffer' })
    await expect(parseAgentZip(buf)).rejects.toThrow(/uncompressed content is/i)
  })

  it('refuses a symlink entry', async () => {
    const zip = new JSZip()
    zip.file('scout/agent.json', JSON.stringify({ name: 'S', handle: 'scout' }))
    zip.file('scout/skills/x/SKILL.md', 'target-outside-the-package', { unixPermissions: 0o120777 })
    const buf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })
    await expect(parseAgentZip(buf)).rejects.toThrow(/symlink/i)
  })

  // The declared-size check alone is not the real guard: a hand-crafted
  // central directory can under-report an entry's uncompressed size while its
  // compressed bytes still inflate to something enormous (a "zip bomb"). This
  // reproduces that by patching the size JSZip itself reports after loading a
  // real, validly-structured archive — the only thing a forged central
  // directory record could achieve without JSZip refusing to parse it at all.
  it.each(['STORE', 'DEFLATE'] as const)('refuses an archive whose real inflated content exceeds the cap even when the declared size lies (%s)', async (compression) => {
    const zip = new JSZip()
    zip.file('scout/agent.json', JSON.stringify({ name: 'S', handle: 'scout' }))
    // Highly compressible (all zero bytes), so with DEFLATE this is small on
    // the wire — the shape of the archive a hand-crafted central directory
    // record would accompany.
    zip.file('scout/skills/x/SKILL.md', Buffer.alloc(20 * 1024 * 1024, 0))
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression })

    const realLoadAsync = JSZip.loadAsync.bind(JSZip)
    const spy = vi.spyOn(JSZip, 'loadAsync').mockImplementation(async (...args: Parameters<typeof JSZip.loadAsync>) => {
      const loaded = await realLoadAsync(...args)
      const entry = loaded.file('scout/skills/x/SKILL.md') as unknown as { _data?: { uncompressedSize?: number } }
      // What a lying central directory "uncompressed size" field looks like
      // once JSZip has parsed it — the declared-size early check must not be
      // what catches this.
      if (entry._data) entry._data.uncompressedSize = 100
      return loaded
    })
    try {
      let caught: unknown
      try {
        await parseAgentZip(buf)
      } catch (err) {
        caught = err
      }
      expect(caught).toBeInstanceOf(Error)
      const message = (caught as Error).message
      expect(message).toMatch(/reached \d+ bytes while streaming/i)
      const bytesRead = Number(/reached (\d+) bytes/i.exec(message)?.[1])
      // Refused while still streaming the 20 MiB entry, not after buffering
      // all of it: comfortably over the 8 MiB cap, nowhere near the full size.
      expect(bytesRead).toBeGreaterThan(8 * 1024 * 1024)
      expect(bytesRead).toBeLessThan(12 * 1024 * 1024)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('parseAgentZip entry that fails to inflate', () => {
  it('reports JSZip\'s own size-mismatch error as invalid content (400), not a server error', async () => {
    const zip = new JSZip()
    zip.file('scout/agent.json', JSON.stringify({ name: 'S', handle: 'scout' }))
    zip.file('scout/skills/x/SKILL.md', 'short skill body')
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

    const realLoadAsync = JSZip.loadAsync.bind(JSZip)
    const spy = vi.spyOn(JSZip, 'loadAsync').mockImplementation(async (...args: Parameters<typeof JSZip.loadAsync>) => {
      const loaded = await realLoadAsync(...args)
      const entry = loaded.file('scout/skills/x/SKILL.md') as unknown as { _data?: { uncompressedSize?: number } }
      if (entry._data) entry._data.uncompressedSize = 3
      return loaded
    })
    try {
      const err = await parseAgentZip(buf).catch(e => e)
      expect(err).toBeInstanceOf(PackageContentError)
      expect(err.message).toMatch(/size mismatch/)
    } finally {
      spy.mockRestore()
    }
  })
})

// A Finder-zipped folder carries `__MACOSX/` (AppleDouble resource-fork
// copies) alongside the real content folder, and stray dotfiles like
// `.DS_Store` — none of it package content, and none of it a reason to
// refuse the whole archive.
describe('parseAgentZip Finder-zip metadata', () => {
  it('skips a __MACOSX sibling and a root dotfile rather than rejecting them as an escape', async () => {
    const buf = await makeZip({
      'scout/agent.json': JSON.stringify({ name: 'Scout', handle: 'scout' }),
      'scout/instructions.md': '# Scout',
      '__MACOSX/scout/._agent.json': 'resource fork junk',
      '.DS_Store': 'finder junk',
    })
    const parsed = await parseAgentZip(buf)
    expect(parsed.instructions).toBe('# Scout')
  })
})
