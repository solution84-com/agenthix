import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { screenshotNameOf } from '../../../e2e/guide/recipeName'

const dir = join(__dirname, '../../../e2e/guide')
const consoleRecipes = readdirSync(dir).filter((file) => /^console-.+\.recipe\.ts$/.test(file))

describe('the Fleet Console recipes @SC-1104', () => {
  it('exist', () => {
    expect(consoleRecipes.length).toBeGreaterThan(0)
  })

  it.each(consoleRecipes)('%s opens its screen through captureConsole and names itself after its file', (file) => {
    const source = readFileSync(join(dir, file), 'utf8')
    const name = screenshotNameOf(file)
    expect(name).toMatch(/^console-/)
    expect(source).toContain("from './consoleCapture'")
    expect(source).toContain(`test('${name}'`)
    expect(source).toContain(`screenshot:${name}`)
    // Never hq's own capture: that signs in to hq, which the Fleet Console's recipes do not need running.
    expect(source).not.toContain("from './capture'")
  })
})
