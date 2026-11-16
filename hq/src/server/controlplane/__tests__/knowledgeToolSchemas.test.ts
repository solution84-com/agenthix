/**
 * The knowledge tools and suggest_place (agent knowledge spec, parts 3 and 4): shaped like the native Grep, Read,
 * Write and Edit, described as the spec says; the five given to every run and the data path, suggest_place to no run:
 * it is the lead's own.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { BRANDING, KNOWLEDGE_LIMITS } from '@agenthix/core'
import { KNOWLEDGE_DATA_PATH_TOOLS, KNOWLEDGE_TOOLS, PLACE_TOOLS } from '../knowledgeToolSchemas'
import { ALL_CONTROL_PLANE_TOOLS, CONTROL_PLANE_TOOLS, DATA_PATH_ONLY_TOOLS, WORKFORCE_TOOLS } from '../toolSchemas'
import { TOOL_GROUPS } from '../connectionGroups'
import { isTurnTool } from '../turnCaller'
import {
  ADMINISTRATIVE_MCP_TOOLS, ALL_SYSTEM_MCP_TOOL_NAMES, ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, SYSTEM_MCP_TOOLS,
  listKnownToolNames,
} from '../../../shared/mcpTools'

const tool = (name: string) => [...KNOWLEDGE_TOOLS, ...PLACE_TOOLS].find(t => t.name === name)!
const parse = (name: string, args: unknown) => z.object(tool(name).schema).safeParse(args)

describe('the knowledge tools in the registry @SC-1409', () => {
  it('are the five the spec names, and suggest_place, under the registry\'s groups', () => {
    expect(KNOWLEDGE_TOOLS.map(t => t.name)).toEqual(Object.values(SYSTEM_MCP_TOOLS.KNOWLEDGE))
    expect(KNOWLEDGE_TOOLS.map(t => t.name)).toEqual(['search_knowledge', 'read_knowledge', 'write_knowledge', 'edit_knowledge', 'delete_knowledge'])
    expect(PLACE_TOOLS.map(t => t.name)).toEqual(Object.values(SYSTEM_MCP_TOOLS.PLACE))
  })

  it.each(KNOWLEDGE_TOOLS.map(t => t.name))('%s is given to every run, and reaches no connection and no quick tool of a turn', (name) => {
    expect(ALWAYS_INJECTED_MCP_TOOLS).toContain(name)
    expect(DEFAULT_ON_MCP_TOOLS).not.toContain(name)
    expect(ADMINISTRATIVE_MCP_TOOLS).not.toContain(name)
    expect(ALL_SYSTEM_MCP_TOOL_NAMES.has(name)).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(TOOL_GROUPS, name)).toBe(false)
    expect(isTurnTool(name)).toBe(false)
    for (const list of [CONTROL_PLANE_TOOLS, WORKFORCE_TOOLS, DATA_PATH_ONLY_TOOLS]) expect(list.map(t => t.name)).not.toContain(name)
  })

  it.each(KNOWLEDGE_TOOLS.map(t => t.name))('%s is on the data path, with the run\'s id the site fills in', (name) => {
    const served = ALL_CONTROL_PLANE_TOOLS.find(t => t.name === name)!
    expect(served).toBe(KNOWLEDGE_DATA_PATH_TOOLS.find(t => t.name === name))
    expect(Object.keys(served.schema)).toEqual([...Object.keys(tool(name).schema), 'runId'])
    expect(served.description).toBe(tool(name).description)
  })

  it('suggest_place is defined, not offered: in no tier, no served list, no connection group, and not a turn tool @SC-1439', () => {
    const name = 'suggest_place'
    for (const list of [ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, ADMINISTRATIVE_MCP_TOOLS, listKnownToolNames()]) {
      expect(list).not.toContain(name)
    }
    expect(ALL_SYSTEM_MCP_TOOL_NAMES.has(name)).toBe(false)
    for (const list of [CONTROL_PLANE_TOOLS, WORKFORCE_TOOLS, DATA_PATH_ONLY_TOOLS, ALL_CONTROL_PLANE_TOOLS]) {
      expect(list.map(t => t.name)).not.toContain(name)
    }
    expect(Object.prototype.hasOwnProperty.call(TOOL_GROUPS, name)).toBe(false)
    expect(isTurnTool(name)).toBe(false)
  })
})

describe('their shapes, as the native tools take them @SC-1409', () => {
  it('search_knowledge takes Grep\'s parameters, and a scope', () => {
    expect(Object.keys(tool('search_knowledge').schema)).toEqual(
      ['pattern', 'scope', 'path', 'glob', 'output_mode', '-i', '-n', '-A', '-B', '-C', 'head_limit', 'offset'])
    expect(parse('search_knowledge', { pattern: 'staging.*(approv|sign.?off)', '-n': true }).success).toBe(true)
    expect(parse('search_knowledge', { pattern: '' }).success).toBe(true)
    expect(parse('search_knowledge', { pattern: 'x'.repeat(501) }).success).toBe(false)
    expect(parse('search_knowledge', { pattern: 'x', output_mode: 'everything' }).success).toBe(false)
  })

  it('read, write, edit and delete take Read\'s, Write\'s and Edit\'s names, with page for the file', () => {
    expect(Object.keys(tool('read_knowledge').schema)).toEqual(['page', 'offset', 'limit'])
    expect(Object.keys(tool('write_knowledge').schema)).toEqual(['page', 'content'])
    expect(Object.keys(tool('edit_knowledge').schema)).toEqual(['page', 'old_string', 'new_string', 'replace_all'])
    expect(Object.keys(tool('delete_knowledge').schema)).toEqual(['page'])
    expect(parse('read_knowledge', { page: 'website-rebuild:processes/release.md', offset: 10, limit: 10 }).success).toBe(true)
    expect(parse('read_knowledge', { page: 'org:x.md', limit: 2001 }).success).toBe(false)
    expect(parse('edit_knowledge', { page: 'org:x.md', old_string: '', new_string: 'b' }).success).toBe(false)
  })

  it('suggest_place takes a place and why', () => {
    expect(Object.keys(tool('suggest_place').schema)).toEqual(['place', 'why'])
    expect(parse('suggest_place', { place: 'shop', why: 'The work is in Shop.' }).success).toBe(true)
  })
})

describe('their descriptions @SC-1409', () => {
  it('say each works like its native tool, on knowledge', () => {
    expect(tool('search_knowledge').description).toMatch(/^Works like Grep, over everything known here/)
    expect(tool('read_knowledge').description).toMatch(/^Works like Read, on knowledge/)
    expect(tool('write_knowledge').description).toMatch(/^Works like Write, on knowledge/)
    expect(tool('edit_knowledge').description).toMatch(/^Works like Edit, on knowledge/)
  })

  it('name the product from its one constant', () => {
    expect(tool('search_knowledge').description).toContain(`how ${BRANDING.displayName} itself works`)
    expect(tool('search_knowledge').description).toContain(`Asked about ${BRANDING.displayName} itself (where a setting is, what a screen does), search here before you answer`)
  })

  it('write_knowledge says what the front matter must hold, the limits, and to change knowledge only when asked', () => {
    const d = tool('write_knowledge').description!
    expect(d).toContain('only when a person asks you to or corrects it')
    for (const word of ['title', 'description', 'tags']) expect(d).toContain(word)
    expect(d).toContain(`up to ${KNOWLEDGE_LIMITS.maxTitleChars} characters`)
    expect(d).toContain(`up to ${KNOWLEDGE_LIMITS.maxDescriptionChars}`)
    expect(d).toContain('64 KB')
  })

  it('says once, in write_knowledge, to change knowledge only when a person asks, and the other change tools point to it', () => {
    for (const name of ['edit_knowledge', 'delete_knowledge']) {
      expect(tool(name).description).toMatch(/rules of write_knowledge apply/)
      expect(tool(name).description).not.toMatch(/only when a person asks/)
    }
  })

  it('gives the page format with examples in read_knowledge alone', () => {
    const pageOf = (name: string) => (tool(name).schema.page as z.ZodType).description
    expect(pageOf('read_knowledge')).toMatch(/website-rebuild:processes\/release\.md/)
    for (const name of ['write_knowledge', 'edit_knowledge', 'delete_knowledge']) {
      expect(pageOf(name)).toBe('The page, as search_knowledge names it')
    }
  })
})
