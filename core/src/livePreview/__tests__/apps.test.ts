import { describe, expect, it } from 'vitest'
import { APP_OUTPUT_LINES, APP_OUTPUT_LINE_CHARS, LIVE_PREVIEW_RESERVED_PORTS, appSpecProblem, lastOutputLines } from '../apps.js'
import { APP_TOOL_DECLARATIONS, APP_TOOL_NAMES } from '../appTools.js'

const spec = { appId: 'abcdefghijklmnopqrstuvwxyz', name: 'web', folder: 'apps/web', command: 'npm run dev', port: 5173 }

describe("an app's spec @SC-1760", () => {
  it("accepts a name, a folder inside the copy (or its root), a command and a port", () => {
    expect(appSpecProblem(spec)).toBeNull()
    expect(appSpecProblem({ ...spec, folder: '' })).toBeNull()
    expect(appSpecProblem({ ...spec, appId: undefined }, false)).toBeNull()
  })

  it('refuses each part that is not one, saying which', () => {
    expect(appSpecProblem({ ...spec, name: 'Web App' })).toBe('name')
    expect(appSpecProblem({ ...spec, folder: '../other' })).toBe('folder')
    expect(appSpecProblem({ ...spec, folder: '/etc' })).toBe('folder')
    expect(appSpecProblem({ ...spec, command: 'npm run dev\nrm -rf ~' })).toBe('command')
    expect(appSpecProblem({ ...spec, port: 80 })).toBe('port')
    expect(appSpecProblem({ ...spec, port: 70000 })).toBe('port')
    expect(appSpecProblem({ ...spec, port: LIVE_PREVIEW_RESERVED_PORTS[0] })).toBe('reservedPort')
    expect(appSpecProblem({ ...spec, appId: 'web' })).toBe('appId')
  })
})

describe("an app's last output @SC-1701", () => {
  it('keeps the last lines, cut, without terminal sequences', () => {
    const output = Array.from({ length: 100 }, (_, i) => `\u001b[32mline ${i}\u001b[0m`).join('\r\n') + '\n'
    const lines = lastOutputLines(output)
    expect(lines).toHaveLength(APP_OUTPUT_LINES)
    expect(lines.at(-1)).toBe('line 99')
    expect(lastOutputLines('x'.repeat(APP_OUTPUT_LINE_CHARS + 10))[0]).toHaveLength(APP_OUTPUT_LINE_CHARS)
  })
})

describe("the agent's app tools @SC-1701", () => {
  it('are the five, each taking what it needs and never the workspace or the branch', () => {
    expect([...APP_TOOL_NAMES]).toEqual(['start_app', 'stop_app', 'list_apps', 'reload_view', 'set_auto_reload'])
    for (const tool of APP_TOOL_DECLARATIONS) {
      expect(Object.keys(tool.args)).not.toContain('workspace')
      expect(Object.keys(tool.args)).not.toContain('branch')
      expect(tool.runIdFromCaller).toBe(true)
    }
    expect(Object.keys(APP_TOOL_DECLARATIONS[0].args)).toEqual(['name', 'folder', 'command', 'port'])
    expect(APP_TOOL_DECLARATIONS[4].args.auto.type).toBe('boolean')
  })
})
