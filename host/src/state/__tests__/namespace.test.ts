import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StateFolder } from '../folder'
import { namesFor, recordNamespace } from '../namespace'

let dir: string
let state: StateFolder

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-ns-'))
  state = new StateFolder(path.join(dir, 'state'))
  state.prepare()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('the recorded namespace @SC-821', () => {
  it('is recorded on first start, from the current default, in a private file', () => {
    expect(recordNamespace(state, 'agenthix', new Date('2026-10-14T00:00:00Z'))).toBe('agenthix')
    const file = state.path('namespace.json')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ namespace: 'agenthix', recordedAt: '2026-10-14T00:00:00.000Z' })
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  })

  it('is read back afterwards, whatever the code now calls the product', () => {
    recordNamespace(state, 'agenthix')
    expect(recordNamespace(state, 'renamed')).toBe('agenthix')
  })

  it('is never overwritten when the record is not one the host service reads', () => {
    fs.writeFileSync(state.path('namespace.json'), JSON.stringify({ namespace: 'Not Valid!' }))
    expect(() => recordNamespace(state, 'agenthix')).toThrow(/namespace/)
    expect(JSON.parse(fs.readFileSync(state.path('namespace.json'), 'utf8'))).toEqual({ namespace: 'Not Valid!' })
  })

  it('refuses a default that is not a usable Docker name', () => {
    expect(() => recordNamespace(state, 'Bad Name')).toThrow()
  })
})

describe('names derived from the namespace @SC-821 @SC-1155', () => {
  it('derives every stored name from the record alone', () => {
    const n = namesFor('acme')
    expect(n.hqProject).toBe('acme-hq')
    expect(n.siteProject).toBe('acme-site')
    expect(n.container('hq-server')).toBe('acme-hq-server')
    expect(n.siteContainer).toBe('acme-site-server')
    expect([n.hostContainer, n.launcherContainer, n.previousHostContainer]).toEqual(['acme-host', 'acme-host-launcher', 'acme-host-previous'])
    expect([n.hostProject, n.agentsProject, n.consoleProject]).toEqual(['acme-host', 'acme-agents', 'acme-console'])
    expect([n.hqNetwork, n.siteNetwork, n.edgeNetwork, n.hqLinkNetwork, n.consoleNetwork])
      .toEqual(['acme-hq-internal', 'acme-site-internal', 'acme-edge', 'acme-hq-link', 'acme-console'])
    expect([n.hqDbVolume, n.hqStorageVolume, n.siteDbVolume, n.consoleStateVolume, n.hostFiguresVolume])
      .toEqual(['acme-hq-db-data', 'acme-hq-storage', 'acme-site-db-data', 'acme-console-state', 'acme-host-figures'])
    expect(n.label('role')).toBe('acme.role')
    expect(n.hqDatabase).toBe('acme_hq')
    expect(n.siteDatabase).toBe('acme_site')
  })

  it('gives a new install the names of the spec’s table', () => {
    const n = namesFor('agenthix')
    expect([n.hostContainer, n.container('hq-server'), n.container('hq-db'), n.siteContainer, n.container('site-db'), n.consoleContainer])
      .toEqual(['agenthix-host', 'agenthix-hq-server', 'agenthix-hq-db', 'agenthix-site-server', 'agenthix-site-db', 'agenthix-console'])
    expect([n.hqDatabase, n.siteDatabase]).toEqual(['agenthix_hq', 'agenthix_site'])
  })

  it("sorts the Fleet Console's network before HQ's link network, whatever the namespace, so its route out is its own", () => {
    for (const ns of ['agenthix', 'acme', 'a', 'z-9']) {
      const n = namesFor(ns)
      expect([n.hqLinkNetwork, n.consoleNetwork].sort()[0]).toBe(n.consoleNetwork)
    }
  })

  it('uses underscores in database names, as Postgres prefers', () => {
    expect(namesFor('my-org').hqDatabase).toBe('my_org_hq')
    expect(namesFor('my-org').siteDatabase).toBe('my_org_site')
  })

  it('carries nothing of the code’s branding when the namespace differs', () => {
    const all = JSON.stringify({ ...namesFor('other'), c: namesFor('other').container('x'), l: namesFor('other').label('y') })
    expect(all).not.toMatch(/agenthix/)
  })
})
