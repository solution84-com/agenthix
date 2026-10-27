import { describe, it, expect } from 'vitest'
import { HttpError } from 'wasp/server'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'
import { MAX_FILES_PER_OPEN, openFiles, readFileRefs } from '../openFiles'

const loc = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null } as const
const place = (path: string): SiteFileRef => ({ space: 'place', loc, path })

describe('opening several files at once @SC-1514', () => {
  it('answers each file in order, through the one open', async () => {
    const seen: string[] = []
    const open = async (ref: SiteFileRef, userId: string): Promise<FileOpenAnswer> => {
      seen.push(`${userId}:${ref.space === 'place' ? ref.path : ''}`)
      return ref.space === 'place' && ref.path === 'gone.png' ? { state: 'not-found' } : { state: 'site-unavailable' }
    }
    const answers = await openFiles([place('a.png'), place('gone.png'), place('b.png')], 'u1', open)
    expect(answers).toEqual([{ state: 'site-unavailable' }, { state: 'not-found' }, { state: 'site-unavailable' }])
    expect(seen.sort()).toEqual(['u1:a.png', 'u1:b.png', 'u1:gone.png'])
  })

  it('answers one file that throws as not found or unavailable, without failing the others', async () => {
    const open = async (ref: SiteFileRef): Promise<FileOpenAnswer> => {
      if (ref.space === 'place' && ref.path === 'bad.png') throw new HttpError(400, 'refused')
      if (ref.space === 'place' && ref.path === 'down.png') throw new Error('boom')
      return { state: 'not-found' }
    }
    const answers = await openFiles([place('bad.png'), place('down.png'), place('ok.png')], 'u1', open)
    expect(answers.map(a => a.state)).toEqual(['not-found', 'site-unavailable', 'not-found'])
  })

  it('still refuses the whole request when the person is not signed in', async () => {
    const open = async (): Promise<FileOpenAnswer> => { throw new HttpError(401, 'Not authenticated') }
    await expect(openFiles([place('a.png')], 'u1', open)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('opens at most a few at a time', async () => {
    let running = 0
    let most = 0
    const open = async (): Promise<FileOpenAnswer> => {
      running += 1
      most = Math.max(most, running)
      await new Promise(r => setTimeout(r, 1))
      running -= 1
      return { state: 'not-found' }
    }
    await openFiles(Array.from({ length: 20 }, (_, i) => place(`${i}.png`)), 'u1', open)
    expect(most).toBeLessThanOrEqual(6)
  })
})

describe('reading the files asked for @SC-1514', () => {
  it('reads files in a place, an artefact and knowledge, filling in the organisation\'s knowledge', () => {
    const refs = readFileRefs([
      { space: 'place', loc, path: 'charts/q3.png', extra: 'dropped' },
      { space: 'artefact', owner: { ownerType: 'user', ownerId: 'u1' }, name: 'out.csv' },
      { space: 'knowledge', owner: { ownerType: 'org' }, path: 'guides/pic.png' },
    ])
    expect(refs).toEqual([
      { space: 'place', loc, path: 'charts/q3.png' },
      { space: 'artefact', owner: { ownerType: 'user', ownerId: 'u1' }, name: 'out.csv' },
      { space: 'knowledge', owner: { ownerType: 'org', ownerId: 'org' }, path: 'guides/pic.png' },
    ])
  })

  it.each([
    ['not a list', 'x'],
    ['an empty list', []],
    ['too many files', Array.from({ length: MAX_FILES_PER_OPEN + 1 }, (_, i) => ({ space: 'place', loc, path: `${i}.png` }))],
    ['a path that steps up', [{ space: 'place', loc, path: '../secret.png' }]],
    ['an upload', [{ space: 'upload', path: 'avatars/a.png' }]],
  ])('refuses %s', (_, files) => {
    expect(() => readFileRefs(files)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})
