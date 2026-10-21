import { describe, it, expect } from 'vitest'
import { conversationStagingDirName, openCodeSkillsContainerDir } from '../openCodeSkills.js'

describe("a conversation's staged skills", () => {
  it('sit in one folder per conversation inside the read-only staging folder', () => {
    expect(conversationStagingDirName('cm1abc')).toBe('conversation-cm1abc')
    expect(openCodeSkillsContainerDir('cm1abc')).toBe('/home/appuser/.claude/.tmp/conversation-cm1abc/skills')
  })

  it('refuse an id that is not one plain name', () => {
    for (const bad of ['', '../x', 'a/b', 'a b', '.']) {
      expect(conversationStagingDirName(bad)).toBeNull()
      expect(openCodeSkillsContainerDir(bad)).toBeNull()
    }
  })
})
