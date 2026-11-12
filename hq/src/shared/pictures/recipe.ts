/**
 * A generated picture's recipe (ADR-0187): hq's outer fields and the style's own `choices`. A stored format under
 * docs/architecture/versioning.md — `v` moves if the outer shape ever changes; a style's `styleVersion` moves when its
 * choices do. hq stores and passes `choices` without looking inside; only the style reads them.
 */

export type PictureKind = 'avatar' | 'cover'

/** Who a picture belongs to: decides which styles are offered, and Initials' letters. */
export type SubjectKind = 'agent' | 'person' | 'team' | 'org'

export interface PictureSubject {
  kind: SubjectKind
  /** The subject's current name; Initials draw from it, so a re-draw after a rename shows the new letters. */
  name: string
  /** Kernel, the built-in agent: the only subject offered the `kernel` robot. */
  isKernel?: boolean
}

export interface PictureContext {
  subject: PictureSubject
  /**
   * The names in the robots bundle's manifest, read at run time; null (or empty) where the robots are missing, which
   * hides the Robots category everywhere.
   */
  robots: readonly string[] | null
}

export interface PictureRecipe {
  v: 1
  kind: PictureKind
  style: string
  styleVersion: number
  choices: Record<string, unknown>
}

export const RECIPE_FORMAT_VERSION = 1

/** The most a recipe may take as JSON. The largest real one (a face with every part named) is under 1 KB. */
export const MAX_RECIPE_JSON_BYTES = 2048

/** Why a recipe was refused; `reason` is for logs and tests, not for a screen. */
export class PictureRecipeError extends Error {
  constructor(readonly reason: string) {
    super(`Picture recipe refused: ${reason}`)
    this.name = 'PictureRecipeError'
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

/** Refuses any key of `obj` outside `allowed`. */
export function onlyKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new PictureRecipeError(`unknown field ${where}.${key}`)
  }
}

function jsonBytes(value: unknown): number {
  let text: string | undefined
  try {
    text = JSON.stringify(value)
  } catch {
    throw new PictureRecipeError('not JSON')
  }
  if (text === undefined) throw new PictureRecipeError('not JSON')
  return new TextEncoder().encode(text).length
}

/** Checks the outer fields and the size; the style checks `choices`. */
export function parseRecipeShell(raw: unknown): PictureRecipe {
  if (jsonBytes(raw) > MAX_RECIPE_JSON_BYTES) throw new PictureRecipeError('too large')
  if (!isPlainObject(raw)) throw new PictureRecipeError('not an object')
  onlyKeys(raw, ['v', 'kind', 'style', 'styleVersion', 'choices'], 'recipe')
  if (raw.v !== RECIPE_FORMAT_VERSION) throw new PictureRecipeError('unknown format version')
  if (raw.kind !== 'avatar' && raw.kind !== 'cover') throw new PictureRecipeError('unknown kind')
  if (typeof raw.style !== 'string') throw new PictureRecipeError('no style')
  if (!Number.isInteger(raw.styleVersion)) throw new PictureRecipeError('no style version')
  if (!isPlainObject(raw.choices)) throw new PictureRecipeError('no choices')
  return { v: 1, kind: raw.kind, style: raw.style, styleVersion: raw.styleVersion as number, choices: raw.choices }
}
