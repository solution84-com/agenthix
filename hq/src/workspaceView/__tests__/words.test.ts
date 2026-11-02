/** The workspace view's words (live preview spec, parts 1 and 3). */
import { describe, it, expect } from 'vitest'
import type { BranchLineView } from '../../branches/views'
import {
  aheadText, branchSubLine, clashesByVersion, mergeRefusal, mergeSummary, mergedNotice, restoreNotice, whenText, whoseLabel,
} from '../words'
import { viewSizeOf } from '../hooks/useViewSize'
import { noAppLine } from '../livePreviewWords'

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
  it("says on main's live preview how an app comes to start there", () => {
    expect(noAppLine(true, false)).toBe('No app yet. An app an agent started on any branch of this workspace can be started here.')
    expect(noAppLine(false, false)).toMatch(/start_app/)
    expect(noAppLine(true, true)).toBe('No app running here yet. Start one:')
  })
})
