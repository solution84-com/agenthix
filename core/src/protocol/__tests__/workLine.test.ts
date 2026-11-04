import { describe, it, expect } from 'vitest'
import { workLine, foldSteps, abridgeWorkLine, type WorkLineEntry, type WorkStep } from '../workLine.js'
import { toolStep, canonicalToolName, toolAsk } from '../workSteps.js'
import { COMMIT_TOOL_NAME } from '../../codeWork/commitTool.js'
import { MERGE_TOOL_NAME } from '../../codeWork/mergeTool.js'
import { UPDATE_TOOL_NAME } from '../../codeWork/updateTool.js'
import { APP_TOOL_DECLARATIONS } from '../../livePreview/appTools.js'
import { WORKFLOW_TOOL_DECLARATIONS } from '../../workflows/agentTools.js'
import { PROPOSE_SKILL_TOOL } from '../../assets/skillTools.js'
import type { JsonValue } from '../../client/json.js'

let clock = Date.parse('2026-10-10T10:24:00Z')
function tool(toolName: string, toolInput: JsonValue, toolOutput: JsonValue = null, seconds = 5): WorkLineEntry {
  clock += seconds * 1000
  return { role: 'TOOL', content: toolName, toolName, toolInput, toolOutput, createdAt: new Date(clock).toISOString() }
}
function thought(content: string): WorkLineEntry {
  clock += 1000
  return { role: 'SYSTEM', kind: 'THOUGHT', content, toolName: null, toolInput: null, toolOutput: null, createdAt: new Date(clock).toISOString() }
}
function reply(thinkingDurationMs: number | null = null): WorkLineEntry {
  clock += 1000
  return { role: 'ASSISTANT', content: 'Done.', toolName: null, toolInput: null, toolOutput: null, thinkingDurationMs, createdAt: new Date(clock).toISOString() }
}

describe('a tool call as a plain step @SC-756', () => {
  it('reads set_result as stating the run\'s result, not as "Used a tool"', () => {
    const step = toolStep('mcp__platform__set_result', { result: 'Fixed the login page.\nTests pass.' })
    expect(step).toMatchObject({ kind: 'changed', verb: 'Stated the result', text: 'Fixed the login page.' })
    expect(toolAsk('set_result')).toBe("State a run's result")
  })

  it('reads every harness name for the same tool under one name', () => {
    expect(canonicalToolName('Read')).toBe('read_file')
    expect(canonicalToolName('read')).toBe('read_file')
    expect(canonicalToolName('mcp__platform__create_task')).toBe('create_task')
    expect(canonicalToolName('create_task')).toBe('create_task')
    expect(canonicalToolName('apply_patch')).toBe('edit_file')
  })

  it('never shows a raw tool name, for a tool it does not know either', () => {
    const step = toolStep('mcp__platform__brand_new_tool', { x: 1 })
    expect(step).toMatchObject({ kind: 'other', verb: 'Used a tool', text: '' })
    expect(JSON.stringify(step)).not.toContain('brand_new_tool')
  })

  it('has a row for every tool a Room offers an agent', () => {
    // The two package tools are named by the site, which core cannot import.
    const names = [
      COMMIT_TOOL_NAME, MERGE_TOOL_NAME, UPDATE_TOOL_NAME, PROPOSE_SKILL_TOOL, 'install_packages', 'ask_to_use_package',
      ...APP_TOOL_DECLARATIONS.map(d => d.name), ...WORKFLOW_TOOL_DECLARATIONS.map(d => d.name),
    ]
    expect(names.length).toBe(15)
    for (const name of names) {
      expect(toolStep(name, {}).verb, name).not.toBe('Used a tool')
      expect(toolStep(`mcp__platform__${name}`, {}).verb, name).not.toBe('Used a tool')
      expect(toolAsk(name), name).not.toBe('Use a tool it is not yet allowed')
    }
  })

  it('shows a command as the command, on one line', () => {
    expect(toolStep('Bash', { command: 'npm test -w hq\necho done' })).toMatchObject({ kind: 'ran', verb: 'Ran', text: 'npm test -w hq' })
  })

  it('marks a change with what it changed', () => {
    expect(toolStep('Edit', { file_path: '/w/hq/src/ConversationTitle.tsx' })).toMatchObject({
      kind: 'changed', verb: 'Edited', text: 'ConversationTitle.tsx', target: { type: 'file', path: '/w/hq/src/ConversationTitle.tsx' },
    })
    expect(toolStep('create_task', { title: 'One place for automation' }, JSON.stringify({ id: 't1', key: 'AGX-42' }))).toMatchObject({
      kind: 'changed', verb: 'Created', target: { type: 'task', id: 't1', key: 'AGX-42' },
    })
  })

  it("names a worker's knowledge calls by the page, with its level", () => {
    expect(toolStep('mcp__platform__search_knowledge', { pattern: 'release' })).toMatchObject({ kind: 'looked', verb: 'Searched knowledge for', text: '"release"' })
    expect(toolStep('read_knowledge', { page: 'org:how-we-work/review.md' })).toMatchObject({ kind: 'looked', text: 'org:how-we-work/review.md' })
    expect(toolStep('mcp__platform__edit_knowledge', { page: 'website-rebuild:processes/release.md', old_string: 'a', new_string: 'b' })).toMatchObject({
      kind: 'changed', verb: 'Edited the page', text: 'website-rebuild:processes/release.md',
    })
    expect(toolAsk('delete_knowledge')).toBe('Delete knowledge pages')
  })

  it('counts what a listing returned', () => {
    expect(toolStep('mcp__platform__list_tasks', {}, JSON.stringify([{}, {}, {}])).count).toBe(3)
  })

  it('names what a person is asked to allow as an action', () => {
    expect(toolAsk('web_fetch')).toBe('Fetch a web page')
    expect(toolAsk('WebFetch')).toBe('Fetch a web page')
  })
})

