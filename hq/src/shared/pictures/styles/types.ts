import type { PictureContext, PictureKind, SubjectKind } from '../recipe'
import type { Rng } from '../random'
import type { ColourSet } from '../palette'

export type StyleCategory = 'robots' | 'faces' | 'symbols' | 'initials' | 'cover'

/** A background: one colour or a gradient of two, as hex values resolved from the palette. */
export interface PictureFill {
  colours: readonly [string] | readonly [string, string]
}

/**
 * What a style draws. An SVG string is rasterised to WebP on the server (never stored or served as SVG); a picture
 * from a set is placed on its background by the server, and by the picker from its own copy.
 */
export type PictureDrawing =
  | { type: 'svg'; svg: string }
  | { type: 'picture'; set: 'robots'; name: string; background: PictureFill; flip: boolean }

/**
 * What the picker's fine-tuning offers for a style: its parts (each one of `values`, or left out where `optional`),
 * its colour choices and the palette set each is chosen from, and whether it takes a background and Mirror. A style
 * drawn from a set of pictures (the robots) has no parts; its pictures are its choice.
 */
export interface StyleControls {
  parts: readonly { key: string; values: readonly string[]; optional: boolean }[]
  colours: readonly { key: string; set: ColourSet }[]
  background: boolean
  mirror: boolean
}

/**
 * One style: the only place its id, its choices and how it draws are known. Choices are validated before anything
 * draws them; `validate` fails closed, throwing PictureRecipeError on anything it does not know.
 */
export interface PictureStyle {
  id: string
  kind: PictureKind
  category: StyleCategory
  /** The name the picker shows. */
  label: string
  /** The version of this style's `choices`; a recipe of another version is refused (or, later, mapped). */
  version: number
  offeredTo: readonly SubjectKind[]
  /** Whether a re-draw after the subject's rename changes the picture (Initials). */
  followsName: boolean
  /** Whether the style can be used here at all (the robots, only with a manifest). */
  available(ctx: PictureContext): boolean
  /** The choices, checked and normalised; throws PictureRecipeError. */
  validate(choices: Record<string, unknown>, ctx: PictureContext): Promise<Record<string, unknown>>
  draw(choices: Record<string, unknown>, ctx: PictureContext): Promise<PictureDrawing>
  /** What the picker shows to fine-tune it. */
  describe(ctx: PictureContext): Promise<StyleControls>
  /** A complete random set of choices, which `validate` accepts. */
  random(rng: Rng, ctx: PictureContext): Promise<Record<string, unknown>>
}
