import { describe, it, expect, vi } from 'vitest'
import { HttpError } from 'wasp/server'
import type { FileAboutResult, SiteFileRef } from '@agenthix/core'
import { fileFacts } from '../fileFacts'
import { OpenRefused, type OpenFileDeps, type SiteAndRelay } from '../openFile'

const loc = (ownerId: string) => ({ ownerType: 'project', ownerId, workspaceId: null, taskId: null }) as const
const place = (path: string, ownerId = 'p1'): SiteFileRef => ({ space: 'place', loc: loc(ownerId), path })
const about = (name: string): FileAboutResult =>
  ({ ok: true, name, size: 120, modifiedAt: '2026-10-26T10:00:00.000Z', version: '120:1793008800000', contentType: 'text/plain', looksLikeText: true })
const held: SiteAndRelay = { siteId: 'site-1', siteName: 'office-server', relay: null }
const pathOf = (r: SiteFileRef) => (r.space === 'place' ? r.path : '')

function deps(over: Partial<OpenFileDeps> = {}) {
  const issue = vi.fn()
  const about$ = vi.fn(async (_site: string, r: SiteFileRef) => about(pathOf(r).split('/').pop()!))
  const d: OpenFileDeps = {
    checkAccess: async r => r,
    siteFor: async r => (r.space === 'place' && r.loc.ownerId === 'p2' ? 'site-2' : 'site-1'),
    siteAndRelay: async siteId => ({ ...held, siteId }),
    isRelayConnected: () => false,
    about: about$,
    browserAddressOf: () => null,
    issue,
    ...over,
  }
  return { d, issue, about: d.about === about$ ? about$ : null }
}

describe("a chip's facts @SC-1515", () => {
  it('answers each file\'s facts with the kind core chooses, signing nothing and asking no relay', async () => {
    const { d, issue } = deps()
    const answers = await fileFacts([place('docs/plan.md'), place('src/main.py')], 'u1', d)
    expect(answers).toEqual([
      { state: 'ready', facts: { name: 'plan.md', size: 120, version: '120:1793008800000', contentType: 'text/markdown', kind: 'markdown' } },
      { state: 'ready', facts: expect.objectContaining({ name: 'main.py', kind: 'code', language: 'python' }) },
    ])
    expect(issue).not.toHaveBeenCalled()
  })

  it('answers not-found when the person may not read the file, without asking its site', async () => {
    const { d, about } = deps({
      checkAccess: async r => { if (pathOf(r) === 'secret.md') throw new OpenRefused('not-found'); return r },
    })
    const answers = await fileFacts([place('secret.md'), place('plan.md')], 'u1', d)
    expect(answers.map(a => a.state)).toEqual(['not-found', 'ready'])
    expect(about!.mock.calls.map(c => pathOf(c[1]))).toEqual(['plan.md'])
  })

  it('answers gone when the site says the file is not there; a folder of a place as a folder', async () => {
    const { d } = deps({
      about: async (_s, r) => {
        if (pathOf(r) === 'gone.md') return { ok: false, refusal: 'not-found' }
        if (pathOf(r) === 'folder') return { ok: false, refusal: 'not-a-file' }
        if (pathOf(r) === 'moved.md') throw new OpenRefused('not-found')
        return about('plan.md')
      },
    })
    const answers = await fileFacts([place('gone.md'), place('folder'), place('moved.md'), place('plan.md')], 'u1', d)
    expect(answers.map(a => a.state)).toEqual(['gone', 'folder', 'gone', 'ready'])
  })

  it('answers gone for an artefact that is not a file: only a place has folders a chip opens', async () => {
    const { d } = deps({ about: async () => ({ ok: false, refusal: 'not-a-file' }) })
    const artefact: SiteFileRef = { space: 'artefact', owner: { ownerType: 'project', ownerId: 'p1' }, name: 'x' }
    expect((await fileFacts([artefact], 'u1', d)).map(a => a.state)).toEqual(['gone'])
  })

  it('answers not-found for every file of a site hq no longer knows', async () => {
    const { d, about } = deps({ siteAndRelay: async siteId => (siteId === 'site-2' ? null : { ...held, siteId }) })
    const answers = await fileFacts([place('a.md', 'p2'), place('b.md'), place('c.md', 'p2')], 'u1', d)
    expect(answers.map(a => a.state)).toEqual(['not-found', 'ready', 'not-found'])
    expect(about!.mock.calls.map(c => c[0])).toEqual(['site-1'])
  })

  it('asks after each site once, and stops asking a site that does not answer', async () => {
    const asked: string[] = []
    const looked: string[] = []
    const { d } = deps({
      siteAndRelay: async siteId => { looked.push(siteId); return { ...held, siteId } },
      about: async (siteId, r) => {
        asked.push(`${siteId}:${pathOf(r)}`)
        if (siteId === 'site-2') throw new OpenRefused('site-unavailable')
        return about('x.md')
      },
    })
    const refs = [...Array.from({ length: 10 }, (_, i) => place(`${i}.md`, 'p2')), place('here.md')]
    const answers = await fileFacts(refs, 'u1', d)
    expect(answers.slice(0, 10).every(a => a.state === 'site-unavailable')).toBe(true)
    expect(answers[10].state).toBe('ready')
    expect(looked.sort()).toEqual(['site-1', 'site-2'])
    expect(asked.filter(a => a.startsWith('site-2')).length).toBeLessThan(10)
  })

  it('answers a refusal from the site as not-found and any other failure as unavailable', async () => {
    const { d } = deps({
      about: async (_s, r) => {
        if (pathOf(r) === 'refused.md') throw new HttpError(403, 'refused')
        if (pathOf(r) === 'broken.md') throw new Error('boom')
        return about('ok.md')
      },
    })
    const answers = await fileFacts([place('refused.md'), place('broken.md'), place('ok.md')], 'u1', d)
    expect(answers.map(a => a.state)).toEqual(['not-found', 'site-unavailable', 'ready'])
  })

  it('answers site-unavailable when the site holding a file cannot be found', async () => {
    const { d } = deps({ siteFor: async () => { throw new OpenRefused('site-unavailable') } })
    expect(await fileFacts([place('a.md')], 'u1', d)).toEqual([{ state: 'site-unavailable' }])
  })

  it('still refuses the whole request when the person is not signed in', async () => {
    const { d } = deps({ checkAccess: async () => { throw new HttpError(401, 'Not authenticated') } })
    await expect(fileFacts([place('a.md')], 'u1', d)).rejects.toMatchObject({ statusCode: 401 })
  })
})
