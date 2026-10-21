/**
 * ADR-0072: an agent is ONE current definition, and nothing keeps a second copy
 * of its settings. The settings are columns on hq's Agent row and nowhere else —
 * not in a package, not in a version, not on a site — and what a run is sent is
 * read from that row, so an edit reaches the next run with nothing to publish.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Agent } from '@prisma/client'


import { toAgentConfigPayload } from '../../agents/dispatchPayloads'
import { contentToFiles, settingsColumns, agentSettingsOf, mergeSettings, defaultAgentSettings } from '../agentPackageService'

const SETTINGS_COLUMNS = ['defaultModel', 'allowedBashPatterns']

function models(schema: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) out.set(match[1], match[2])
  return out
}
const fieldNames = (body: string) =>
  body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('@@')).map(l => l.split(/\s+/)[0])

const hqModels = models(readFileSync(join(__dirname, '../../../schema.prisma'), 'utf8'))
const siteModels = models(readFileSync(join(__dirname, '../../../../site/schema.prisma'), 'utf8'))

describe('an agent is defined once (ADR-0072) @SC-445', () => {
  it('holds its settings on the Agent row and in no other model, in hq or on a site', () => {
    expect(fieldNames(hqModels.get('Agent')!)).toEqual(expect.arrayContaining([...SETTINGS_COLUMNS, 'runtime', 'approval', 'allowedTools']))
    for (const [name, body] of [...hqModels, ...siteModels]) {
      // A boundary's narrowing holds the agent's own shapes to take away from them (adr-0072), never a copy.
      if (name === 'Agent' || name === 'AgentOverride') continue
      for (const column of SETTINGS_COLUMNS) expect(fieldNames(body), `${name}.${column}`).not.toContain(column)
    }
  })

  it('numbers nothing: a package points at its current content by digest, and content has no version, settings or protocol floor', () => {
    expect(hqModels.has('PackageVersion')).toBe(false)
    const pkg = fieldNames(hqModels.get('Package')!)
    expect(pkg).toEqual(expect.arrayContaining(['kind', 'key', 'digest', 'content']))
    const content = fieldNames(hqModels.get('PackageContent')!)
    expect(content).toEqual(expect.arrayContaining(['digest', 'files']))
    for (const gone of ['version', 'settings', 'minProtocolMinor', 'versions']) {
      expect(pkg).not.toContain(gone)
      expect(content).not.toContain(gone)
    }
  })

  it('writes an agent\'s content as files that carry no settings', () => {
    const files = contentToFiles({ instructions: 'I', skillFiles: [{ path: 'skills/a/SKILL.md', content: Buffer.from('s') }] })
    expect(files.map(f => f.path)).toEqual(['instructions.md', 'skills/a/SKILL.md'])
  })

  it('sends a run the settings read from the Agent row, so a saved edit is what the next run gets', () => {
    const row = {
      id: 'a1', name: 'Scout', handle: 'scout', role: null, isKernel: false,
      ...settingsColumns(defaultAgentSettings('claude-sonnet-4-6')),
      allowedTools: null, allowedBashPatterns: null,
    } as unknown as Agent
    const edited = { ...row, ...settingsColumns(mergeSettings(agentSettingsOf(row), { defaultModel: 'claude-opus-4-6', approval: 'immediate' })) } as unknown as Agent
    expect(toAgentConfigPayload(row)).toMatchObject({ defaultModel: 'claude-sonnet-4-6', approval: 'deferred' })
    expect(toAgentConfigPayload(edited)).toMatchObject({ defaultModel: 'claude-opus-4-6', approval: 'immediate', runtime: 'claude-sdk' })
  })
})
