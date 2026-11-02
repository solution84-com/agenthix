/** The workspace view's words (live preview spec, parts 1 and 3). */
import { describe, it, expect } from 'vitest'
import type { BranchLineView } from '../../branches/views'
import {
  aheadText, branchSubLine, clashesByVersion, mergeRefusal, mergeSummary, mergedNotice, restoreNotice, whenText, whoseLabel,
} from '../words'
import { viewSizeOf } from '../hooks/useViewSize'
import { appsToRestart, noAppLine, secretsLine, waitingWords } from '../livePreviewWords'
import type { LivePreviewSecretsView } from '../../livePreviews/types'

const line = (over: Partial<BranchLineView> = {}): BranchLineView => ({
  id: 'b1', name: 'login-page', ahead: 6, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'conversation', conversationId: 'c1', title: 'Login page', personId: 'u-mia', personName: 'Mia' },
  working: { agentName: 'Kernel' },
  ...over,
})

describe('a branch’s line @SC-1684', () => {
  it('says whose it is and what works on it', () => {
    expect(whoseLabel(line().whose, 'Kernel')).toBe('Mia, with Kernel')
    expect(whoseLabel({ kind: 'task', taskId: 't', taskKey: 'SHOP-14', title: 'Fix', personId: null, personName: null }, null)).toBe('Task SHOP-14')
    expect(branchSubLine(line())).toBe('Mia, with Kernel · 6 ahead')
  })

  it('says You for the signed-in person, and names the agent while it is idle', () => {
    expect(branchSubLine(line({ working: null }), 'u-mia')).toBe('You, with Kernel · 6 ahead')
    expect(branchSubLine(line({ working: null }), 'u-ada')).toBe('Mia, with Kernel · 6 ahead')
  })

  it('counts commits ahead and behind', () => {
    expect(aheadText(3, 2)).toBe('3 ahead · 2 behind')
    expect(aheadText(0, 0)).toBe('Nothing new')
  })
})

describe('Merge into main', () => {
  it('starts its summary from the work @SC-1690', () => {
    expect(mergeSummary(line())).toBe('Kernel for Mia · Login page')
    expect(mergeSummary(line({ working: null }))).toBe('Kernel for Mia · Login page')
    expect(mergeSummary(line({ working: null, agentName: null }))).toBe('Mia · Login page')
    expect(mergeSummary(line({ whose: { kind: 'task', taskId: 't', taskKey: 'SHOP-9', title: 'Product images', personId: null, personName: null } }))).toBe('Kernel for task SHOP-9 · Product images')
  })

  it('groups clashing files by the version of main that changed them, newest first @SC-1690', () => {
    const v15 = { number: 15, commit: 'c15', subject: 'Ada · Dark mode' }
    const v14 = { number: 14, commit: 'c14', subject: 'Checkout' }
    expect(clashesByVersion([{ path: 'a', version: v14 }, { path: 'b', version: v15 }, { path: 'c', version: v15 }]))
      .toEqual([{ version: v15, paths: ['b', 'c'] }, { version: v14, paths: ['a'] }])
  })

  it('says what was not merged, ending that nothing was changed @SC-1690', () => {
    expect(mergeRefusal({ outcome: 'nothing_to_merge' })).toMatch(/Nothing was changed\.$/)
    expect(mergeRefusal({ outcome: 'main_moved' })).toMatch(/Nothing was changed\.$/)
    expect(mergeRefusal({ outcome: 'merged', versionNumber: 15, branchClosed: true })).toBeNull()
    expect(mergedNotice({ outcome: 'merged', versionNumber: 15, branchClosed: true })).toBe('Merged into main as version 15. The branch is closed.')
  })

  it('says what a restore did @SC-1691', () => {
    expect(restoreNotice({ outcome: 'restored', versionNumber: 16 }, 12)).toBe('main is at version 16, with the files of version 12.')
    expect(restoreNotice({ outcome: 'same_files' }, 12)).toMatch(/Nothing was changed\.$/)
  })
})

