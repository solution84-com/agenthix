import { afterEach, describe, expect, it, vi } from 'vitest'

const exec = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', async importOriginal => ({ ...(await importOriginal<typeof import('node:child_process')>()), execFile: exec }))
vi.mock('../../../agents/runtime/ClaudeSDKRuntime', () => ({ ClaudeSDKRuntime: class ClaudeSDKRuntime {} }))
vi.mock('../../../agents/runtime/OpenCodeRuntime', () => ({ OpenCodeRuntime: class OpenCodeRuntime {} }))

import { docker } from '../../../agents/runtime/containerLifecycle'
import { selectRuntime } from '../../../agents/runtime/selectRuntime'
import { ClaudeSDKRuntime } from '../../../agents/runtime/ClaudeSDKRuntime'
import { OpenCodeRuntime } from '../../../agents/runtime/OpenCodeRuntime'
import { ScriptedRuntime } from '../ScriptedRuntime'
import { refuseContainerInDemo } from '../noContainers'
import { runtimeCheck } from '../../../server/hq/runtimeCheck'

afterEach(() => { vi.unstubAllEnvs(); exec.mockReset() })

describe('with DEMO_MODE set @SC-1990', () => {
  it('selectRuntime gives the scripted runtime whatever name hq sent, even an unknown one', () => {
    vi.stubEnv('DEMO_MODE', 'true')
    for (const name of ['claude-sdk', 'opencode', 'native', '']) expect(selectRuntime(name)).toBeInstanceOf(ScriptedRuntime)
  })

  it('no docker command is ever started', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    await expect(docker(['ps'])).rejects.toThrow(/no containers/)
    expect(exec).not.toHaveBeenCalled()
    expect(() => refuseContainerInDemo()).toThrow()
  })

  it('the runtime check reports the scripted runtime without asking Docker', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const asked = vi.fn()
    const check = await runtimeCheck({ docker: asked, image: 'img' })
    expect(asked).not.toHaveBeenCalled()
    expect(check.containerRuntime).toBe('available')
  })
})

describe('with DEMO_MODE off or not exactly "true" @SC-1992', () => {
  it.each([undefined, 'false', '1', 'TRUE', ''])('selectRuntime behaves as before (%s)', value => {
    if (value !== undefined) vi.stubEnv('DEMO_MODE', value)
    expect(selectRuntime('claude-sdk')).toBeInstanceOf(ClaudeSDKRuntime)
    expect(selectRuntime('opencode')).toBeInstanceOf(OpenCodeRuntime)
    expect(() => selectRuntime('native')).toThrow(/Unknown agent runtime/)
    expect(() => refuseContainerInDemo()).not.toThrow()
  })

  it('docker still runs its command', async () => {
    exec.mockImplementation((_cmd: string, _args: string[], cb: (e: Error | null, o: string, s: string) => void) => cb(null, 'out', ''))
    await expect(docker(['ps'])).resolves.toEqual({ stdout: 'out', stderr: '' })
    expect(exec).toHaveBeenCalledOnce()
  })

  it('the runtime check still asks Docker', async () => {
    const asked = vi.fn().mockResolvedValue({ stdout: '27.0', stderr: '' })
    await runtimeCheck({ docker: asked, image: 'img' })
    expect(asked).toHaveBeenCalled()
  })
})
