import { describe, expect, it } from 'vitest'
import { ADMINISTRATIVE_MCP_TOOLS, ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, SYSTEM_MCP_TOOLS } from '../../shared/mcpTools'
import { toolsReference } from '../guideBuild/toolsReference'

const headings = (md: string) => [...md.matchAll(/^### (.+)$/gm)].map(m => m[1])

describe('the tools reference equals the registry @SC-1412', () => {
  const md = toolsReference()

  it('names every tool of every access tier once, and no other', () => {
    const offered = [...ALWAYS_INJECTED_MCP_TOOLS, ...DEFAULT_ON_MCP_TOOLS, ...ADMINISTRATIVE_MCP_TOOLS].sort()
    expect(headings(md).sort()).toEqual(offered)
  })

  it("leaves out tools no run is given, such as the lead's own suggest_place", () => {
    const listed = headings(md)
    for (const name of Object.values(SYSTEM_MCP_TOOLS.PLACE)) expect(listed).not.toContain(name)
  })

  it('gives every run search and read, and only runs that may change files write, edit and delete', () => {
    const section = (title: string) => md.slice(md.indexOf(`## ${title}`)).split(/\n## (?!#)/)[0]
    const everyRun = section('Given to every run')
    const changers = section('Given to runs that may change files')
    const { SEARCH_KNOWLEDGE, READ_KNOWLEDGE, WRITE_KNOWLEDGE, EDIT_KNOWLEDGE, DELETE_KNOWLEDGE } = SYSTEM_MCP_TOOLS.KNOWLEDGE
    for (const name of [SEARCH_KNOWLEDGE, READ_KNOWLEDGE]) expect(everyRun).toContain(`### ${name}`)
    for (const name of [WRITE_KNOWLEDGE, EDIT_KNOWLEDGE, DELETE_KNOWLEDGE]) {
      expect(everyRun).not.toContain(`### ${name}`)
      expect(changers).toContain(`### ${name}`)
    }
    expect(everyRun).toMatch(/### search_knowledge\n\nWorks like Grep/)
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
