import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { readFolderPackage, readZipPackage } from '../archive'

async function zipOf(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(entries)) zip.file(name, content)
  return zip.generateAsync({ type: 'nodebuffer' })
}

/** A ZIP whose two entries end up with one name: written apart, then renamed in place in every header. */
async function duplicateZip(): Promise<Buffer> {
  const buffer = await zipOf({ 'skill/SKILL.md': 'good', 'skill/SKILL.mE': 'evil' })
  return Buffer.from(buffer.toString('latin1').split('skill/SKILL.mE').join('skill/SKILL.md'), 'latin1')
}

describe('reading an arrived package (H1) @security-H1 @SC-1610', () => {
  it('keeps every file under the root, package.json included', async () => {
    const read = await readZipPackage(await zipOf({ 'x/package.json': '{}', 'x/SKILL.md': 'b', 'x/scripts/run.sh': 'c' }))
    expect(read.root).toBe('x')
    expect(read.files.map(f => f.path)).toEqual(['SKILL.md', 'package.json', 'scripts/run.sh'])
  })

  it('refuses two entries with the same name, which a reader would keep only one of', async () => {
    await expect(readZipPackage(await duplicateZip())).rejects.toThrow(/two entries in it have the same name/)
  })

  it('refuses names that differ only by case or by Unicode encoding', async () => {
    await expect(readZipPackage(await zipOf({ 'x/SKILL.md': 'a', 'x/skill.md': 'b' }))).rejects.toThrow(/differ only by capital letters/)
    await expect(readZipPackage(await zipOf({ 'x/SKILL.md': 'a', 'x/Docs/a.md': 'a', 'x/docs/b.md': 'b' }))).rejects.toThrow(/capital letters/)
    await expect(readZipPackage(await zipOf({ 'x/SKILL.md': 'a', 'x/café.md': 'a', 'x/café.md': 'b' }))).rejects.toThrow()
  })

  it('refuses hidden and system entries instead of skipping them', async () => {
    await expect(readZipPackage(await zipOf({ 'x/SKILL.md': 'a', 'x/.hidden': 'b' }))).rejects.toThrow(/hidden or system file/)
    await expect(readZipPackage(await zipOf({ 'x/SKILL.md': 'a', '__MACOSX/x/._SKILL.md': 'b' }))).rejects.toThrow(/hidden or system file/)
  })

  it('refuses a path that climbs out, files outside one folder, and what is not a ZIP', async () => {
    await expect(readZipPackage(await zipOf({ 'x/SKILL.md': 'a', 'x/a/../../evil.md': 'b' }))).rejects.toThrow()
    await expect(readZipPackage(await zipOf({ 'x/SKILL.md': 'a', 'y/SKILL.md': 'b' }))).rejects.toThrow(/one folder/)
    await expect(readZipPackage(Buffer.from('plain text'))).rejects.toThrow(/not a ZIP/)
  })

  it('reads a folder sent file by file under the same rules', () => {
    const file = (path: string) => ({ path, content: Buffer.from(path) })
    expect(readFolderPackage([file('x/SKILL.md'), file('x/ref/a.md')]).files.map(f => f.path)).toEqual(['SKILL.md', 'ref/a.md'])
    expect(() => readFolderPackage([file('x/SKILL.md'), file('x/SKILL.md')])).toThrow(/twice/)
    expect(() => readFolderPackage([file('x/SKILL.md'), file('X/a.md')])).toThrow()
    expect(() => readFolderPackage([file('x/SKILL.md'), file('x/.git/config')])).toThrow(/hidden/)
    expect(() => readFolderPackage([])).toThrow(/empty/)
  })
})
