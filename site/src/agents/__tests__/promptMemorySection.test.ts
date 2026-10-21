import { describe, it, expect } from 'vitest'
import { buildMemoryContent } from '../promptSectionText'

describe('the Memory section @SC-992', () => {
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

  it('keeps the project knowledge guidance — it is a different thing', () => {
    const section = buildMemoryContent()
    expect(section).toContain('`knowledge` directory')
    expect(section).toContain("is the team's")
    expect(section).toMatch(/readable only inside its own boundary/)
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
})
