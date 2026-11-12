/**
 * A DiceBear style as a registry entry. Its parts, and which parts may be left out, come from the package's own option
 * schema, so validation follows exactly what the pinned version can draw. The style's code is loaded only when the
 * style is first used, so the picker's bundle carries a style only once someone opens it.
 *
 * Choices: `parts` (every part named, or null where the style allows it to be left out), `numbers` (every offset and
 * rotation the style places a part by), the style's colour choices from the palette, the background, Mirror, and a
 * `seed` for what the recipe does not name (the style's own secondary colours).
 */
import { colourHex, colourSet, isColourIn, type ColourSet } from '../palette'
import { PictureRecipeError, isPlainObject, onlyKeys, type SubjectKind } from '../recipe'
import { intBetween, pickOne } from '../random'
import { BACKGROUND_KEYS, dicebearBackground, randomBackground, readBackground, readFlip } from './background'
import type { PictureStyle, StyleCategory } from './types'

interface SchemaProperty {
  type?: string
  default?: unknown
  minimum?: number
  maximum?: number
  items?: { type?: string; enum?: readonly string[] }
}

export interface DicebearModule {
  create: unknown
  schema: { properties?: Record<string, unknown> }
}

export interface DicebearStyleSpec {
  id: string
  label: string
  category: Extract<StyleCategory, 'faces' | 'symbols'>
  offeredTo: readonly SubjectKind[]
  load: () => Promise<DicebearModule>
  /** The style's colour options a recipe chooses, and the palette set each is chosen from. */
  colours?: Readonly<Record<string, ColourSet>>
  /** Whether Mirror applies (a symbol may not want it). */
  mirror?: boolean
  /** A random background keeps to the mid tones: the style draws in white. */
  midBackground?: boolean
}

interface Shape {
  parts: Record<string, { values: readonly string[]; optional: boolean; probability: number }>
  numbers: Record<string, { min: number; max: number }>
}

export const MAX_SEED = 0xffffffff
const NUMBER_OPTION = /(Offset[XY]|Rotation)$/

/** The style's choosable parts and numbers, read from its schema. */
export function shapeOf(mod: DicebearModule): Shape {
  const props = (mod.schema.properties ?? {}) as Record<string, SchemaProperty>
  const shape: Shape = { parts: {}, numbers: {} }
  for (const [key, prop] of Object.entries(props)) {
    const values = prop.items?.enum
    if (values && !key.endsWith('Color')) {
      const optional = Object.hasOwn(props, `${key}Probability`)
      if (values.length > 1 || optional) {
        const p = props[`${key}Probability`]?.default
        shape.parts[key] = { values, optional, probability: typeof p === 'number' ? p : 100 }
      }
    } else if (NUMBER_OPTION.test(key) && Array.isArray(prop.default) && prop.default.length === 2) {
      const [a, b] = prop.default as unknown[]
      if (typeof a === 'number' && typeof b === 'number') {
        shape.numbers[key] = { min: Math.min(a, b), max: Math.max(a, b) }
      }
    }
  }
  return shape
}

function readSeed(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_SEED) {
    throw new PictureRecipeError('seed is not a whole number in range')
  }
  return value as number
}

