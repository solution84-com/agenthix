import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { randomRecipe } from '../../shared/pictures/pictures'
import type { PictureContext, PictureSubject } from '../../shared/pictures/recipe'
import { PICTURE_STYLES } from '../../shared/pictures/styles'
import { smallPictureName } from '../../shared/pictures/files'
import { getHqStorageRoot } from '../../server/hqStoragePaths'
import { MAX_INPUT_PIXELS, encodePicture } from '../encode'
import { renderRecipe, type PictureAssets } from '../render'
import { writePicture } from '../writePicture'

const agent: PictureSubject = { kind: 'agent', name: 'Writer' }
const ctx = (subject: PictureSubject = agent): PictureContext => ({ subject, robots: ['planner-checklist', 'kernel'] })

// A stand-in robot: an opaque square in the middle of a transparent picture.
const robotPicture = () =>
  sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 200, height: 200, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }, gravity: 'centre' }])
    .webp()
    .toBuffer()
const assets: PictureAssets = { robot: () => robotPicture() }

async function expectWebp(buf: Buffer, width: number, height: number) {
  const meta = await sharp(buf).metadata()
  expect(meta.format).toBe('webp')
  expect([meta.width, meta.height]).toEqual([width, height])
}

describe('renderRecipe', () => {
  it.each(PICTURE_STYLES.filter((s) => s.kind === 'avatar').map((s) => [s.id, s] as const))('draws %s as a full WebP and a small copy', async (_id, style) => {
    const subject: PictureSubject = style.offeredTo.includes('agent') ? agent : { kind: 'org', name: 'Fernhill' }
    const recipe = await randomRecipe(style.id, 7, ctx(subject))
    const { full, small } = await renderRecipe(recipe, 'avatar', ctx(subject), assets)
    await expectWebp(full, 1024, 1024)
    await expectWebp(small, 256, 256)
  })

  it('places a robot zoomed on its background colour', async () => {
    const recipe = await randomRecipe('robots', 1, ctx())
    const recipeOnLavender = { ...recipe, choices: { ...recipe.choices, background: 'lavender', background2: null } }
    const { full } = await renderRecipe(recipeOnLavender, 'avatar', ctx(), assets)
    const { data } = await sharp(full).raw().toBuffer({ resolveWithObject: true })
    const corner = [data[0], data[1], data[2]]
    // lavender's mid tone is c4b5fd; WebP is lossy, so near it.
    expect(Math.abs(corner[0] - 0xc4)).toBeLessThan(6)
    expect(Math.abs(corner[2] - 0xfd)).toBeLessThan(6)
  })

  it('refuses a recipe the registry refuses, before drawing', async () => {
    await expect(renderRecipe({ v: 1, kind: 'avatar', style: 'robots', styleVersion: 1, choices: { robot: '../etc' } }, 'avatar', ctx(), assets)).rejects.toThrow()
  })
})

describe('encodePicture', () => {
  it('re-encodes an upload as WebP without its metadata, fitted inside the stored size', async () => {
    const jpeg = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#336699' } })
      .withExif({ IFD0: { Copyright: 'someone', ImageDescription: 'where it was taken' } })
      .jpeg()
      .toBuffer()
    expect((await sharp(jpeg).metadata()).exif).toBeDefined()
    const { full, small } = await encodePicture(jpeg, 'cover', 'inside')
    await expectWebp(full, 1500, 500)
    await expectWebp(small, 600, 200)
    expect((await sharp(full).metadata()).exif).toBeUndefined()
  })

  it('refuses what is not a picture', async () => {
    await expect(encodePicture(Buffer.from('not a picture at all'), 'avatar')).rejects.toThrow()
  })

  it('refuses a picture over the pixel limit before decoding it', async () => {
    const side = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 1
    const bomb = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><rect width="1" height="1"/></svg>`)
    await expect(encodePicture(bomb, 'avatar')).rejects.toThrow(/pixel limit/i)
  })
})

describe('writePicture', () => {
  const root = () => getHqStorageRoot()

  it('writes the full picture and its small copy and returns the name', async () => {
    const dir = path.join(root(), 'agents', 'a1', 'images')
    const recipe = await randomRecipe('thumbs', 3, ctx())
    const written = await writePicture(dir, { type: 'recipe', recipe, kind: 'avatar', context: ctx(), assets })
    expect(written.fileName).toMatch(/^[0-9a-f-]{36}\.webp$/)
    expect(written.recipe).toEqual(recipe)
    const full = await fs.readFile(path.join(dir, written.fileName))
    const small = await fs.readFile(path.join(dir, smallPictureName(written.fileName)))
    await expectWebp(full, 1024, 1024)
    await expectWebp(small, 256, 256)
    expect(written.bytes).toBe(full.length + small.length)
  })

  it('writes an already-encoded picture', async () => {
    const dir = path.join(root(), 'teams', 't1', 'images')
    const picture = { full: Buffer.from('full'), small: Buffer.from('small') }
    const written = await writePicture(dir, { type: 'encoded', picture })
    expect(written.recipe).toBeNull()
    expect(await fs.readFile(path.join(dir, smallPictureName(written.fileName)), 'utf8')).toBe('small')
  })

  it('refuses a directory outside hq storage', async () => {
    const picture = { full: Buffer.from('f'), small: Buffer.from('s') }
    await expect(writePicture(path.join(root(), '..', 'escaped'), { type: 'encoded', picture })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a recipe validation refuses, writing nothing', async () => {
    const dir = path.join(root(), 'agents', 'a2', 'images')
    const recipe = { v: 1, kind: 'avatar', style: 'robots', styleVersion: 1, choices: { robot: 'kernel', background: 'lavender', flip: false } }
    await expect(writePicture(dir, { type: 'recipe', recipe, kind: 'avatar', context: ctx(), assets })).rejects.toMatchObject({ statusCode: 400 })
    await expect(fs.readdir(dir)).rejects.toThrow()
  })
})
