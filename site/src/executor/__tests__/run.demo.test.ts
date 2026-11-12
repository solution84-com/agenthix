import { afterEach, describe, expect, it, vi } from 'vitest'

const checkInstruction = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({ prisma: {} }))
vi.mock('../instruction', () => ({ checkInstruction }))

import { startRun } from '../run'

afterEach(() => { vi.unstubAllEnvs(); checkInstruction.mockReset() })

describe('starting a workflow in the demo', () => {
  it('is refused with the demo\'s sentence before the instruction is even read @SC-1990', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    expect(await startRun({})).toEqual({ accepted: false, reason: 'invalid_instruction', message: "The demo can't run workflows." })
    expect(checkInstruction).not.toHaveBeenCalled()
  })

  it('goes on as before with the setting off @SC-1992', async () => {
    checkInstruction.mockResolvedValue({ ok: false, reason: 'invalid_instruction', message: 'checked' })
    expect(await startRun({})).toEqual({ accepted: false, reason: 'invalid_instruction', message: 'checked' })
    expect(checkInstruction).toHaveBeenCalledOnce()
  })
})
