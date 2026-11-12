/**
 * The picture module's entry points for the rest of hq: validate a recipe, draw it, and make a random or default one.
 * Client-safe: the picker's preview and the server use the same code. Every recipe is untrusted until `validateRecipe`
 * has passed it, and nothing draws a recipe that has not been through it.
 */
import { seededRng } from './random'
import {
  PictureRecipeError,
  RECIPE_FORMAT_VERSION,
  parseRecipeShell,
  type PictureContext,
  type PictureKind,
  type PictureRecipe,
} from './recipe'
import { findStyle, stylesFor } from './styles'
import { KERNEL_ROBOT, hasRobots } from './styles/robots'
import type { PictureDrawing, PictureStyle } from './styles/types'

export type RecipeCheck = { ok: true; recipe: PictureRecipe } | { ok: false; reason: string }

/**
 * Checks a recipe against the registry for this subject and kind of picture, and returns it normalised. Fails closed:
 * an unknown style, field, part, colour or robot, a style this subject may not use, or an oversized recipe is refused.
 */
export async function validateRecipe(raw: unknown, kind: PictureKind, ctx: PictureContext): Promise<RecipeCheck> {
  try {
    return { ok: true, recipe: await checkedRecipe(raw, kind, ctx) }
  } catch (e) {
    if (e instanceof PictureRecipeError) return { ok: false, reason: e.reason }
    throw e
  }
}

async function checkedRecipe(raw: unknown, kind: PictureKind, ctx: PictureContext): Promise<PictureRecipe> {
  const shell = parseRecipeShell(raw)
  if (shell.kind !== kind) throw new PictureRecipeError(`not a ${kind} recipe`)
  const style = findStyle(shell.style)
  if (!style || style.kind !== kind) throw new PictureRecipeError('unknown style')
  if (!stylesFor(kind, ctx).includes(style)) throw new PictureRecipeError('style not offered to this subject')
  if (shell.styleVersion !== style.version) throw new PictureRecipeError('unknown style version')
  const choices = await style.validate(shell.choices, ctx)
  return { v: RECIPE_FORMAT_VERSION, kind, style: style.id, styleVersion: style.version, choices }
}

/** Draws a recipe, validating it first; throws PictureRecipeError on one `validateRecipe` would refuse. */
export async function drawRecipe(raw: unknown, kind: PictureKind, ctx: PictureContext): Promise<PictureDrawing> {
  const recipe = await checkedRecipe(raw, kind, ctx)
  return (findStyle(recipe.style) as PictureStyle).draw(recipe.choices, ctx)
}

/** A random recipe in a given style; the same seed always gives the same recipe. */
export async function randomRecipe(
  styleId: string,
  seed: string | number,
  ctx: PictureContext,
): Promise<PictureRecipe> {
  const style = findStyle(styleId)
  if (!style || !style.offeredTo.includes(ctx.subject.kind) || !style.available(ctx)) {
    throw new PictureRecipeError(`style ${styleId} is not offered here`)
  }
  const choices = await style.random(seededRng(seed), ctx)
  return { v: RECIPE_FORMAT_VERSION, kind: style.kind, style: style.id, styleVersion: style.version, choices }
}

/** Kernel's look where the robots are missing: one fixed Thumbs character, the same on every hq. */
export const KERNEL_FALLBACK_RECIPE: PictureRecipe = Object.freeze({
  v: 1,
  kind: 'avatar',
  style: 'thumbs',
  styleVersion: 1,
  choices: Object.freeze({
    parts: Object.freeze({ eyes: 'variant5W12', face: 'variant3', mouth: 'variant2' }),
    numbers: Object.freeze({
      faceOffsetX: 0, faceOffsetY: 0, faceRotation: 0, shapeOffsetX: 0, shapeOffsetY: 0, shapeRotation: 0,
    }),
    shapeColor: 'indigo',
    background: 'lavender-soft',
    background2: null,
    flip: false,
    seed: 1,
  }),
}) as PictureRecipe

/**
 * The avatar a subject gets when it is made, or null for a person (they keep their initials until they choose):
 * an agent a random robot (a Thumbs character where the robots are missing), Kernel its own robot (or its fixed
 * Thumbs look), a team Initials in a random colour, the organisation a random symbol from the Icons style.
 */
export async function defaultAvatarRecipe(ctx: PictureContext, seed: string | number): Promise<PictureRecipe | null> {
  switch (ctx.subject.kind) {
    case 'person':
      return null
    case 'team':
      return randomRecipe('initials', seed, ctx)
    case 'org':
      return randomRecipe('icons', seed, ctx)
    case 'agent':
      if (ctx.subject.isKernel) {
        if (!hasRobots(ctx) || !(ctx.robots ?? []).includes(KERNEL_ROBOT)) return KERNEL_FALLBACK_RECIPE
        const robot = await randomRecipe('robots', seed, ctx)
        return { ...robot, choices: { ...robot.choices, robot: KERNEL_ROBOT } }
      }
      return randomRecipe(hasRobots(ctx) ? 'robots' : 'thumbs', seed, ctx)
  }
}
