import { describe, expect, it } from 'vitest'
import {
  AVATAR_COLOURS,
  COVER_HUES,
  COVER_LOOKS,
  HAIR_COLOURS,
  SKIN_COLOURS,
  avatarColourHex,
  avatarTextHex,
  colourHex,
  coverColourHex,
  isAvatarColour,
} from '../palette'
import { isSmallPictureName, smallPictureName } from '../files'

const HEX = /^[0-9a-f]{6}$/

describe('the palette', () => {
  it('has 36 avatar colours, 18 hues as a soft tint and a mid tone, all distinct', () => {
    expect(AVATAR_COLOURS).toHaveLength(36)
    expect(AVATAR_COLOURS.filter((c) => c.endsWith('-soft'))).toHaveLength(18)
    const hexes = AVATAR_COLOURS.map(avatarColourHex)
    expect(hexes.every((h) => HEX.test(h))).toBe(true)
    expect(new Set(hexes).size).toBe(36)
    expect(AVATAR_COLOURS.every((c) => HEX.test(avatarTextHex(c)))).toBe(true)
  })

  it('refuses a name not in it', () => {
    expect(isAvatarColour('lavender')).toBe(true)
    expect(isAvatarColour('lavender-soft')).toBe(true)
    for (const bad of ['ff0000', '#ff0000', 'lavender-mid', '-soft', 'constructor', 'toString', 1, null]) {
      expect(isAvatarColour(bad)).toBe(false)
    }
    expect(() => avatarColourHex('ff0000')).toThrow()
    expect(() => colourHex('hair', 'constructor')).toThrow()
  })

  it('has hair and skin colours', () => {
    expect([...HAIR_COLOURS, ...SKIN_COLOURS].every((c) => HEX.test(colourHex(HAIR_COLOURS.includes(c) ? 'hair' : 'skin', c)))).toBe(true)
  })

  it('has 18 cover hues in three looks, each a first and second colour', () => {
    expect(COVER_HUES).toHaveLength(18)
    expect(COVER_LOOKS).toEqual(['soft', 'vivid', 'deep'])
    for (const look of COVER_LOOKS) for (const hue of COVER_HUES) for (const slot of [0, 1] as const) {
      expect(coverColourHex(hue, look, slot)).toMatch(HEX)
    }
    expect(coverColourHex('red', 'vivid', 0)).toBe('ea5353')
  })
})

describe('picture file names', () => {
  it('puts the small copy beside the full picture', () => {
    expect(smallPictureName('0b5e-4c.webp')).toBe('0b5e-4c-small.webp')
    expect(isSmallPictureName('0b5e-4c-small.webp')).toBe(true)
    expect(isSmallPictureName('0b5e-4c.webp')).toBe(false)
    expect(() => smallPictureName('a-small.webp')).toThrow()
    expect(() => smallPictureName('../a.webp')).toThrow()
    expect(() => smallPictureName('a.png')).toThrow()
  })
})
