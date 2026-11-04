import { describe, it, expect } from 'vitest'
import { PackageContentError, validateFiles } from '../packageStore'

const f = (path: string) => ({ path, content: Buffer.from('x') })

describe('the files any stored package passes at write (agent, org and platform too)', () => {
  it('accepts a plain list', () => {
    expect(() => validateFiles([f('instructions.md'), f('skills/review/SKILL.md')])).not.toThrow()
  })

  it('refuses two names one disk would store as one', () => {
    expect(() => validateFiles([f('Notes.md'), f('notes.md')])).toThrow(PackageContentError)
    expect(() => validateFiles([f('docs/a.md'), f('Docs/b.md')])).toThrow(PackageContentError)
  })

  it('refuses two spellings of one name under normalisation', () => {
    expect(() => validateFiles([f('café.md'), f('café.md')])).toThrow(PackageContentError)
  })
})
