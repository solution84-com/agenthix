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

  it('refuses to make a new key for data that is already installed, and changes nothing', () => {
    const state = folder()
    const first = installSecrets(state)
    state.writeJson(['hq', 'settings.json'], { version: 'dev' })
    const { hqMasterKey: _gone, ...without } = first
    state.writeJson(['secrets.json'], without)
    expect(() => installSecrets(state)).toThrow(/hqMasterKey is missing from secrets\.json.*Nothing was changed\./)
    expect(state.readJson('secrets.json')).toEqual(without)
  })

  it('still adds a key that protects nothing stored, to an installed machine', () => {
    const state = folder()
    const { relaySecret: _gone, ...older } = installSecrets(state)
    state.writeJson(['site', 'settings.json'], { version: 'dev' })
    state.writeJson(['secrets.json'], older)
    expect(installSecrets(state).relaySecret.length).toBeGreaterThanOrEqual(32)
  })
})
