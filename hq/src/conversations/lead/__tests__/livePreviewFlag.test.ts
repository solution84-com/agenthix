/**
 * What the lead is told of live previews (live preview spec section 7, *The live preview's flag*): nothing while the
 * flag is off, as shipped; its rules and run_task's words about the app only while it is on.
 */
import { describe, expect, it } from 'vitest'
import { leadBaseInstructions } from '../instructions'
import { describeRunTask } from '../../work/tasks/runTaskTool'

const LIVE_PREVIEW = /live preview|offer_live_preview|start_app|reload_view|app tools/i
const lead = (featuresOn?: readonly 'livePreview'[]) =>
  leadBaseInstructions({ agentName: 'Kernel', agentRole: null, placeLabel: 'the Shop project', ...(featuresOn ? { featuresOn } : {}) })

describe("the lead's instructions and run_task while the live preview's flag is off @SC-1772", () => {
  it('say nothing of live previews, and keep the rules for code work', () => {
    expect(lead()).not.toMatch(LIVE_PREVIEW)
    expect(lead([])).not.toMatch(LIVE_PREVIEW)
    expect(lead()).toMatch(/A code workspace is a workspace with Git/)
    expect(lead()).toMatch(/Never change a code workspace's files any other way\.\n- Keep the person's words/)
    expect(describeRunTask({ home: 'TASK' })).not.toMatch(LIVE_PREVIEW)
    expect(describeRunTask({ home: 'TASK' })).toMatch(/changing its code/)
  })
})

describe("the lead's instructions and run_task while the live preview's flag is on", () => {
  it('tell the lead to offer a live preview, and that the task\'s run has the app tools', () => {
    expect(lead(['livePreview'])).toMatch(/call offer_live_preview/)
    expect(lead(['livePreview'])).toMatch(/which has the app tools\n {2}\(start_app, reload_view\)/)
    expect(describeRunTask({ home: 'TASK' }, true)).toMatch(/reloading its app in the live preview/)
  })
})
