import { describe, it, expect } from 'vitest'
import { Circle, GitBranch, KeyRound, Sparkles, Workflow } from 'lucide-react'
import { sectionIcon } from '../sectionIcons'

describe('a project section’s icon in the project menu', () => {
  it.each([
    ['workflows', Workflow],
    ['skills', Sparkles],
    ['github', GitBranch],
    ['secrets', KeyRound],
  ])('draws %s with its own icon, not the fallback circle', (id, icon) => {
    expect(sectionIcon('project', id)).toBe(icon)
    expect(sectionIcon('project', id)).not.toBe(Circle)
  })
})
