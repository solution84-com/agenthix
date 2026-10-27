import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StateFolder } from '../folder'
import { installSecrets } from '../secrets'

const dirs: string[] = []
function folder(): StateFolder {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-secrets-'))
  dirs.push(dir)
  const state = new StateFolder(path.join(dir, 'state'))
  state.prepare()
  return state
}
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

describe('the install secrets @SC-1595', () => {
  it("makes the relay's secret long enough for the relay to accept it (adr-0153)", () => {
    expect(installSecrets(folder()).relaySecret.length).toBeGreaterThanOrEqual(32)
  })

  it('never replaces a secret it made, and adds the relay’s to a file written without one', () => {
    const state = folder()
    const first = installSecrets(state)
    expect(installSecrets(state)).toEqual(first)
    const { relaySecret: _gone, ...older } = first
    state.writeJson(['secrets.json'], older)
    const again = installSecrets(state)
    expect(again).toMatchObject(older)
    expect(again.relaySecret.length).toBeGreaterThanOrEqual(32)
  })
})
