/**
 * The choices every avatar style shares: a background of one palette colour or a gradient of two, and Mirror.
 */
import { AVATAR_COLOURS, avatarColourHex, isAvatarColour } from '../palette'
import { PictureRecipeError } from '../recipe'
import { pickOne, type Rng } from '../random'
import type { PictureFill } from './types'

export const BACKGROUND_KEYS = ['background', 'background2'] as const

export interface BackgroundChoice {
  background: string
  background2: string | null
}

export function readBackground(choices: Record<string, unknown>): BackgroundChoice {
  if (!isAvatarColour(choices.background)) throw new PictureRecipeError('background is not a palette colour')
  const second = choices.background2 ?? null
  if (second !== null && !isAvatarColour(second)) throw new PictureRecipeError('background2 is not a palette colour')
  return { background: choices.background, background2: second }
}

export function readFlip(choices: Record<string, unknown>): boolean {
  const flip = choices.flip ?? false
  if (typeof flip !== 'boolean') throw new PictureRecipeError('flip is not true or false')
  return flip
}

export function backgroundFill(bg: BackgroundChoice): PictureFill {
  return bg.background2 === null
    ? { colours: [avatarColourHex(bg.background)] }
    : { colours: [avatarColourHex(bg.background), avatarColourHex(bg.background2)] }
}

/**
 * One colour most of the time, a gradient of two now and then, as the picker's Surprise me does. `midOnly` keeps to the
 * mid tones, for a style that draws in white and would vanish on a soft tint.
 */
export function randomBackground(rng: Rng, midOnly = false): BackgroundChoice {
  const colours = midOnly ? AVATAR_COLOURS.filter((c) => !c.endsWith('-soft')) : AVATAR_COLOURS
  const background = pickOne(rng, colours)
  const background2 = rng() < 0.3 ? pickOne(rng, colours.filter((c) => c !== background)) : null
  return { background, background2 }
}

/** DiceBear's own background options for a background choice. */
export function dicebearBackground(bg: BackgroundChoice): Record<string, unknown> {
  const fill = backgroundFill(bg)
  return {
    backgroundColor: [...fill.colours],
    backgroundType: [fill.colours.length === 2 ? 'gradientLinear' : 'solid'],
    backgroundRotation: [45],
  }
}