describe('a skill used, as a step', () => {
  it('keeps "Used the skill" and points at the staged name', () => {
    expect(toolStep('Skill', { skill: 'org-code-review' })).toMatchObject({
      kind: 'other', verb: 'Used the skill', text: 'org-code-review', target: { type: 'skill', name: 'org-code-review' },
    })
    expect(toolStep('skill', { name: 'workspace-1-release' }).target).toEqual({ type: 'skill', name: 'workspace-1-release' })
  })

  it('points at nothing when the call names no skill', () => {
    expect(toolStep('Skill', {}).target).toBeNull()
  })

  it('points at the staged name when Claude names it within its plugin', () => {
    expect(toolStep('Skill', { skill: 'staged:org-code-review' })).toMatchObject({
      text: 'org-code-review', target: { type: 'skill', name: 'org-code-review' },
    })
    expect(toolStep('Skill', { skill: 'staged:' }).target).toBeNull()
  })
})

describe('the work line @SC-756', () => {
  it('keeps every step in the order it happened, thinking where it happened', () => {
    const line = workLine([
      tool('Read', { file_path: 'a.ts' }),
      thought('Fix the title.'),
      tool('Edit', { file_path: 'b.ts' }),
      tool('Read', { file_path: 'c.ts' }),
      reply(),
    ])
    expect(line.steps.map(s => `${s.verb} ${s.text}`)).toEqual(['Read a.ts', 'Thought Fix the title.', 'Edited b.ts', 'Read c.ts'])
  })

  it('folds same-kind steps in a row, never across a change', () => {
    const line = workLine([
      tool('Read', { file_path: 'a.ts' }),
      tool('Read', { file_path: 'b.ts' }),
      tool('Read', { file_path: 'c.ts' }),
      tool('Edit', { file_path: 'c.ts' }),
      tool('Read', { file_path: 'd.ts' }),
      tool('Read', { file_path: 'e.ts' }),
    ])
    expect(line.steps.map(s => `${s.verb} ${s.text}`)).toEqual(['Read 3 files', 'Edited c.ts', 'Read 2 files'])
    expect(line.steps[0]).toMatchObject({ steps: 3, items: ['a.ts', 'b.ts', 'c.ts'] })
  })

  it('never folds changes or commands', () => {
    const steps = foldSteps(workLine([tool('Bash', { command: 'npm test' }), tool('Bash', { command: 'npm run build' })]).steps)
    expect(steps).toHaveLength(2)
  })

  it('names what was looked at and what was changed, with the thinking time', () => {
    const line = workLine([
      tool('list_tasks', {}, JSON.stringify(Array.from({ length: 12 }, () => ({})))),
      tool('create_task', { title: 'a' }),
      tool('create_task', { title: 'b' }),
      tool('create_task', { title: 'c' }),
      tool('update_task', { taskId: 't1' }),
      reply(9000),
    ])
    expect(line.summary).toBe('Looked at 12 tasks, created 3 and changed 1 · thought for 9s')
  })

  it('reads a long coding run as files read, edited and commands run, with its length', () => {
    const entries: WorkLineEntry[] = []
    for (let i = 0; i < 14; i++) entries.push(tool('Read', { file_path: `f${i}.ts` }, null, 3))
    for (let i = 0; i < 4; i++) entries.push(tool('Edit', { file_path: `f${i}.ts` }, null, 3))
    for (let i = 0; i < 9; i++) entries.push(tool('Bash', { command: 'npm test' }, null, 15))
    expect(workLine(entries).summary).toBe('Read 14 files, edited 4, ran 9 commands · 3 min')
  })

  it('has no line for a run that did nothing', () => {
    expect(workLine([reply()]).summary).toBeNull()
  })

  it('shows a long line opened as its first and last steps', () => {
    const steps = Array.from({ length: 41 }, (_, i) => ({ verb: `s${i}` }) as WorkStep)
    const { head, hidden, tail } = abridgeWorkLine(steps)
    expect(head).toHaveLength(6)
    expect(tail).toHaveLength(6)
    expect(hidden).toBe(29)
    expect(abridgeWorkLine(steps.slice(0, 20)).hidden).toBe(0)
  })
})
