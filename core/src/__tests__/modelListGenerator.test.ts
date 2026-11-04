import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const importLine = (text: string) => text.split('\n').find(l => l.startsWith('import type'))

describe('the model-list generator', () => {
  it('writes the import the committed generated file has, with the extension NodeNext needs', () => {
    const generated = importLine(read('../models/openCodeModels.generated.ts'))
    const template = importLine(read('../../scripts/generate-model-list.mjs'))
    expect(generated).toContain("from './modelList.js'")
    expect(template).toBe(generated)
  })
})
