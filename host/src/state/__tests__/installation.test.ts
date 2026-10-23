import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StateFolder } from '../folder'
import { namesFor } from '../namespace'
import {
  installationLabels, nameMismatch, publishedPorts, readInstallation, recordedNamespace, recordPorts, startInstallation, type FirstStart,
} from '../installation'

let dir: string
let state: StateFolder

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-inst-'))
  state = new StateFolder(path.join(dir, 'state'))
  state.prepare()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const start = (over: Partial<FirstStart> = {}): FirstStart => ({
  asked: undefined, fallback: 'agenthix', ownName: async () => 'agenthix-host', now: new Date('2026-10-24T00:00:00Z'), ...over,
})
const file = () => state.path('installation.json')

describe("the installation's record @SC-821 @SC-1241", () => {
  it('is recorded on first start, from the default, in a private file, with nothing chosen yet', async () => {
    expect((await startInstallation(state, start())).namespace).toBe('agenthix')
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({
      namespace: 'agenthix', ports: { hq: null, console: null }, agentRange: null, recordedAt: '2026-10-24T00:00:00.000Z',
    })
    expect(fs.statSync(file()).mode & 0o777).toBe(0o600)
    expect(fs.existsSync(state.path('namespace.json'))).toBe(false)
  })

  it('takes the namespace from INSTALL_NAMESPACE when its docker run set one', async () => {
    const ns = await startInstallation(state, start({ asked: 'mobiletest', ownName: async () => 'mobiletest-host' }))
    expect(ns.namespace).toBe('mobiletest')
    expect(recordedNamespace(state)).toBe('mobiletest')
  })

  it('is read back afterwards, whatever the code now calls the product', async () => {
    await startInstallation(state, start())
    expect((await startInstallation(state, start({ fallback: 'renamed', ownName: async () => 'renamed-host' }))).namespace).toBe('agenthix')
  })

  it('refuses at its first start, recording nothing, when its container is not <namespace>-host', async () => {
    await expect(startInstallation(state, start({ ownName: async () => 'test-host' }))).rejects.toThrow(
      "This host service's container is test-host, but its namespace would be agenthix, whose container is agenthix-host. " +
      'To run another installation, set INSTALL_NAMESPACE=test and keep the name test-host. Nothing was recorded.',
    )
    expect(fs.existsSync(file())).toBe(false)
  })

  it('names the container it needs when the name fits no namespace', () => {
    expect(nameMismatch('my_host', 'agenthix')).toMatch(/Start it again named agenthix-host, or set INSTALL_NAMESPACE=<name>/)
    expect(nameMismatch('agenthix-host', 'agenthix')).toBeNull()
  })

  it('goes on unchecked when Docker cannot tell it its own name', async () => {
    expect((await startInstallation(state, start({ ownName: async () => null }))).namespace).toBe('agenthix')
  })

  it('refuses a namespace Docker cannot take, recording nothing', async () => {
    await expect(startInstallation(state, start({ asked: 'Bad Name' }))).rejects.toThrow(/cannot be an installation's namespace/)
    expect(fs.existsSync(file())).toBe(false)
  })

  it('refuses an INSTALL_NAMESPACE other than the one this state folder records', async () => {
    await startInstallation(state, start())
    await expect(startInstallation(state, start({ asked: 'other' }))).rejects.toThrow(/installation agenthix's, but INSTALL_NAMESPACE says other/)
  })

  it('is never overwritten when the record is not one the host service reads', async () => {
    fs.writeFileSync(file(), JSON.stringify({ namespace: 'Not Valid!' }))
    await expect(startInstallation(state, start())).rejects.toThrow(/installation/)
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({ namespace: 'Not Valid!' })
    expect(recordedNamespace(state)).toBeNull()
  })

  it('never reads the old namespace file', async () => {
    fs.writeFileSync(state.path('namespace.json'), JSON.stringify({ namespace: 'old', recordedAt: 'x' }))
    expect(recordedNamespace(state)).toBeNull()
    expect((await startInstallation(state, start())).namespace).toBe('agenthix')
  })
})

describe('the ports it records, and its labels @SC-1242 @SC-1248', () => {
  it('records each chosen port, keeping the rest', async () => {
    await startInstallation(state, start())
    recordPorts(state, { hq: 7800 })
    recordPorts(state, { console: 7801 })
    const inst = readInstallation(state)!
    expect(inst).toMatchObject({ namespace: 'agenthix', ports: { hq: 7800, console: 7801 }, agentRange: null, recordedAt: '2026-10-24T00:00:00.000Z' })
    expect(publishedPorts(inst)).toEqual([7800, 7801])
  })

  it('labels a container with the published ports, and the agent range once there is one', async () => {
    const inst = await startInstallation(state, start({ asked: 'acme', ownName: async () => 'acme-host' }))
    const names = namesFor('acme')
    expect(installationLabels(names, inst)).toEqual({})
    expect(installationLabels(names, { ...inst, ports: { hq: 7500, console: 7520 } })).toEqual({ 'acme.ports': '7500,7520' })
    expect(installationLabels(names, { ...inst, ports: { hq: null, console: 7801 }, agentRange: '10.213.16.0/20' }))
      .toEqual({ 'acme.ports': '7801', 'acme.agent-range': '10.213.16.0/20' })
  })
})
