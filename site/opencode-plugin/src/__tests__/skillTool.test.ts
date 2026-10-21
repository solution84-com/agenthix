import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HARNESS_GATE_UNAVAILABLE } from '@agenthix/core'
import type { ToolContext, ToolResult } from '@opencode-ai/plugin/tool'
import { skillBody, skillTool } from '../skillTool'
import { fakeSite, tempDir, testFdPaths, toolContext, turnFor } from './helpers'

const run = (tool: ReturnType<typeof skillTool>, args: unknown, ctx: ToolContext) =>
  tool.execute(args as never, ctx) as Promise<Exclude<ToolResult, string>>

function stage(root: string, conversation: string, name: string, body: string, files: Record<string, string> = {}) {
  const dir = path.join(root, `conversation-${conversation}`, 'skills', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n\n${body}\n`)
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), text)
  }
  return dir
}

function setup() {
  const root = tempDir()
  const site = fakeSite({ turns: { ses_A: turnFor('conv-a'), ses_B: turnFor('conv-b') } })
  const tool = skillTool(testFdPaths(), site, id => path.join(root, `conversation-${id}`, 'skills'))
  return { root, tool }
}

describe('the skill tool', () => {
  it("loads a skill from the calling conversation's staged folder, in OpenCode's words", async () => {
    const { root, tool } = setup()
    const dir = stage(root, 'conv-a', 'agent-review', 'Review carefully.', { 'scripts/run.sh': 'echo' })
    const ctx = toolContext(root, 'ses_A')
    const res = await run(tool, { name: 'agent-review' }, ctx)
    expect(res.title).toBe('Loaded skill: agent-review')
    expect(res.output).toBe([
      '<skill_content name="agent-review">',
      '# Skill: agent-review',
      '',
      'Review carefully.',
      '',
      `Base directory for this skill: ${dir}`,
      'Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.',
      'Note: file list is sampled.',
      '',
      '<skill_files>',
      `<file>${dir}/scripts/run.sh</file>`,
      '</skill_files>',
      '</skill_content>',
    ].join('\n'))
    expect(ctx.asked).toEqual([{ permission: 'skill', patterns: ['agent-review'] }])
  })

  it('gives two conversations with a same-named skill each their own', async () => {
    const { root, tool } = setup()
    stage(root, 'conv-a', 'org-deploy', 'Deploy the A way.')
    stage(root, 'conv-b', 'org-deploy', 'Deploy the B way.')
    expect((await run(tool, { name: 'org-deploy' }, toolContext(root, 'ses_A'))).output).toContain('Deploy the A way.')
    expect((await run(tool, { name: 'org-deploy' }, toolContext(root, 'ses_B'))).output).toContain('Deploy the B way.')
  })

  it("never loads another conversation's skill, or anything outside the folder", async () => {
    const { root, tool } = setup()
    stage(root, 'conv-a', 'agent-mine', 'mine')
    stage(root, 'conv-b', 'agent-theirs', 'theirs')
    const ctx = toolContext(root, 'ses_A')
    await expect(run(tool, { name: 'agent-theirs' }, ctx)).rejects.toThrow('Skill "agent-theirs" not found. Available skills: agent-mine')
    await expect(run(tool, { name: '../conv-b/skills/agent-theirs' }, ctx)).rejects.toThrow('not found')
  })

  it('has nothing to load with no turn running', async () => {
    const { root, tool } = setup()
    await expect(run(tool, { name: 'agent-x' }, toolContext(root, 'ses_Z'))).rejects.toThrow(HARNESS_GATE_UNAVAILABLE)
  })
})

describe("a skill's instructions", () => {
  it('are what follows the front matter', () => {
    expect(skillBody('---\nname: a\ndescription: b\n---\n\nBody\n').trim()).toBe('Body')
    expect(skillBody('﻿---\r\nname: a\r\n---\r\nBody').trim()).toBe('Body')
    expect(skillBody('No front matter').trim()).toBe('No front matter')
  })
})