describe('times and widths', () => {
  it('says when, briefly', () => {
    const now = Date.parse('2026-11-01T12:00:00Z')
    expect(whenText('2026-11-01T11:59:30Z', now)).toBe('now')
    expect(whenText('2026-11-01T11:55:00Z', now)).toBe('5 min ago')
    expect(whenText('2026-11-01T10:00:00Z', now)).toBe('2 h ago')
    expect(whenText('2026-10-31T10:00:00Z', now)).toBe('yesterday')
    expect(whenText(null, now)).toBe('')
  })

  it('folds the view at about 1280, 900 and a phone’s width @SC-1689', () => {
    expect(viewSizeOf(1440)).toBe('wide')
    expect(viewSizeOf(1180)).toBe('laptop')
    expect(viewSizeOf(820)).toBe('tablet')
    expect(viewSizeOf(390)).toBe('phone')
  })
})

describe("the live preview strip's line with no app @SC-1703", () => {
  it("says plainly that no app is running, and how one starts", () => {
    expect(noAppLine(true, false)).toMatch(/^No app is running yet, .*start_app/)
    expect(noAppLine(false, false)).toBe('No app is running yet. Ask the agent in the conversation to start the app.')
    expect(noAppLine(true, true)).toBe('No app is running yet. Start one:')
  })
})

describe('the middle while no app shows @SC-1703', () => {
  const view = (over: Partial<Parameters<typeof waitingWords>[0]> = {}) => ({ state: 'running' as const, onMain: false, startable: [], ...over })
  it('a running live preview with no app says so, and how to start one', () => {
    expect(waitingWords(view({ startable: [{ name: 'shop', folder: '', command: 'npm start', port: 3000, fromBranch: null }] }), null, true))
      .toBe('No app is running in this live preview yet. Press Start shop on the strip above, or ask the agent in the conversation to start it.')
    expect(waitingWords(view(), null, true)).toMatch(/^No app is running in this live preview yet\. Ask the agent in the conversation/)
    expect(waitingWords(view({ onMain: true }), null, true)).toMatch(/no app has run on this workspace/)
    expect(waitingWords(view(), null, false)).toMatch(/A Member or Admin of the project starts one/)
  })

  it('an app on its way says which, and one that failed says what to do', () => {
    expect(waitingWords(view(), { name: 'shop', state: 'starting' }, true)).toBe('shop is starting. It shows here once it answers.')
    expect(waitingWords(view(), { name: 'shop', state: 'failed' }, true)).toMatch(/^shop did not start\. .*Restart tries again/)
  })
})

describe("the strip's secrets line @SC-1712", () => {
  const run = (over: Partial<LivePreviewSecretsView> = {}): LivePreviewSecretsView => ({
    runId: 'r1', kind: 'start', state: 'passed', names: ['SHOP_API_KEY'], message: null, at: '2026-11-02T07:11:10.000Z', ...over,
  })
  it('says the run goes, then the names it handed, never a value', () => {
    expect(secretsLine(run({ state: 'going', names: [] }))).toBe("start-live-preview is running. Its secrets go to the app's container only.")
    expect(secretsLine(run())).toBe("start-live-preview passed and handed SHOP_API_KEY to the app's container. An app reads each at /run/secrets/<NAME>.")
    expect(secretsLine(run({ names: [] }))).toMatch(/name no secrets, so nothing was handed/)
  })

  it("says why one failed in the run's words, and that nothing was handed", () => {
    expect(secretsLine(run({ state: 'failed', names: [], message: 'Step prepare failed.' }))).toBe('Step prepare failed. No secrets were handed to the app.')
    expect(secretsLine(run({ state: 'failed', names: [], message: 'The run passed, but its secrets were not handed to the app.' })))
      .toBe('The run passed, but its secrets were not handed to the app.')
  })

  it('offers a restart only to the apps running from before the hand-off', () => {
    const apps = [
      { appId: 'a1', name: 'shop', state: 'running' as const, since: '2026-11-02T07:00:00.000Z' },
      { appId: 'a2', name: 'api', state: 'running' as const, since: '2026-11-02T07:12:00.000Z' },
      { appId: 'a3', name: 'web', state: 'stopped' as const, since: '2026-11-02T07:00:00.000Z' },
    ]
    expect(appsToRestart(apps, run()).map(a => a.name)).toEqual(['shop'])
    expect(appsToRestart(apps, run({ state: 'going' }))).toEqual([])
    expect(appsToRestart(apps, null)).toEqual([])
  })
})
