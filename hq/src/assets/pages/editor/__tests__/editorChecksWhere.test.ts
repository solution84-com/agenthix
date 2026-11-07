import { describe, it, expect } from 'vitest'
import { bytesOfText, type EditorFile } from '../editorFiles'
import { checkSkill, checksLine, problemsWhere } from '../editorChecks'

const f = (path: string, text: string): EditorFile => ({ path, bytes: bytesOfText(text) })
const SKILL = '---\nname: notes\ndescription: Does notes.\n---\n# notes\n\nFormat the list with the script:\nRun scripts/format.pyx on the notes.\n'

describe('a problem is said where it is (board *The editor*, 3) @SC-1626', () => {
  it('puts a missing file at the line of SKILL.md that names it', () => {
    const checks = checkSkill('notes', [f('SKILL.md', SKILL), f('scripts/format.py', 'x')])
    const problem = checks.find(c => c.level === 'error')!
    expect(problem).toMatchObject({ path: 'SKILL.md', line: 8 })
    expect(problemsWhere(checks)).toBe('1 problem in SKILL.md, line 8')
  })

  it('puts an empty description at its field', () => {
    const checks = checkSkill('notes', [f('SKILL.md', '---\nname: notes\ndescription: ""\n---\nbody\n')])
    expect(checks.find(c => c.level === 'error')).toMatchObject({ field: 'description', line: 3 })
  })

  it('says the checks in one line', () => {
    expect(checksLine(checkSkill('notes', [f('SKILL.md', SKILL), f('scripts/format.py', 'x')]))).toBe('✕ 1 problem · ✓ 1 check passes')
    expect(checksLine([{ level: 'ok', text: 'a' }, { level: 'ok', text: 'b' }])).toBe('✓ 2 checks pass')
  })

  it('names the first of several problems', () => {
    expect(problemsWhere([{ level: 'error', text: 'a', path: 'SKILL.md', line: 4 }, { level: 'error', text: 'b' }])).toBe('2 problems, the first in SKILL.md, line 4')
  })
})
