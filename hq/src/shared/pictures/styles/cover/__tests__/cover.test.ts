import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { renderRecipe } from '../../../../../pictures/render'
import { drawRecipe, randomRecipe, validateRecipe } from '../../../pictures'
import type { PictureContext, PictureRecipe } from '../../../recipe'
import { COVER_PATTERNS } from '../patterns'

const ctx: PictureContext = { subject: { kind: 'person', name: 'Avery Chen' }, robots: null }
const base: Record<string, unknown> = { colours: ['indigo', 'purple'], look: 'soft', blend: 'linear', direction: 135, pattern: 'topography', seed: 2846 }
const recipe = (choices: Record<string, unknown>): PictureRecipe => ({ v: 1, kind: 'cover', style: 'patterns', styleVersion: 1, choices })
const svgOf = async (r: PictureRecipe) => {
  const d = await drawRecipe(r, 'cover', ctx)
  if (d.type !== 'svg') throw new Error('not svg')
  return d.svg
}

describe('the cover generator @SC-2009', () => {
  it.each(COVER_PATTERNS)('validates and draws %s for several seeds, the same seed the same drawing', async (pattern) => {
    for (const seed of [0, 7, 2846, 4294967295]) {
      const r = recipe({ ...base, pattern, seed })
      expect(await validateRecipe(r, 'cover', ctx)).toEqual({ ok: true, recipe: r })
      const a = await svgOf(r)
      expect(a).toBe(await svgOf(r))
      expect(a).toContain('viewBox="0 0 300 100"')
    }
    if (pattern !== 'none') {
      expect(await svgOf(recipe({ ...base, pattern, seed: 1 }))).not.toBe(await svgOf(recipe({ ...base, pattern, seed: 2 })))
    }
  })

  it('draws a radial blend and every look', async () => {
    expect(await svgOf(recipe({ ...base, blend: 'radial' }))).toContain('<radialGradient')
    for (const look of ['soft', 'vivid', 'deep']) expect(await svgOf(recipe({ ...base, look }))).toContain('<linearGradient')
  })

  it('makes valid random covers, the same for the same seed, offered to all four subjects', async () => {
    for (const seed of [1, 'a', 3, 4, 5]) {
      const r = await randomRecipe('patterns', seed, ctx)
      expect(await validateRecipe(r, 'cover', ctx)).toEqual({ ok: true, recipe: r })
      expect(r).toEqual(await randomRecipe('patterns', seed, ctx))
    }
    for (const kind of ['agent', 'person', 'team', 'org'] as const) {
      await expect(randomRecipe('patterns', 1, { subject: { kind, name: 'X' }, robots: null })).resolves.toBeTruthy()
    }
  })

  const refused: [string, Record<string, unknown>][] = [
    ['an unknown pattern', { ...base, pattern: 'plaid' }],
    ['an off-palette colour', { ...base, colours: ['indigo', 'ff0000'] }],
    ['an avatar colour', { ...base, colours: ['lavender-soft', 'teal'] }],
    ['one colour', { ...base, colours: ['indigo'] }],
    ['a bad look', { ...base, look: 'neon' }],
    ['a bad blend', { ...base, blend: 'conic' }],
    ['a direction out of range', { ...base, direction: 360 }],
    ['a fractional direction', { ...base, direction: 10.5 }],
    ['a negative seed', { ...base, seed: -1 }],
    ['a text seed', { ...base, seed: '12' }],
    ['an unknown field', { ...base, extra: 1 }],
  ]
  it.each(refused)('refuses %s', async (_name, choices) => {
    expect((await validateRecipe(recipe(choices), 'cover', ctx)).ok).toBe(false)
  })

  it.each(['colours', 'look', 'blend', 'direction', 'pattern', 'seed'])('refuses a missing %s', async (field) => {
    const rest = { ...base }
    delete rest[field]
    expect((await validateRecipe(recipe(rest), 'cover', ctx)).ok).toBe(false)
  })

  it('renders a 1500 x 500 cover with a 600 x 200 copy', async () => {
    const { full, small } = await renderRecipe(recipe(base), 'cover', ctx, { robot: () => Promise.reject(new Error('none')) })
    const f = await sharp(full).metadata()
    const s = await sharp(small).metadata()
    expect([f.width, f.height, f.format]).toEqual([1500, 500, 'webp'])
    expect([s.width, s.height]).toEqual([600, 200])
  })
})
