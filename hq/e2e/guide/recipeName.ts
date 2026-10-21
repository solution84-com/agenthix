/**
 * A recipe's screenshot name is its file name: `project-board.recipe.ts` saves `project-board`, which is the
 * `screenshot:project-board` a guide page uses. A fresh recipe (`fresh-setup-organisation.recipe.ts`) runs
 * before any organisation exists; its screenshot name drops the prefix, so it is `setup-organisation`.
 */

const RECIPE_FILE = /(?:^|[\\/])((?:fresh-)?[a-z0-9]+(?:-[a-z0-9]+)*)\.recipe\.ts$/

/** The screenshot name a recipe file saves, or null when the file is not a recipe or its name is not lowercase words joined by hyphens. */
export function screenshotNameOf(file: string): string | null {
  const match = RECIPE_FILE.exec(file)
  if (!match) return null
  const name = match[1].replace(/^fresh-/, '')
  return name.length > 0 ? name : null
}

/** Whether a recipe needs hq with no organisation yet. */
export function isFreshRecipe(file: string): boolean {
  return /(?:^|[\\/])fresh-[^\\/]+\.recipe\.ts$/.test(file)
}
