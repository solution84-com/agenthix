// @vitest-environment node
/** The gate's channel methods: what they take on the wire, and what a refusal may say. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { LOCATION_FILE_METHODS, LocationFileError } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { channelMethods } from '../../hq/channelMethods'
import { knowledgePagesDir } from '../../storage/paths'
import { org, page, project, useSiteRoot } from './knowledgeFixtures'

const site = useSiteRoot()
beforeEach(site.setUp)
afterEach(site.tearDown)

const call = (method: keyof typeof channelMethods, params: unknown) => channelMethods[method](params)
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as LocationFileError)

describe('the knowledge change methods on the channel @SC-1390', () => {
  it('write, edit, list versions, restore and delete through the gate', async () => {
    const made = await call(LOCATION_FILE_METHODS.writeKnowledge, { ...project, page: 'a.md', content: page('A'), baseVersion: null })
    expect(made).toMatchObject({ outcome: 'done', change: 'created' })
    const edited = await call(LOCATION_FILE_METHODS.editKnowledge, { ...project, page: 'a.md', old_string: 'Thursdays', new_string: 'Fridays' }) as { previousVersionId: string }
    expect(edited).toMatchObject({ outcome: 'done', change: 'edited' })
    const history = await call(LOCATION_FILE_METHODS.knowledgeVersions, { ...project, page: 'a.md' })
    expect(history).toMatchObject({ truncated: false, versions: [{ id: edited.previousVersionId }] })
    expect(await call(LOCATION_FILE_METHODS.restoreKnowledge, { ...project, page: 'a.md', versionId: edited.previousVersionId }))
      .toMatchObject({ outcome: 'done', change: 'restored' })
    expect(await call(LOCATION_FILE_METHODS.deleteKnowledge, { ...project, page: 'a.md' })).toMatchObject({ outcome: 'done', change: 'deleted' })
    expect(await call(LOCATION_FILE_METHODS.knowledgeVersions, project)).toMatchObject({ versions: [{ page: 'a.md', deleted: true }] })
  })

  it("serves the organisation's knowledge by its one id, and refuses any other", async () => {
    expect(await call(LOCATION_FILE_METHODS.writeKnowledge, { ...org, page: 'a.md', content: page('A'), baseVersion: null }))
      .toMatchObject({ outcome: 'done' })
    const err = await failure(call(LOCATION_FILE_METHODS.writeKnowledge, { ownerType: 'org', ownerId: '../x', page: 'a.md', content: page('A'), baseVersion: null }))
    expect(err?.code).toBe('invalid')
  })

  it('refuses a malformed call as invalid: an empty passage, a kept version without permanently, a permanent move', async () => {
    for (const [method, params] of [
      [LOCATION_FILE_METHODS.editKnowledge, { ...project, page: 'a.md', old_string: '', new_string: 'x' }],
      [LOCATION_FILE_METHODS.deleteKnowledge, { ...project, page: 'a.md', versionId: '20261025T120000000Z-0123abcd' }],
      [LOCATION_FILE_METHODS.deleteKnowledge, { ...project, page: 'a.md', permanently: true, movedTo: 'b.md' }],
      [LOCATION_FILE_METHODS.restoreKnowledge, { ...project, page: 'a.md', versionId: '../../a' }],
      [LOCATION_FILE_METHODS.writeKnowledge, { ...project, page: 'a.md', content: 'x' }],
      [LOCATION_FILE_METHODS.writeKnowledge, null],
    ] as const) {
      expect((await failure(call(method, params)))?.code).toBe('invalid')
    }
  })

  it('refuses a name through a link as outside, naming no path on this disk', async () => {
    await fs.mkdir(knowledgePagesDir(project), { recursive: true })
    await fs.symlink(site.outside(), path.join(knowledgePagesDir(project), 'escape'))
    const err = await failure(call(LOCATION_FILE_METHODS.writeKnowledge, { ...project, page: 'escape/x.md', content: page('x'), baseVersion: null }))
    expect(err).toBeInstanceOf(LocationFileError)
    expect(err?.code).toBe('outside')
    expect(err?.message).not.toContain(site.root())
    expect(err?.message).not.toContain(site.outside())
    expect(await fs.readdir(site.outside())).toEqual([])
  })

  it('answers a refusal with its reason rather than failing the call', async () => {
    const result = await call(LOCATION_FILE_METHODS.writeKnowledge, { ...project, page: '../x.md', content: page('x'), baseVersion: null })
    expect(result).toMatchObject({ outcome: 'refused', reason: 'problems' })
  })
})
