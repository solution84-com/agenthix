import { describe, expect, it } from 'vitest'
import {
  SHARED_NAME_MAX_CHARS, cleanSharedName, numberedSharedName, sharedFilesOf, sharedNameProblem, sharedReference,
  sniffSharedContent,
} from '../sharedFiles.js'

const bytes = (...b: number[]) => new Uint8Array(b)
const text = (s: string) => new Uint8Array([...unescape(encodeURIComponent(s))].map(c => c.charCodeAt(0)))
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 1, 2)

describe('what a shared file is, read from its content', () => {
  it('knows the four image kinds and PDF by their first bytes, whatever the name says', () => {
    expect(sniffSharedContent(PNG, 'shot.jpg')).toEqual({ kind: 'image', mime: 'image/png', ext: 'png' })
    expect(sniffSharedContent(JPEG, 'photo.png')).toEqual({ kind: 'image', mime: 'image/jpeg', ext: 'jpg' })
    expect(sniffSharedContent(JPEG, 'photo.jpeg')?.ext).toBe('jpeg')
    expect(sniffSharedContent(text('GIF89a....'), 'a.gif')?.mime).toBe('image/gif')
    expect(sniffSharedContent(text('RIFF\u0001\u0001\u0001\u0001WEBPVP8 '), 'a.webp')?.mime).toBe('image/webp')
    expect(sniffSharedContent(text('%PDF-1.7\n'), 'a.txt')).toEqual({ kind: 'file', mime: 'application/pdf', ext: 'pdf' })
  })

  it('takes UTF-8 text, under its own extension for a kept kind and as .txt otherwise', () => {
    expect(sniffSharedContent(text('# Notes\nCafé ✓\n'), 'notes.md')).toEqual({ kind: 'file', mime: 'text/markdown', ext: 'md' })
    expect(sniffSharedContent(text('<script>alert(1)</script>'), 'page.html')).toEqual({ kind: 'file', mime: 'text/plain', ext: 'txt' })
    expect(sniffSharedContent(text('<svg onload="x()"/>'), 'logo.svg')?.ext).toBe('txt')
  })

  it('refuses anything else: a program, an archive, broken UTF-8, an empty file', () => {
    expect(sniffSharedContent(bytes(0x7f, 0x45, 0x4c, 0x46, 2, 1), 'run.png')).toBeNull()
    expect(sniffSharedContent(bytes(0x50, 0x4b, 0x03, 0x04, 0, 0), 'doc.txt')).toBeNull()
    expect(sniffSharedContent(bytes(0x68, 0x69, 0xc3), 'cut.txt')).toBeNull()
    expect(sniffSharedContent(bytes(0x68, 0x00, 0x69), 'nul.txt')).toBeNull()
    expect(sniffSharedContent(bytes(0xed, 0xa0, 0x80), 'surrogate.txt')).toBeNull()
    expect(sniffSharedContent(bytes(), 'empty.txt')).toBeNull()
  })
})

describe('the name a shared file is kept under', () => {
  const png = { ext: 'png' }
  it('keeps the last segment only, with no separators, control characters or leading dots', () => {
    expect(cleanSharedName('../../etc/passwd', { ext: 'txt' })).toBe('passwd.txt')
    expect(cleanSharedName('C:\\Users\\me\\Screen Shot.png', png)).toBe('Screen Shot.png')
    expect(cleanSharedName('.hidden.png', png)).toBe('hidden.png')
    expect(cleanSharedName('a\u0000b<c>|d?.png', png)).toBe('a b c d.png')
    expect(cleanSharedName('...', png)).toBe('file.png')
    expect(cleanSharedName('', png)).toBe('file.png')
  })

  it('ends in the extension its content gives it', () => {
    expect(cleanSharedName('photo.png', { ext: 'jpg' })).toBe('photo.png.jpg')
    expect(cleanSharedName('photo.PNG', png)).toBe('photo.png')
    expect(cleanSharedName('report', { ext: 'pdf' })).toBe('report.pdf')
  })

  it('is never longer than the limit, and always passes the site\'s check', () => {
    const long = cleanSharedName(`${'x'.repeat(400)}.png`, png)
    expect([...long].length).toBeLessThanOrEqual(SHARED_NAME_MAX_CHARS)
    for (const raw of ['../a.png', ' x .png', 'é\u0301.png', 'a. .png', long]) {
      expect(sharedNameProblem(cleanSharedName(raw, png))).toBeNull()
    }
  })

  it('is refused by the site when it is not one plain segment', () => {
    for (const bad of ['', 'a/b.png', '..', '.png', 'a.png.', ' a.png', 'noext', 'a\\b.png', 'e\u0301.png', 7]) {
      expect(sharedNameProblem(bad)).not.toBeNull()
    }
  })

  it('is numbered for a second file of one name, and named for the agent under files/', () => {
    expect(numberedSharedName('shot.png', 2)).toBe('shot (2).png')
    expect(sharedReference('shot.png')).toBe('files/Shared in conversations/shot.png')
  })
})

describe('a stored message\'s shared files', () => {
  it('keeps only well-formed entries', () => {
    const good = { name: 'a.png', kind: 'image', mime: 'image/png', size: 10 }
    expect(sharedFilesOf([good, { ...good, name: '../x.png' }, { ...good, kind: 'exe' }, null, 'x'])).toEqual([good])
    expect(sharedFilesOf(undefined)).toEqual([])
  })
})
