import { describe, it, expect } from 'vitest'
import { buildMemoryContent } from '../promptSectionText'

describe('the Memory section @SC-2106', () => {
  it('names the tools memory is reached by, and carries no item: memory is recalled, never sent whole', () => {
    const section = buildMemoryContent()
    expect(section).toContain('## Memory')
    for (const tool of ['`recall`', '`remember`', '`forget`']) expect(section).toContain(tool)
    expect(section).not.toMatch(/^- \[/m)
  })

  it('is the same for every run: which memory a run may use is decided in HQ at each call', () => {
    expect(buildMemoryContent()).toBe(buildMemoryContent())
  })

  it('never mentions a directory — memory is not a path', () => {
    expect(buildMemoryContent()).not.toContain('/memory')
  })

  it('carries the Knowledge section: one search across levels, and memory for what the agent learns @SC-1396', () => {
    const section = buildMemoryContent()
    expect(section).toContain('## Knowledge')
    expect(section).toContain('`search_knowledge` finds how things are done here and how Agenthix itself works')
    expect(section).toContain('a place, then the organisation, then the platform guide')
    expect(section).toContain('What you learn on your own belongs in memory.')
    expect(section).not.toContain('INDEX.md')
    expect(section).not.toContain('`knowledge` directory')
  })

  it('says where the pinned items are when the run has them, and that recall reaches the rest', () => {
    const section = buildMemoryContent('/home/appuser/.claude/.tmp/memory-s1/pinned.md')
    expect(section).toContain('`/home/appuser/.claude/.tmp/memory-s1/pinned.md`')
    expect(section).toContain('read-only')
    expect(section).toContain('`recall` reaches the rest')
  })

  it('says nothing of a file when the run has none', () => {
    expect(buildMemoryContent(null)).toBe(buildMemoryContent())
  })

  it('says what a skill name means: it starts with where it comes from, and the rest is its name', () => {
    const section = buildMemoryContent()
    expect(section).toContain('## Skills')
    for (const prefix of ['`platform-`', '`org-`', '`agent-`', '`person-`', '`workspace-N-`']) expect(section).toContain(prefix)
    expect(section).toContain('the rest is its name')
    expect(section).toContain('`/code-review`')
  })
})
