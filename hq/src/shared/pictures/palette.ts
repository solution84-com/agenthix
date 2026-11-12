/**
 * The one place a generated picture's colours are defined (ADR-0187): a recipe names a colour from here, never a hex
 * value, and no other file holds one. Runs in the browser's preview and on the server alike.
 */

/** The eighteen hues of an avatar's colours, in the order the picker shows them. */
export const AVATAR_HUES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'mint', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'lavender', 'purple', 'orchid', 'pink', 'rose', 'stone',
] as const
export type AvatarHue = (typeof AVATAR_HUES)[number]

// Each hue as a soft tint, a mid tone, and the deep tone Initials' letters are drawn in on either.
const AVATAR_TONES: Record<AvatarHue, { soft: string; mid: string; deep: string }> = {
  red: { soft: 'fee2e2', mid: 'fca5a5', deep: '991b1b' },
  orange: { soft: 'ffedd5', mid: 'fdba74', deep: '9a3412' },
  amber: { soft: 'fef3c7', mid: 'fcd34d', deep: '92400e' },
  yellow: { soft: 'fef9c3', mid: 'fde047', deep: '854d0e' },
  lime: { soft: 'ecfccb', mid: 'bef264', deep: '3f6212' },
  green: { soft: 'dcfce7', mid: '86efac', deep: '166534' },
  mint: { soft: 'd1fae5', mid: '6ee7b7', deep: '065f46' },
  teal: { soft: 'ccfbf1', mid: '5eead4', deep: '115e59' },
  cyan: { soft: 'cffafe', mid: '67e8f9', deep: '155e75' },
  sky: { soft: 'e0f2fe', mid: '7dd3fc', deep: '075985' },
  blue: { soft: 'dbeafe', mid: '93c5fd', deep: '1e40af' },
  indigo: { soft: 'e0e7ff', mid: 'a5b4fc', deep: '3730a3' },
  lavender: { soft: 'ede9fe', mid: 'c4b5fd', deep: '5b21b6' },
  purple: { soft: 'f3e8ff', mid: 'd8b4fe', deep: '6b21a8' },
  orchid: { soft: 'fae8ff', mid: 'f0abfc', deep: '86198f' },
  pink: { soft: 'fce7f3', mid: 'f9a8d4', deep: '9d174d' },
  rose: { soft: 'ffe4e6', mid: 'fda4af', deep: '9f1239' },
  stone: { soft: 'f5f5f4', mid: 'd6d3d1', deep: '292524' },
}

/**
 * The 36 avatar colours: `<hue>-soft` for the tint, `<hue>` for the mid tone. Tints first, as on the picker.
 */
export const AVATAR_COLOURS: readonly string[] = [
  ...AVATAR_HUES.map((h) => `${h}-soft`),
  ...AVATAR_HUES,
]

function avatarTone(name: string): { hue: AvatarHue; tone: 'soft' | 'mid' } | null {
  const soft = name.endsWith('-soft')
  const hue = (soft ? name.slice(0, -'-soft'.length) : name) as AvatarHue
  return (AVATAR_HUES as readonly string[]).includes(hue) ? { hue, tone: soft ? 'soft' : 'mid' } : null
}

export function isAvatarColour(name: unknown): name is string {
  return typeof name === 'string' && avatarTone(name) !== null
}

/** The hex value (six digits, no `#`) of an avatar colour; throws on a name not in the palette. */
export function avatarColourHex(name: string): string {
  const t = avatarTone(name)
  if (!t) throw new Error(`Not an avatar colour: ${name}`)
  return AVATAR_TONES[t.hue][t.tone]
}

/** The colour letters are drawn in on an avatar colour: its hue's deep tone, readable on either tone. */
export function avatarTextHex(name: string): string {
  const t = avatarTone(name)
  if (!t) throw new Error(`Not an avatar colour: ${name}`)
  return AVATAR_TONES[t.hue].deep
}

/** Hair colours, for the face styles that have one. */
const HAIR: Record<string, string> = {
  black: '0e0e0e',
  'dark-brown': '3a2a1d',
  brown: '6b4423',
  auburn: 'a0522d',
  sandy: 'c8a165',
  blonde: 'e2c799',
  grey: '8b8b8b',
  red: 'b4534b',
}
export const HAIR_COLOURS: readonly string[] = Object.keys(HAIR)

/** Skin tones, for the face styles that have one. */
const SKIN: Record<string, string> = {
  porcelain: 'f9e0c7',
  fair: 'f2c9a0',
  peach: 'ffdbb4',
  medium: 'd9a066',
  tan: 'a8754f',
  deep: '6b4423',
}
export const SKIN_COLOURS: readonly string[] = Object.keys(SKIN)

/** Which named set a colour choice is drawn from. */
export type ColourSet = 'avatar' | 'hair' | 'skin'

export function colourSet(set: ColourSet): readonly string[] {
  return set === 'avatar' ? AVATAR_COLOURS : set === 'hair' ? HAIR_COLOURS : SKIN_COLOURS
}

export function isColourIn(set: ColourSet, name: unknown): name is string {
  return typeof name === 'string' && colourSet(set).includes(name)
}

/** The hex value of a colour from any set; throws on a name not in that set. */
export function colourHex(set: ColourSet, name: string): string {
  if (set === 'avatar') return avatarColourHex(name)
  const table = set === 'hair' ? HAIR : SKIN
  if (!Object.hasOwn(table, name)) throw new Error(`Not a ${set} colour: ${name}`)
  return table[name]
}

/** The eighteen hues of a cover, by their angle on the colour wheel. */
const COVER_HUE_ANGLES = {
  red: 0, coral: 15, orange: 30, amber: 45, yellow: 60, lime: 90, green: 140, mint: 165, teal: 180,
  cyan: 195, sky: 210, blue: 225, indigo: 245, violet: 265, purple: 285, magenta: 310, pink: 330, rose: 345,
} as const
export type CoverHue = keyof typeof COVER_HUE_ANGLES
export const COVER_HUES = Object.keys(COVER_HUE_ANGLES) as readonly CoverHue[]

export const COVER_LOOKS = ['soft', 'vivid', 'deep'] as const
export type CoverLook = (typeof COVER_LOOKS)[number]

// Saturation and lightness (percent) of a cover's first and second colour in each look.
const COVER_LOOK_TONES: Record<CoverLook, readonly [readonly [number, number], readonly [number, number]]> = {
  soft: [[70, 80], [65, 72]],
  vivid: [[78, 62], [70, 52]],
  deep: [[60, 38], [65, 26]],
}

export function isCoverHue(name: unknown): name is CoverHue {
  return typeof name === 'string' && Object.hasOwn(COVER_HUE_ANGLES, name)
}

export function isCoverLook(name: unknown): name is CoverLook {
  return typeof name === 'string' && (COVER_LOOKS as readonly string[]).includes(name)
}

/** The hex value of a cover hue in a look, as the first (0) or second (1) colour of the cover. */
export function coverColourHex(hue: CoverHue, look: CoverLook, slot: 0 | 1): string {
  if (!isCoverHue(hue) || !isCoverLook(look)) throw new Error(`Not a cover colour: ${hue} ${look}`)
  const [s, l] = COVER_LOOK_TONES[look][slot]
  return hslToHex(COVER_HUE_ANGLES[hue], s / 100, l / 100)
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }
  return channel(0) + channel(8) + channel(4)
}
