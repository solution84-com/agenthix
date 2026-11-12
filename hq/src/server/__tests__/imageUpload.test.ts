/**
 * An upload is re-encoded by sharp (ADR-0187): written as WebP at the stored size with its small copy, its metadata
 * gone; a file that is not a raster picture — an SVG whatever type it was sent as — or one over the pixel limit is a
 * 400 in plain words, and nothing is written.
 */
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { getHqStorageRoot } from '../hqStoragePaths'
import { smallPictureName } from '../../shared/pictures/files'
import { MAX_INPUT_PIXELS } from '../../pictures/encode'
import { pngDeclaring } from '../../pictures/__tests__/pngDeclaring'
import { NOT_A_PICTURE, PICTURE_TOO_LARGE, imageBytesFromDataUrl, writeUploadedPicture } from '../imageUpload'

const dataUrl = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString('base64')}`
const dir = (name: string) => path.join(getHqStorageRoot(), 'agents', name, 'images')
const listed = (d: string) => fs.readdir(d).catch(() => [] as string[])

describe('an uploaded picture @SC-2011', () => {
  it('is written again as WebP inside the stored size, with its small copy and without its metadata', async () => {
    const jpeg = await sharp({ create: { width: 2048, height: 2048, channels: 3, background: '#336699' } })
      .withExif({ IFD0: { ImageDescription: 'where it was taken' } }).jpeg().toBuffer()
    const written = await writeUploadedPicture(dir('u1'), dataUrl('image/jpeg', jpeg), 'avatar')

    expect(written.fileName).toMatch(/^[0-9a-f-]{36}\.webp$/)
    expect(written.recipe).toBeNull()
    expect((await listed(dir('u1'))).sort()).toEqual([written.fileName, smallPictureName(written.fileName)].sort())
    const full = await sharp(await fs.readFile(path.join(dir('u1'), written.fileName))).metadata()
    const small = await sharp(await fs.readFile(path.join(dir('u1'), smallPictureName(written.fileName)))).metadata()
    expect([full.format, full.width, full.height, full.exif]).toEqual(['webp', 1024, 1024, undefined])
    expect([small.format, small.width, small.height]).toEqual(['webp', 256, 256])
  })

  it('keeps a cover its own shape and never enlarges it', async () => {
    const png = await sharp({ create: { width: 900, height: 300, channels: 3, background: '#663399' } }).png().toBuffer()
    const written = await writeUploadedPicture(dir('u2'), dataUrl('image/png', png), 'cover')
    const full = await sharp(await fs.readFile(path.join(dir('u2'), written.fileName))).metadata()
    expect([full.width, full.height]).toEqual([900, 300])
  })

  it.each([
    ['an SVG sent as a PNG', dataUrl('image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), NOT_A_PICTURE],
    ['bytes that are no picture', dataUrl('image/webp', Buffer.from('not a picture')), NOT_A_PICTURE],
  ])('refuses %s with a 400 in plain words, writing nothing', async (_name, url, message) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(writeUploadedPicture(dir('u3'), url, 'avatar')).rejects.toMatchObject({ statusCode: 400, message })
    expect(await listed(dir('u3'))).toEqual([])
  })

  it('refuses a picture whose header declares more pixels than the limit, as too large', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bomb = await pngDeclaring(Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 1)
    await expect(writeUploadedPicture(dir('u4'), dataUrl('image/png', bomb), 'cover'))
      .rejects.toMatchObject({ statusCode: 400, message: PICTURE_TOO_LARGE })
    expect(await listed(dir('u4'))).toEqual([])
  })

  it('still checks the declared type and the 5 MB limit first', () => {
    expect(() => imageBytesFromDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => imageBytesFromDataUrl(42)).toThrow(expect.objectContaining({ statusCode: 400 }))
    const big = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')
    expect(() => imageBytesFromDataUrl(`data:image/png;base64,${big}`)).toThrow(expect.objectContaining({ message: expect.stringContaining('5 MB') }))
  })
})
