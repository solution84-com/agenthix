import { describe, it, expect } from 'vitest'
import type { ToolPermission } from '@agenthix/core'
import {
  mergeInstructions, mergeSettings, validateAgentSettings, contentToFiles, filesToContent, defaultAgentSettings,
  agentSettingsOf, settingsColumns,
} from '../agentPackageService'

const settings = defaultAgentSettings()
const row = {
  id: 'a1', defaultModel: 'claude-sonnet-5', runtime: 'claude-sdk', approval: 'deferred',
  allowedTools: null, allowedBashPatterns: null,
}

describe('agentPackageService', () => {
  it('merges PROFILE then RESPONSIBILITIES with frontmatter dropped (P14)', () => {
    expect(mergeInstructions('---\nname: x\n---\n# Scout\n\nBe brief.\n', '# Responsibilities\n\n- Scout\n')).toBe('# Scout\n\nBe brief.\n\n# Responsibilities\n\n- Scout\n')
    expect(mergeInstructions(null, 'Only this')).toBe('Only this\n')
  })

  it('merges a settings change field by field, keeping null tool ceilings distinct from unset', () => {
    const next = mergeSettings(settings, { defaultModel: 'claude-opus-4-6', allowedTools: null })
    expect(next).toEqual({ ...settings, model: 'claude-opus-4-6', permissions: { tools: null, bashPatterns: null } })
    const tools: ToolPermission[] = [{ name: 'Read', state: 'always' }]
    expect(mergeSettings(settings, { allowedTools: tools }).permissions.tools).toEqual(tools)
  })

  it('refuses an invalid runtime, approval or interval', () => {
    expect(() => validateAgentSettings({ ...settings, runtime: 'gpt' })).toThrow(/runtime/)
    expect(() => validateAgentSettings({ ...settings, runtime: 'opencode', model: 'anthropic/claude-sonnet-4-6' })).not.toThrow()
    expect(() => validateAgentSettings({ ...settings, runtime: 'opencode', model: 'openai_compatible/llama3.1:8b' })).not.toThrow()
    expect(() => validateAgentSettings({ ...settings, runtime: 'opencode', model: 'claude-sonnet-4-6' })).toThrow(/opencode/)
    expect(() => validateAgentSettings({ ...settings, approval: 'yolo' })).toThrow(/approval/)
    expect(() => settingsColumns({ ...settings, model: ' ' })).toThrow(/model/)
  })

  it('reads settings from the Agent row and writes them back as the same columns', () => {
    expect(agentSettingsOf(row)).toEqual(settings)
    expect(settingsColumns(agentSettingsOf(row))).toMatchObject({ defaultModel: 'claude-sonnet-5', runtime: 'claude-sdk', approval: 'deferred' })
  })

  it('turns content into files and back — the package holds content only, never settings', () => {
    const content = { instructions: 'I', skillFiles: [{ path: 'skills/a/SKILL.md', content: Buffer.from('s') }] }
    const files = contentToFiles(content)
    expect(files.map(x => x.path)).toEqual(['instructions.md', 'skills/a/SKILL.md'])
    expect(filesToContent(files)).toEqual(content)
    expect(() => contentToFiles({ ...content, skillFiles: [{ path: 'evil.md', content: Buffer.from('') }] })).toThrow(/skills\//)
  })
})
