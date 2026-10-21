import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The prompt section registry exists three times — site builds the sections, hq
 * relays them, ui edits them. A key or file name that differs between copies
 * makes a section silently uneditable, so the three must stay identical below
 * their header comment.
 */
const body = (file: string) => readFileSync(file, 'utf8').replace(/^\/\*\*[\s\S]*?\*\/\n/, '')

describe('prompt section registry copies', () => {
  it('hq, site and ui declare the same keys and editable files', () => {
    const hq = body(join(__dirname, '../promptSections.ts'))
    expect(body(join(__dirname, '../../../../site/src/shared/promptSections.ts'))).toBe(hq)
    expect(body(join(__dirname, '../../../../ui/src/agents/promptSections.ts'))).toBe(hq)
    expect(hq).toContain("INSTRUCTIONS:     'instructions'")
    expect(hq).not.toMatch(/PROFILE|RESPONSIBILITIES/)
  })
})
