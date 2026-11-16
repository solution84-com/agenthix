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

const ON = { livePreview: true }

describe('codeWorkPromptText @SC-1674', () => {
  it('names the branch, main, and that main is read only', () => {
    const text = codeWorkPromptText(work(), ON)
    expect(text).toContain('`add-login-page`')
    expect(text).toContain('can read but not write')
    expect(text).toContain('Your branch has everything `main` has.')
    expect(text).toContain('No other branch')
  })

  it('says how far behind main the branch is', () => {
    expect(codeWorkPromptText(work({ behindMain: 1 }), ON)).toContain('has 1 commit your branch does not have')
    expect(codeWorkPromptText(work({ behindMain: 3 }), ON)).toContain('has 3 commits your branch does not have')
  })

  it('lists the other branches with whose they are and who works on them', () => {
    const text = codeWorkPromptText(work({
      otherBranches: [{ name: 'login-form', whose: 'Ada · Login form', ahead: 2, agentWorking: 'Kernel' }],
    }), ON)
    expect(text).toContain('- `login-form`: Ada · Login form; 2 commits ahead of `main`; Kernel is working on it now')
    expect(text).toContain('say so to the person')
  })

  it('names at most the cap of other branches and counts the rest', () => {
    const otherBranches = Array.from({ length: CODE_WORK_PROMPT_BRANCHES_MAX + 3 }, (_, i) => ({ name: `b-${i}`, whose: 'x', ahead: 1, agentWorking: null }))
    const text = codeWorkPromptText(work({ otherBranches }), ON)
    expect(text).toContain('- and 3 more')
    expect(text).not.toContain(`b-${CODE_WORK_PROMPT_BRANCHES_MAX}\``)
  })

  it('tells the agent to raise the merge confirmation at once when asked, and never unasked', () => {
    const text = codeWorkPromptText(work(), ON)
    expect(text).toContain('call `merge_into_main` at once')
    expect(text).toContain('passed on to you in a brief')
    expect(text).toContain('Never call it when nobody asked')
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/Call it as soon as they ask/)
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/Never call it because the work looks finished and nobody asked/)
  })

  it('says the run has the app tools, how they reach the live preview, and that an earlier "none" no longer holds', () => {
    const text = codeWorkPromptText(work(), ON)
    expect(text).toContain('`start_app`, `stop_app`, `list_apps`, `reload_view` and `set_auto_reload`')
    expect(text).toContain('offered on every run of yours, this one included')
    expect(text).toContain('that no longer holds')
  })

  it('with no live preview open, opens one only when the person asked for the app in this run\'s request', () => {
    const text = codeWorkPromptText(work(), ON)
    expect(text).toContain('Your branch has no live preview open.')
    expect(text).toContain("When the person asked, in this run's request, to see, run, start or show the app: call `start_app` yourself")
    expect(text).toContain('Otherwise never call `start_app`: nobody asked for a live preview')
    expect(text).not.toContain('Call `list_apps` first')
  })

  it('with the live preview open, says so, names the running apps, and has the run list them first, commit and reload', () => {
    const text = codeWorkPromptText(work({ openLivePreview: { paused: false, runningApps: ['shop', 'web'] } }), ON)
    expect(text).toContain("Your branch's live preview is open now. Apps running in it: `shop`, `web`.")
    expect(text).toContain('Call `list_apps` first')
    expect(text).toContain('`commit`, then `reload_view`')
    expect(text).not.toContain('no live preview open')
    expect(codeWorkPromptText(work({ openLivePreview: { paused: false, runningApps: [] } }), ON)).toContain('No app runs in it yet.')
    expect(codeWorkPromptText(work({ openLivePreview: { paused: true, runningApps: [] } }), ON)).toContain('but paused')
  })

  it('keeps the live preview\'s own workflows for the person, and the run commits its work itself', () => {
    const text = codeWorkPromptText(work(), ON)
    expect(text).toContain('`start-live-preview` and `reload-live-preview` belong to the person')
    expect(text).toContain('never to start the app')
    expect(text).toContain('Commit your work yourself')
    expect(text).toContain('always before you finish')
    expect(text).not.toContain('is committed for you')
  })

  it('names update_from_main for bringing main in, and commit to finish a merge that clashed', () => {
    const text = codeWorkPromptText(work({ behindMain: 2 }), ON)
    expect(text).toContain('call `update_from_main`')
    expect(text).toContain('then call `commit` to finish the merge')
    expect(MERGE_TOOL_DECLARATION.description).toContain('update_from_main, resolve, commit')
    expect(UPDATE_TOOL_DECLARATION.description).toContain('call commit')
  })

  it('says the person confirms the merge, so the agent does not report it as done', () => {
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/shows them a confirmation/)
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/only when they press Merge/)
    expect(codeWorkPromptText(work(), ON)).toContain('the merge happens when they press Merge')
  })

  it('says nothing of live previews or app tools while the live preview is off (adr-0172) @SC-1772', () => {
    const text = codeWorkPromptText(work({ openLivePreview: { paused: false, runningApps: ['web'] } }), { livePreview: false })
    expect(text).not.toMatch(/live preview|app tools|start_app|reload_view/i)
    expect(text).toContain('# Your branch')
  })
})
