import { describe, expect, it } from 'vitest'
import { isFreshRecipe, screenshotNameOf } from '../../../e2e/guide/recipeName'

describe('a recipe\'s screenshot name @SC-803', () => {
  it('is its file name without the recipe suffix', () => {
    expect(screenshotNameOf('hq/e2e/guide/project-board.recipe.ts')).toBe('project-board')
    expect(screenshotNameOf('/abs/hq/e2e/guide/home.recipe.ts')).toBe('home')
    expect(screenshotNameOf('project-board-2.recipe.ts')).toBe('project-board-2')
  })

  it('drops the fresh prefix', () => {
    expect(screenshotNameOf('e2e/guide/fresh-setup-organisation.recipe.ts')).toBe('setup-organisation')
  })

  it('is null for a file that is not a recipe or is badly named', () => {
    expect(screenshotNameOf('e2e/guide/capture.ts')).toBeNull()
    expect(screenshotNameOf('e2e/guide/Project_Board.recipe.ts')).toBeNull()
    expect(screenshotNameOf('e2e/guide/-board.recipe.ts')).toBeNull()
    expect(screenshotNameOf('e2e/guide/fresh-.recipe.ts')).toBeNull()
  })

  it('knows a fresh recipe by its prefix', () => {
    expect(isFreshRecipe('e2e/guide/fresh-setup-organisation.recipe.ts')).toBe(true)
    expect(isFreshRecipe('e2e\\guide\\fresh-x.recipe.ts')).toBe(true)
    expect(isFreshRecipe('e2e/guide/project-board.recipe.ts')).toBe(false)
    expect(isFreshRecipe('e2e/guide/freshly.recipe.ts')).toBe(false)
  })
})
