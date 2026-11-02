import { describe, expect, it } from 'vitest'
import { CODE_WORK_PROMPT_BRANCHES_MAX, codeWorkPromptText } from '../codeWorkPrompt.js'
import { MERGE_TOOL_DECLARATION } from '../mergeTool.js'
import { UPDATE_TOOL_DECLARATION } from '../updateTool.js'
import type { RunCodeWork } from '../../protocol/codeWork.js'

const work = (over: Partial<RunCodeWork> = {}): RunCodeWork => ({
  workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
  copyId: '00000000-0000-4000-8000-000000000001',
  branch: 'add-login-page',
  main: 'main',
  behindMain: 0,
  otherBranches: [],
  author: { name: 'Kernel', email: 'kernel@agents.hq.invalid' },
  onBehalfOf: null,
  ...over,
})

describe('codeWorkPromptText', () => {
  it('names the branch, main, and that main is read only', () => {
    const text = codeWorkPromptText(work())
    expect(text).toContain('`add-login-page`')
    expect(text).toContain('can read but not write')
    expect(text).toContain('Your branch has everything `main` has.')
    expect(text).toContain('No other branch')
  })

  it('says how far behind main the branch is', () => {
    expect(codeWorkPromptText(work({ behindMain: 1 }))).toContain('has 1 commit your branch does not have')
    expect(codeWorkPromptText(work({ behindMain: 3 }))).toContain('has 3 commits your branch does not have')
  })

  it('lists the other branches with whose they are and who works on them', () => {
    const text = codeWorkPromptText(work({
      otherBranches: [{ name: 'login-form', whose: 'Ada · Login form', ahead: 2, agentWorking: 'Kernel' }],
    }))
    expect(text).toContain('- `login-form`: Ada · Login form; 2 commits ahead of `main`; Kernel is working on it now')
    expect(text).toContain('say so to the person')
  })

  it('names at most the cap of other branches and counts the rest', () => {
    const otherBranches = Array.from({ length: CODE_WORK_PROMPT_BRANCHES_MAX + 3 }, (_, i) => ({ name: `b-${i}`, whose: 'x', ahead: 1, agentWorking: null }))
    const text = codeWorkPromptText(work({ otherBranches }))
    expect(text).toContain('- and 3 more')
    expect(text).not.toContain(`b-${CODE_WORK_PROMPT_BRANCHES_MAX}\``)
  })

  it('tells the agent to raise the merge confirmation at once when asked, and never unasked', () => {
    const text = codeWorkPromptText(work())
    expect(text).toContain('call `merge_into_main` at once')
    expect(text).toContain('passed on to you in a brief')
    expect(text).toContain('Never call it when nobody asked')
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/as soon as the person asks you to merge into main/)
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/do not tell them to press Merge themselves/)
  })

  it('names update_from_main for bringing main in, and commit to finish a merge that clashed', () => {
    const text = codeWorkPromptText(work({ behindMain: 2 }))
    expect(text).toContain('call `update_from_main`')
    expect(text).toContain('then call `commit` to finish the merge')
    expect(MERGE_TOOL_DECLARATION.description).toContain('call update_from_main')
    expect(UPDATE_TOOL_DECLARATION.description).toContain('call commit')
  })

  it('says the person confirms the merge, so the agent does not report it as done', () => {
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/does not merge by itself/)
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/only when they press Merge/)
    expect(codeWorkPromptText(work())).toContain('the merge happens when they press Merge')
  })
})
