import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyFileContent, FILE_CONTENT_MAX_BYTES } from '../fileContentService'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('classifyFileContent @SC-265 @SC-266', () => {
  it('classifies markdown, code, and image', () => {
    expect(classifyFileContent('a.md', Buffer.from('# Hi'))).toMatchObject({ kind: 'markdown', text: '# Hi' })
    expect(classifyFileContent('b.ts', Buffer.from('const x = 1'))).toMatchObject({
      kind: 'code', lang: 'typescript', text: 'const x = 1',
    })
    const img = classifyFileContent('c.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect(img.kind).toBe('image')
    expect((img as { dataUrl: string }).dataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('falls through to binary on a NUL byte', () => {
    expect(classifyFileContent('d.bin', Buffer.from([0x00, 0x01, 0x02, 0x00])).kind).toBe('binary')
  })

  it('still caps what it will classify, whatever the caller asked the site for', () => {
    const over = Buffer.alloc(FILE_CONTENT_MAX_BYTES + 1, 0x61)
    expect(classifyFileContent('huge.md', over)).toEqual({ kind: 'too-large', name: 'huge.md' })
  })

  it('answers directly rather than returning a promise — nothing here waits on a disk', () => {
    expect(classifyFileContent('a.md', Buffer.from('# Hi'))).not.toBeInstanceOf(Promise)
  })

  // The judgement stays on hq; the filesystem access is the site's. A module
  // that grew an `fs` import back would pass every case above.
  it('reaches no filesystem and no containment helper', async () => {
    const src = await fs.readFile(path.join(here, '..', 'fileContentService.ts'), 'utf8')
    expect(src).not.toMatch(/node:fs/)
    expect(src).not.toMatch(/resolveRealPathWithin/)
  })
})
