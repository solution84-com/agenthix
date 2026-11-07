import { describe, expect, it } from 'vitest'
import { skillMdParts, withSkillMdBody, withSkillMdField } from '../skillMdParts'

const FILE = '---\nname: release-notes\ndescription: Write release notes.\nversion: 1.1.0\nallowed-tools: Bash\n---\n# release-notes\n\nCollect merged changes.\n'

describe("SKILL.md in its parts (board *The editor*) @SC-1626", () => {
  it('reads the name and description as two fields, and the body with the line it starts on', () => {
    const parts = skillMdParts(FILE)
    expect(parts.fields).toEqual({ name: 'release-notes', description: 'Write release notes.' })
    expect(parts.bodyLine).toBe(7)
    expect(FILE.split('\n')[parts.bodyLine - 1]).toBe('# release-notes')
    expect(parts.body).toBe('# release-notes\n\nCollect merged changes.\n')
  })

  it('writes one field and keeps every other line, the version and other keys included', () => {
    const next = withSkillMdField(FILE, 'description', 'Write release notes: group them by area.')
    expect(skillMdParts(next).fields?.description).toBe('Write release notes: group them by area.')
    expect(next).toContain('version: 1.1.0')
    expect(next).toContain('allowed-tools: Bash')
    expect(next.endsWith('---\n# release-notes\n\nCollect merged changes.\n')).toBe(true)
  })

  it('writes into empty front matter', () => {
    const next = withSkillMdField('---\n---\nBody', 'name', 'notes')
    expect(skillMdParts(next).fields?.name).toBe('notes')
    expect(next.endsWith('---\nBody')).toBe(true)
  })

  it('replaces the body and leaves the front matter as written', () => {
    expect(withSkillMdBody(FILE, 'New body')).toBe(FILE.split('\n').slice(0, 6).join('\n') + '\nNew body')
  })

  it('has no fields when the front matter is missing, never closed or not YAML: the file is written whole', () => {
    expect(skillMdParts('# Just a body').fields).toBeNull()
    expect(skillMdParts('---\nname: x\n# never closed').fields).toBeNull()
    expect(skillMdParts('---\nname: [unclosed\n---\nbody').fields).toBeNull()
    expect(withSkillMdField('# Just a body', 'name', 'x')).toBe('# Just a body')
  })
})
