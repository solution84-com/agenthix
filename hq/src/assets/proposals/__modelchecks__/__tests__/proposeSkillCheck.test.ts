import { describe, it, expect } from 'vitest'
import { grade, writesInShell } from '../proposeSkillCheck'
import { runSkillsCheck } from '../skillsRun'
import { scripted, access } from './skillsFake'

const SKILL = { 'SKILL.md': '---\nname: pr-review\ndescription: Review a pull request.\n---\n\n1. Read it.\n' }
const propose = (files: Record<string, string> = SKILL) =>
  [{ name: 'propose_skill', input: { name: 'pr-review', description: 'x', files, why: 'asked', aim: 'project' } }]
const run = (rounds: Parameters<typeof scripted>[0]) => runSkillsCheck(scripted(rounds), access, 'ask')

describe('the propose_skill model check @SC-1662', () => {
  it('passes a run that loads the skill and proposes with a SKILL.md', async () => {
    expect(grade(await run([[{ name: 'skill', input: { name: 'platform-skill-creator' } }], propose(), []]))).toEqual({ passed: true })
  })

  it('fails a run that writes the skill into files, even if it proposes too', async () => {
    const wrote = await run([
      [{ name: 'write_file', input: { file_path: '/projects/website-rebuild/files/.agents/skills/pr-review/SKILL.md', content: 'x' } }],
      propose(), [],
    ])
    expect(grade(wrote)).toMatchObject({ passed: false, why: expect.stringContaining("wrote a skill's files") })
  })

  it('fails a run that never proposes, or proposes without a SKILL.md', async () => {
    expect(grade(await run([[]]))).toMatchObject({ passed: false, why: expect.stringContaining('never called') })
    expect(grade(await run([propose({ 'README.md': 'x' }), []]))).toMatchObject({ passed: false, why: expect.stringContaining('without a SKILL.md') })
  })

  it('counts a redirect, tee or here-document as writing, and a read with its errors hidden as reading', () => {
    expect(writesInShell('cat /run/staging/skills/x/SKILL.md 2>/dev/null; echo')).toBe(false)
    expect(writesInShell('find . -maxdepth 4 -name SKILL.md 2>&1 | head')).toBe(false)
    expect(writesInShell('ls skills > /dev/null')).toBe(false)
    expect(writesInShell('echo "# Review" > skills/review/SKILL.md')).toBe(true)
    expect(writesInShell('echo more >> skills/review/SKILL.md')).toBe(true)
    expect(writesInShell('tee skills/review/SKILL.md')).toBe(true)
    expect(writesInShell("cat <<'EOF' > skills/review/SKILL.md")).toBe(true)
  })
})
