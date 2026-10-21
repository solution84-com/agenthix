import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkLandlockAtStartup, requireLandlock, resetLandlockCheckForTests } from '../landlockCheck'

beforeEach(() => resetLandlockCheckForTests())

const answering = (stdout: string) => vi.fn(async (_args: string[], _timeoutMs: number) => ({ stdout, stderr: '' }))

describe('the Landlock check', () => {
  it('lets commands run on ABI 6 and later, asking the launcher in the container once', async () => {
    const docker = answering('8\n')
    await requireLandlock('agent-1', docker)
    await requireLandlock('agent-2', docker)
    expect(docker).toHaveBeenCalledTimes(1)
    expect(docker.mock.calls[0][0]).toEqual(['exec', 'agent-1', '/usr/local/lib/agenthix/bin/agenthix-contain', '--abi'])
  })

  it('refuses below ABI 6, and with no Landlock at all', async () => {
    await expect(requireLandlock('agent-1', answering('5'))).rejects.toThrow(/Landlock ABI 5; 6 or later is needed/)
    resetLandlockCheckForTests()
    await expect(requireLandlock('agent-1', answering('0'))).rejects.toThrow(/Landlock ABI 0/)
  })

  it('refuses when it cannot tell, rather than assuming', async () => {
    await expect(requireLandlock('agent-1', answering('oops'))).rejects.toThrow(/gave no Landlock ABI/)
    await expect(requireLandlock('agent-1', vi.fn(async () => { throw new Error('daemon down') }))).rejects.toThrow(/daemon down/)
  })

  it('asks at startup from a throwaway container with no network, and remembers the answer', async () => {
    const docker = answering('6')
    await checkLandlockAtStartup(docker)
    expect(docker.mock.calls[0][0]).toEqual(['run', '--rm', '--network', 'none', 'agenthix-agent', '/usr/local/lib/agenthix/bin/agenthix-contain', '--abi'])
    const later = answering('0')
    await requireLandlock('agent-1', later)
    expect(later).not.toHaveBeenCalled()
  })

  it('never throws at startup, and asks again later when startup could not', async () => {
    await expect(checkLandlockAtStartup(vi.fn(async () => { throw new Error('no image') }))).resolves.toBeUndefined()
    const later = answering('7')
    await requireLandlock('agent-1', later)
    expect(later).toHaveBeenCalledTimes(1)
  })

  it('remembers a kernel that is too old, and refuses every later command', async () => {
    await checkLandlockAtStartup(answering('4'))
    await expect(requireLandlock('agent-1', answering('8'))).rejects.toThrow(/ABI 4/)
  })
})
