import { describe, expect, it } from 'vitest'
import { ADMINISTRATIVE_MCP_TOOLS, ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, SYSTEM_MCP_TOOLS } from '../../shared/mcpTools'
import { toolsReference } from '../guideBuild/toolsReference'

const headings = (md: string) => [...md.matchAll(/^### (.+)$/gm)].map(m => m[1])

describe('the tools reference equals the registry', () => {
  const md = toolsReference()

  it('names every tool of every access tier once, and no other', () => {
    const offered = [...ALWAYS_INJECTED_MCP_TOOLS, ...DEFAULT_ON_MCP_TOOLS, ...ADMINISTRATIVE_MCP_TOOLS].sort()
    expect(headings(md).sort()).toEqual(offered)
  })

  it('leaves out tools defined but offered to no one', () => {
    const listed = headings(md)
    for (const name of [...Object.values(SYSTEM_MCP_TOOLS.KNOWLEDGE), ...Object.values(SYSTEM_MCP_TOOLS.PLACE)]) {
      expect(listed).not.toContain(name)
    }
  })

  it('says which runs get each group', () => {
    const section = (title: string) => md.slice(md.indexOf(`## ${title}`))
    expect(md.indexOf('## Given to every run')).toBeLessThan(md.indexOf('## Given only when granted'))
    expect(section('Given to every run')).toContain('### ping')
    expect(section('Given only when granted')).toContain('### create_agent')
    expect(section('Given to every run').split('## Given unless')[0]).not.toContain('### create_agent')
  })

  it('gives every tool something to read, from its description or its parameters', () => {
    for (const block of md.split(/^### /m).slice(1)) expect(block.split('\n').slice(2).join('').trim().length).toBeGreaterThan(5)
  })

  it('opens with front matter the guide build accepts: a title and a description', () => {
    expect(md.startsWith('---\ntitle: Agent tools\ndescription: ')).toBe(true)
  })
})
