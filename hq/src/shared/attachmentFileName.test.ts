import { describe, it, expect } from 'vitest'
import { attachmentFileNameProblem } from './attachmentFileName'

describe('attachmentFileNameProblem', () => {
  it.each(['notes.md', 'notes v2.md', 'résumé.pdf', '.env', 'a..b.txt', 'x'.repeat(255)])(
    'accepts %j',
    (name) => {
      expect(attachmentFileNameProblem(name)).toBeNull()
    },
  )

  it.each(['', '.', '..', '../escape.md', 'a/b.md', 'a\\b.md', 'nul\u0000.md', 'tab\t.md', 'del\u007f.md', 'é'.repeat(128)])(
    'refuses %j',
    (name) => {
      expect(attachmentFileNameProblem(name)).toEqual(expect.any(String))
    },
  )
})
