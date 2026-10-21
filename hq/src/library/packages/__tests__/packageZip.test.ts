import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { readPackageZip, writePackageZip } from '../packageZip'
import type { PackageManifest } from '../packageManifest'

const manifest: PackageManifest = { format: 1, kind: 'board', name: 'Kanban', description: '', source: 'made_here', version: '1', publisher: 'Acme' }

async function zipOf(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(entries)) zip.file(name, content)
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('a package ZIP @SC-679 @SC-680', () => {
  it('round-trips: what is written reads back with its manifest apart from its files', async () => {
    const buffer = await writePackageZip('kanban', manifest, [{ path: 'board.json', content: Buffer.from('{"columns":[]}') }])
    const read = await readPackageZip(buffer)
    expect(read.root).toBe('kanban')
    expect(read.manifest).toEqual(manifest)
    expect(read.files.map(f => [f.path, f.content.toString()])).toEqual([['board.json', '{"columns":[]}']])
  })

  it('reads an archive with no manifest as one from before packages', async () => {
    const read = await readPackageZip(await zipOf({ 'scout/agent.json': '{}' }))
    expect(read.manifest).toBeNull()
  })

  it('skips Finder metadata beside the root folder', async () => {
    const read = await readPackageZip(await zipOf({ 'scout/agent.json': '{}', '__MACOSX/scout/._agent.json': 'x', '.DS_Store': 'x' }))
    expect(read.files.map(f => f.path)).toEqual(['agent.json'])
  })

  it('refuses files outside one root folder, a path that climbs out, a bad manifest, and what is not a ZIP', async () => {
    await expect(readPackageZip(await zipOf({ 'a/x': '1', 'b/y': '2' }))).rejects.toThrow('one folder')
    await expect(readPackageZip(await zipOf({ 'loose.txt': '1' }))).rejects.toThrow('one folder')
    await expect(readPackageZip(await zipOf({ 'a/skills/../../evil.md': '1' }))).rejects.toThrow()
    await expect(readPackageZip(await zipOf({ 'a/package.json': '{"format":9}' }))).rejects.toThrow('format')
    await expect(readPackageZip(await zipOf({ 'a/package.json': 'not json' }))).rejects.toThrow('not valid JSON')
    await expect(readPackageZip(Buffer.from('plain text'))).rejects.toThrow('not a ZIP')
  })
})