export function dicebearStyle(spec: DicebearStyleSpec): PictureStyle {
  let loaded: Promise<{ mod: DicebearModule; shape: Shape }> | null = null
  const load = () => {
    loaded ??= spec.load().then((mod) => {
      const props = mod.schema.properties ?? {}
      for (const key of Object.keys(spec.colours ?? {})) {
        if (!Object.hasOwn(props, key)) throw new Error(`${spec.id} has no colour option ${key}`)
      }
      return { mod, shape: shapeOf(mod) }
    })
    return loaded
  }
  const colourKeys = Object.keys(spec.colours ?? {})
  const mirror = spec.mirror ?? true
  const allowed = ['parts', 'numbers', 'seed', ...BACKGROUND_KEYS, ...(mirror ? ['flip'] : []), ...colourKeys]

  async function validate(choices: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { shape } = await load()
    onlyKeys(choices, allowed, 'choices')

    if (!isPlainObject(choices.parts)) throw new PictureRecipeError('no parts')
    onlyKeys(choices.parts, Object.keys(shape.parts), 'parts')
    const parts: Record<string, string | null> = {}
    for (const [name, part] of Object.entries(shape.parts)) {
      const value = choices.parts[name]
      if (value === null && part.optional) parts[name] = null
      else if (typeof value === 'string' && part.values.includes(value)) parts[name] = value
      else throw new PictureRecipeError(`part ${name} is not one of the style's`)
    }

    const rawNumbers = choices.numbers ?? {}
    if (!isPlainObject(rawNumbers)) throw new PictureRecipeError('numbers is not an object')
    onlyKeys(rawNumbers, Object.keys(shape.numbers), 'numbers')
    const numbers: Record<string, number> = {}
    for (const [name, range] of Object.entries(shape.numbers)) {
      const value = rawNumbers[name]
      if (!Number.isInteger(value) || (value as number) < range.min || (value as number) > range.max) {
        throw new PictureRecipeError(`number ${name} is out of range`)
      }
      numbers[name] = value as number
    }

    const colours: Record<string, string> = {}
    for (const [key, set] of Object.entries(spec.colours ?? {})) {
      if (!isColourIn(set, choices[key])) throw new PictureRecipeError(`${key} is not a palette colour`)
      colours[key] = choices[key] as string
    }

    return {
      parts,
      ...(Object.keys(numbers).length > 0 ? { numbers } : {}),
      ...colours,
      ...readBackground(choices),
      ...(mirror ? { flip: readFlip(choices) } : {}),
      seed: readSeed(choices.seed),
    }
  }

  return {
    id: spec.id,
    kind: 'avatar',
    category: spec.category,
    label: spec.label,
    version: 1,
    offeredTo: spec.offeredTo,
    followsName: false,
    available: () => true,
    validate,

    async draw(raw) {
      const choices = await validate(raw)
      const { mod, shape } = await load()
      const options: Record<string, unknown> = {
        seed: String(choices.seed),
        flip: choices.flip === true,
        ...dicebearBackground(readBackground(choices)),
      }
      for (const [name, value] of Object.entries(choices.parts as Record<string, string | null>)) {
        if (value === null) {
          options[`${name}Probability`] = 0
        } else {
          options[name] = [value]
          if (shape.parts[name].optional) options[`${name}Probability`] = 100
        }
      }
      for (const [name, value] of Object.entries((choices.numbers ?? {}) as Record<string, number>)) {
        options[name] = [value]
      }
      for (const [key, set] of Object.entries(spec.colours ?? {})) {
        options[key] = [colourHex(set, choices[key] as string)]
      }
      const { createAvatar } = await import('@dicebear/core')
      // DiceBear types each style's options separately; a registry entry is generic over them, and the options
      // were built above from that style's own schema.
      const style = mod as unknown as Parameters<typeof createAvatar>[0]
      return { type: 'svg', svg: createAvatar(style, options).toString() }
    },

    async describe() {
      const { shape } = await load()
      return {
        parts: Object.entries(shape.parts).map(([key, part]) => ({ key, values: part.values, optional: part.optional })),
        colours: Object.entries(spec.colours ?? {}).map(([key, set]) => ({ key, set })),
        background: true,
        mirror,
      }
    },

    async random(rng) {
      const { shape } = await load()
      const parts: Record<string, string | null> = {}
      for (const [name, part] of Object.entries(shape.parts)) {
        parts[name] = part.optional && rng() * 100 >= part.probability ? null : pickOne(rng, part.values)
      }
      const numbers: Record<string, number> = {}
      for (const [name, range] of Object.entries(shape.numbers)) numbers[name] = intBetween(rng, range.min, range.max)
      const colours: Record<string, string> = {}
      for (const [key, set] of Object.entries(spec.colours ?? {})) colours[key] = pickOne(rng, colourSet(set))
      return {
        parts,
        ...(Object.keys(numbers).length > 0 ? { numbers } : {}),
        ...colours,
        ...randomBackground(rng, spec.midBackground),
        ...(mirror ? { flip: false } : {}),
        seed: intBetween(rng, 0, MAX_SEED),
      }
    },
  }
}
