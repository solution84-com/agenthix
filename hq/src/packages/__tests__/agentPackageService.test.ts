import { describe, it, expect } from 'vitest'
import type { ToolPermission } from '@agenthix/core'
import {
  mergeInstructions, mergeSettings, validateAgentSettings, contentToFiles, filesToContent, defaultAgentSettings,
  agentSettingsOf, settingsColumns,
} from '../agentPackageService'

const settings = defaultAgentSettings()
const row = {
  id: 'a1', approval: 'deferred',
  allowedTools: null, allowedBashPatterns: null,
}

describe('agentPackageService', () => {
  it('merges PROFILE then RESPONSIBILITIES with frontmatter dropped (P14)', () => {
    expect(mergeInstructions('---\nname: x\n---\n# Scout\n\nBe brief.\n', '# Responsibilities\n\n- Scout\n')).toBe('# Scout\n\nBe brief.\n\n# Responsibilities\n\n- Scout\n')
    expect(mergeInstructions(null, 'Only this')).toBe('Only this\n')
  })

  it('merges a settings change field by field, keeping null tool ceilings distinct from unset', () => {
    const next = mergeSettings(settings, { approval: 'immediate', allowedTools: null })
    expect(next).toEqual({ ...settings, approval: 'immediate', permissions: { tools: null, bashPatterns: null } })
    const tools: ToolPermission[] = [{ name: 'Read', state: 'always' }]
    expect(mergeSettings(settings, { allowedTools: tools }).permissions.tools).toEqual(tools)
  })

  it('refuses an invalid approval', () => {
    expect(() => validateAgentSettings({ ...settings, approval: 'yolo' })).toThrow(/approval/)
    const withTools = (tools: unknown, bashPatterns: unknown = null) => ({ ...settings, permissions: { tools, bashPatterns } }) as never
    expect(() => validateAgentSettings(withTools([{ name: 'Read', state: 'always' }, { name: 'Bash', state: 'ask' }], [{ pattern: 'git *', state: 'never' }]))).not.toThrow()
    expect(() => validateAgentSettings(withTools(['Read']))).not.toThrow()
    expect(() => validateAgentSettings(withTools([{ name: 'Read', state: 'sometimes' }]))).toThrow(/Always, Ask or Never/)
    expect(() => validateAgentSettings(withTools([{ state: 'always' }]))).toThrow(/needs a name/)
    expect(() => validateAgentSettings(withTools(null, [{ pattern: 'git *', state: 'x' }]))).toThrow(/Always, Ask or Never/)
    expect(() => validateAgentSettings(withTools([null]))).toThrow(/needs a name/)
  })

  it('reads settings from the Agent row and writes them back as the same columns', () => {
    expect(agentSettingsOf(row)).toEqual(settings)
    expect(settingsColumns(agentSettingsOf(row))).toMatchObject({ approval: 'deferred' })
  })

  it('turns content into files and back — the package holds content only, never settings', () => {
    const content = { instructions: 'I', skillFiles: [{ path: 'skills/a/SKILL.md', content: Buffer.from('s') }] }
    const files = contentToFiles(content)
    expect(files.map(x => x.path)).toEqual(['instructions.md', 'skills/a/SKILL.md'])
    expect(filesToContent(files)).toEqual(content)
    expect(() => contentToFiles({ ...content, skillFiles: [{ path: 'evil.md', content: Buffer.from('') }] })).toThrow(/skills\//)
  })
})
