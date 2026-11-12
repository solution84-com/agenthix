import type { Prisma } from '@prisma/client'
import type { PictureRecipeView } from '@agenthix/core'

/** A stored recipe column as the views carry it: hq wrote it after validating it, so it is passed on unread. */
export function recipeView(value: Prisma.JsonValue | null | undefined): PictureRecipeView | null {
  return value === null || value === undefined ? null : (value as unknown as PictureRecipeView)
}
