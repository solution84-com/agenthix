import { describe, expect, it } from 'vitest'
import { APP_TOOL_DECLARATIONS, LIVE_PREVIEW_WORKFLOW_NAMES, isLivePreviewWorkflowName } from '../appTools.js'
import { WORKFLOW_TOOL_DECLARATIONS } from '../../workflows/agentTools.js'

const described = (name: string) => [...APP_TOOL_DECLARATIONS, ...WORKFLOW_TOOL_DECLARATIONS].find(d => d.name === name)!.description

describe('the live preview words agents read', () => {
  it('reads the live preview\'s own workflow names as a person would', () => {
    expect(isLivePreviewWorkflowName(LIVE_PREVIEW_WORKFLOW_NAMES.start)).toBe(true)
    expect(isLivePreviewWorkflowName(' Reload-Live-Preview ')).toBe(true)
    expect(isLivePreviewWorkflowName('deploy-staging')).toBe(false)
  })

  it('says automatic reloading follows commits, and reload_view follows a commit', () => {
    expect(described('set_auto_reload')).toContain('each time a commit reaches your branch')
    expect(described('reload_view')).toContain('after you commit a change')
  })

  it('opens a live preview from start_app only when the person asked for the app', () => {
    expect(described('start_app')).toContain('only when they asked to see, run or start the app')
  })

  it('tells the agent run_workflow refuses the live preview\'s own workflows', () => {
    expect(described('run_workflow')).toContain('start-live-preview, reload-live-preview')
  })
})
