import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../skillsActiveService'

describe('parseFrontmatter @SC-064', () => {
  it('extracts name and description', () => {
    const content = `---\nname: Task Management\ndescription: Manages tasks.\n---\n\n# Body`
    expect(parseFrontmatter(content)).toEqual({
      name: 'Task Management',
      description: 'Manages tasks.',
      version: 1,
      installedFrom: null,
    })
  })

  it('returns defaults when no frontmatter', () => {
    expect(parseFrontmatter('# No frontmatter')).toEqual({
      name: 'Unnamed',
      description: '',
      version: 1,
      installedFrom: null,
    })
  })

  it('extracts version and installedFrom when present', () => {
    const content = [
      '---',
      'slug: git-workflow',
      'name: Git Workflow',
      'description: Manage git.',
      'version: 3',
      'installed_from: skill-abc-123',
      '---',
      '',
      '# Body',
    ].join('\n')
    expect(parseFrontmatter(content)).toEqual({
      name: 'Git Workflow',
      description: 'Manage git.',
      version: 3,
      installedFrom: 'skill-abc-123',
    })
  })
})
