import { describe, expect, it } from 'vitest'
import { PLAIN_TEXT_LINE, asPlainText, buildMemoryContent, openCodeSkillsSection, pickedSkillInstruction, pickedSkillReadInstruction } from '../skillsInstructions.js'

describe('the words a run is told about skills', () => {
  it('has the memory section end with the knowledge and skills guidance, naming the pinned file when there is one', () => {
    expect(buildMemoryContent()).toMatch(/## Knowledge[\s\S]*## Skills/)
    expect(buildMemoryContent('/p/pinned.md')).toContain('`/p/pinned.md`')
  })

  it('tells a picked skill by its name, to load or to read', () => {
    expect(pickedSkillInstruction('org-x')).toContain('Load it with your skill tool first')
    const read = pickedSkillReadInstruction('org-x', '/s/org-x/SKILL.md')
    expect(read).toContain('Read the file /s/org-x/SKILL.md first')
    expect(read).toContain('Do not load this skill with your skill tool.')
  })

  it('marks a message that starts with / as plain text', () => {
    expect(asPlainText('/x now')).toBe(`${PLAIN_TEXT_LINE}\n\n/x now`)
    expect(asPlainText('hello')).toBe('hello')
  })

  it('lists the described skills in OpenCode\'s format, escaped', () => {
    const section = openCodeSkillsSection([{ name: 'a', description: 'x < y', location: '/s/a/SKILL.md' }, { name: 'b', description: undefined, location: '/s/b' }])
    expect(section).toContain('<description>x &lt; y</description>')
    expect(section).not.toContain('<name>b</name>')
  })
})
