import { describe, expect, it } from 'vitest'
import { chooseFileKind, contentTypeForName, FILE_KINDS } from '../kind.js'
import { looksLikeText } from '../sniff.js'
import { fileVersion } from '../contract.js'
import { utf8 } from '../../host/crypto/webCrypto.js'

const enc = utf8

describe('choosing a file\'s kind, over every renderer in the table @SC-1447', () => {
  it('markdown', () => {
    expect(chooseFileKind('README.md', true)).toEqual({ kind: 'markdown', contentType: 'text/markdown' })
    expect(chooseFileKind('notes/Plan.MARKDOWN', true).kind).toBe('markdown')
  })

  it('text, for a text file nothing else claims', () => {
    expect(chooseFileKind('run.log', true)).toEqual({ kind: 'text', contentType: 'text/plain' })
    expect(chooseFileKind('LICENSE', true)).toEqual({ kind: 'text', contentType: 'text/plain' })
    expect(chooseFileKind('data.weird', true)).toEqual({ kind: 'text', contentType: 'text/plain' })
  })

  it('code, with its language; YAML and HTML source are code', () => {
    expect(chooseFileKind('src/app.tsx', true)).toEqual({ kind: 'code', contentType: 'text/plain', language: 'tsx' })
    expect(chooseFileKind('main.py', true).language).toBe('python')
    expect(chooseFileKind('compose.yml', true)).toEqual({ kind: 'code', contentType: 'application/yaml', language: 'yaml' })
    expect(chooseFileKind('index.html', true)).toEqual({ kind: 'code', contentType: 'text/html', language: 'html' })
    expect(chooseFileKind('Dockerfile', true).language).toBe('dockerfile')
    expect(chooseFileKind('.env', true).language).toBe('bash')
  })

  it('json and csv', () => {
    expect(chooseFileKind('package.json', true)).toEqual({ kind: 'json', contentType: 'application/json' })
    expect(chooseFileKind('sales.csv', true)).toEqual({ kind: 'csv', contentType: 'text/csv' })
  })

  it('image, by name alone, an SVG included', () => {
    for (const [name, type] of [
      ['a.png', 'image/png'], ['a.JPG', 'image/jpeg'], ['a.jpeg', 'image/jpeg'], ['a.gif', 'image/gif'],
      ['a.webp', 'image/webp'], ['a.avif', 'image/avif'], ['a.svg', 'image/svg+xml'], ['favicon.ico', 'image/x-icon'],
      ['a.bmp', 'image/bmp'],
    ]) {
      expect(chooseFileKind(name, false), name).toEqual({ kind: 'image', contentType: type })
      expect(chooseFileKind(name, true).kind, name).toBe('image')
    }
  })

  it('pdf, by name alone', () => {
    expect(chooseFileKind('reports/q3.pdf', false)).toEqual({ kind: 'pdf', contentType: 'application/pdf' })
  })

  it('none, for binary the name says nothing about, and for binary named as text', () => {
    expect(chooseFileKind('archive.zip', false)).toEqual({ kind: 'none', contentType: 'application/octet-stream' })
    expect(chooseFileKind('fake.md', false)).toEqual({ kind: 'none', contentType: 'text/markdown' })
    expect(chooseFileKind('fake.ts', false).kind).toBe('none')
  })

  it('reads the name from a path, either separator', () => {
    expect(chooseFileKind('a/b.c/notes.md', true).kind).toBe('markdown')
    expect(chooseFileKind('a\\b\\x.csv', true).kind).toBe('csv')
    expect(contentTypeForName('dir.png/file')).toBe('application/octet-stream')
  })

  it('names every kind it can return', () => {
    expect([...FILE_KINDS]).toEqual(['markdown', 'text', 'code', 'json', 'csv', 'image', 'pdf', 'none'])
  })
})

describe('whether the first bytes look like text @SC-1448', () => {
  it('UTF-8 text, accents and emoji included', () => {
    expect(looksLikeText(enc('hello\nwörld\t— ✓ 🎉\r\n'))).toBe(true)
    expect(looksLikeText(new Uint8Array(0))).toBe(true)
    expect(looksLikeText(enc('\x1b[32mok\x1b[0m'))).toBe(true)
  })

  it('a character cut off by the end of the sample', () => {
    const bytes = enc('ab🎉')
    expect(looksLikeText(bytes.subarray(0, bytes.length - 1))).toBe(true)
  })

  it('not with a NUL byte, invalid UTF-8, or many control characters', () => {
    expect(looksLikeText(new Uint8Array([0x68, 0x00, 0x69]))).toBe(false)
    expect(looksLikeText(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
    expect(looksLikeText(new Uint8Array([0xc0, 0x80]))).toBe(false)
    expect(looksLikeText(new Uint8Array([0xed, 0xa0, 0x80]))).toBe(false)
    expect(looksLikeText(enc('a\x01b\x02c\x03'))).toBe(false)
    expect(looksLikeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00]))).toBe(false)
  })
})

describe('a file\'s version @SC-1449', () => {
  it('agrees whether made from an ISO time, a millisecond count or a fractional one', () => {
    const iso = '2026-10-26T10:00:00.123Z'
    const ms = Date.parse(iso)
    expect(fileVersion(10, iso)).toBe(`10:${ms}`)
    expect(fileVersion(10, ms + 0.789)).toBe(fileVersion(10, iso))
    expect(fileVersion(10, new Date(iso))).toBe(fileVersion(10, iso))
  })

  it('refuses what is not a size and a time', () => {
    expect(() => fileVersion(-1, 0)).toThrow()
    expect(() => fileVersion(1, 'not a time')).toThrow()
  })
})
