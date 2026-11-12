/**
 * The cover generator: two palette hues in a look, a linear or radial blend at a direction, and one of thirteen
 * patterns drawn from an integer seed (the picker's *Another of this pattern*). Our own, so the set can grow.
 */
import { COVER_HUES, COVER_LOOKS, coverColourHex, isCoverHue, isCoverLook, type CoverHue, type CoverLook } from '../../palette'
import { intBetween, pickOne, seededRng } from '../../random'
import { PictureRecipeError, isPlainObject, onlyKeys } from '../../recipe'
import type { PictureStyle } from '../types'
import { COVER_PATTERNS, isCoverPattern, patternSvg, type CoverPattern } from './patterns'

export const COVER_BLENDS = ['linear', 'radial'] as const
type CoverBlend = (typeof COVER_BLENDS)[number]

/** The blend's direction in whole degrees, 0 to 359. */
export const COVER_DIRECTION_MAX = 359
/** The pattern seed, 0 to this (an unsigned 32-bit integer). */
export const COVER_SEED_MAX = 0xffffffff

interface CoverChoices {
  colours: [CoverHue, CoverHue]
  look: CoverLook
  blend: CoverBlend
  direction: number
  pattern: CoverPattern
  seed: number
}

function readChoices(choices: Record<string, unknown>): CoverChoices {
  onlyKeys(choices, ['colours', 'look', 'blend', 'direction', 'pattern', 'seed'], 'choices')
  const { colours, look, blend, direction, pattern, seed } = choices
  if (!Array.isArray(colours) || colours.length !== 2 || !isCoverHue(colours[0]) || !isCoverHue(colours[1])) {
    throw new PictureRecipeError('colours are not two cover hues')
  }
  if (!isCoverLook(look)) throw new PictureRecipeError('look is not a cover look')
  if (blend !== 'linear' && blend !== 'radial') throw new PictureRecipeError('blend is not linear or radial')
  if (!Number.isInteger(direction) || (direction as number) < 0 || (direction as number) > COVER_DIRECTION_MAX) {
    throw new PictureRecipeError('direction is not 0 to 359 degrees')
  }
  if (!isCoverPattern(pattern)) throw new PictureRecipeError('pattern is not one of the cover patterns')
  if (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > COVER_SEED_MAX) {
    throw new PictureRecipeError('seed is not an integer')
  }
  return { colours: [colours[0], colours[1]], look, blend, direction: direction as number, pattern, seed: seed as number }
}

function coverSvg(c: CoverChoices): string {
  const first = coverColourHex(c.colours[0], c.look, 0)
  const second = coverColourHex(c.colours[1], c.look, 1)
  const rad = (c.direction * Math.PI) / 180
  const gradient =
    c.blend === 'radial'
      ? `<radialGradient id="g" cx="${(Math.cos(rad) * 0.4 + 0.5).toFixed(2)}" cy="${(Math.sin(rad) * 0.4 + 0.5).toFixed(2)}" r="0.9"><stop offset="0" stop-color="#${first}"/><stop offset="1" stop-color="#${second}"/></radialGradient>`
      : `<linearGradient id="g" gradientTransform="rotate(${c.direction} .5 .5)"><stop offset="0" stop-color="#${first}"/><stop offset="1" stop-color="#${second}"/></linearGradient>`
  const pattern = patternSvg(c.pattern, seededRng(c.seed), first, second)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"><defs>${gradient}</defs><rect width="300" height="100" fill="url(#g)"/>${pattern}</svg>`
}

export const coverPatternsStyle: PictureStyle = {
  id: 'patterns',
  kind: 'cover',
  category: 'cover',
  label: 'Patterns',
  version: 1,
  offeredTo: ['agent', 'person', 'team', 'org'],
  followsName: false,
  available: () => true,

  validate(choices) {
    if (!isPlainObject(choices)) throw new PictureRecipeError('no choices')
    const c = readChoices(choices)
    return Promise.resolve({ ...c, colours: [...c.colours] })
  },

  draw(choices) {
    return Promise.resolve({ type: 'svg', svg: coverSvg(readChoices(choices)) })
  },

  random(rng) {
    const first = pickOne(rng, COVER_HUES)
    // Neighbouring (one or two steps along the wheel) or complementary (half way round) hues, as the picker board does.
    const step = rng() < 0.5 ? intBetween(rng, 1, 2) * (rng() < 0.5 ? 1 : -1) : COVER_HUES.length / 2
    const second = COVER_HUES[(COVER_HUES.indexOf(first) + step + COVER_HUES.length) % COVER_HUES.length]
    const choices: CoverChoices = {
      colours: [first, second],
      look: pickOne(rng, COVER_LOOKS),
      blend: rng() < 0.3 ? 'radial' : 'linear',
      direction: intBetween(rng, 0, COVER_DIRECTION_MAX),
      pattern: pickOne(rng, COVER_PATTERNS),
      seed: intBetween(rng, 0, 999_999),
    }
    return Promise.resolve({ ...choices, colours: [...choices.colours] })
  },
}
