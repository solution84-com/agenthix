import { describe, expect, it } from 'vitest'
import { fileRefName, readFileRef, SITE_FILE_SPACES } from '../refs.js'
import { isUploadPath, mayBeShownBeforeSignIn, UPLOAD_PATH_PATTERNS } from '../uploadPaths.js'

const place = { space: 'place', loc: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }, path: 'reports/q3.pdf' }
const artefact = { space: 'artefact', owner: { ownerType: 'user', ownerId: 'u1' }, name: 'summary.md' }
const knowledge = { space: 'knowledge', owner: { ownerType: 'org', ownerId: 'org' }, path: 'processes/release.md', versionId: 'v3' }
const upload = { space: 'upload', path: '/files/task/t1/a1/notes.txt' }

describe('a file is named in one of four spaces @SC-1452', () => {
  it('reads each space back as it was named', () => {
    for (const ref of [place, artefact, knowledge, upload]) expect(readFileRef(ref), ref.space).toEqual(ref)
    expect(readFileRef({ ...knowledge, versionId: undefined })).toEqual({ space: 'knowledge', owner: knowledge.owner, path: knowledge.path })
  })

  it('keeps only the fields its space names', () => {
    expect(readFileRef({ ...place, name: 'x', owner: artefact.owner })).toEqual(place)
  })

  it('serves three spaces from a site; uploads are hq\'s own', () => {
    expect(SITE_FILE_SPACES).toEqual(['place', 'artefact', 'knowledge'])
  })

  it('refuses a file of the wrong shape, in every space', () => {
    for (const bad of [
      null, 'reports/q3.pdf', {}, { ...place, space: 'elsewhere' }, { ...place, space: undefined },
      { ...place, loc: { ownerType: 'org', ownerId: 'o' } }, { ...place, loc: { ownerType: 'project', ownerId: 'p', workspaceId: 'w', taskId: 't' } },
      { ...place, path: '' }, { ...place, path: 'a\0b' }, { ...place, path: '../outside' }, { ...place, path: 'a/../../b' },
      { ...place, path: 'a\\..\\b' }, { ...place, path: 'x'.repeat(4097) },
      { ...artefact, name: 'sub/summary.md' }, { ...artefact, name: '..' }, { ...artefact, name: '.' }, { ...artefact, name: 'a\\b' },
      { ...artefact, owner: { ownerType: 'org', ownerId: 'org' } }, { ...artefact, owner: undefined },
      { ...knowledge, owner: { ownerType: 'team', ownerId: 't' } }, { ...knowledge, path: '../secrets.md' },
      { ...knowledge, versionId: 7 }, { ...knowledge, versionId: '' },
      { ...upload, path: '/files/task/t1/../../../etc/passwd' }, { ...upload, path: '/etc/passwd' },
    ]) {
      expect(readFileRef(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('gives each file the name a person sees', () => {
    expect(fileRefName(place as never)).toBe('q3.pdf')
    expect(fileRefName(artefact as never)).toBe('summary.md')
    expect(fileRefName(knowledge as never)).toBe('release.md')
    expect(fileRefName(upload as never)).toBe('notes.txt')
  })
})

describe('the uploads hq keeps, named by path @SC-1453', () => {
  it('admits each kind of upload hq keeps', () => {
    for (const path of [
      '/files/task/t1/a1/notes.txt', '/files/task/t1/a1/sub/dir/notes.txt', '/agents/a1/images/face.png',
      '/people/u1/images/me.webp', '/org/images/logo.svg', '/teams/t1/images/crest.png',
    ]) expect(isUploadPath(path), path).toBe(true)
    expect(UPLOAD_PATH_PATTERNS).toHaveLength(5)
  })

  it('refuses any other path, and any that steps out of its folder', () => {
    for (const path of [
      '', '/', 'files/task/t1/a1/notes.txt', '/files/task/t1/notes.txt', '/agents/a1/images/sub/face.png',
      '/files/task/../a1/notes.txt', '/files/task/t1/a1/../../../../etc/passwd', '/files/task/t1/./a1/x',
      '/files/task/t1/a1//x', '/org/images/..', '/org/images/.', '/org/images/a\0b', '/org/images/a\\..\\b',
      '/org/images/logo.svg?x=1#y'.replace('?x=1#y', '\n'), '/data/files/task/t1/a1/x', '/teams/t1/images/',
    ]) expect(isUploadPath(path), JSON.stringify(path)).toBe(false)
  })

  it('names the pictures the sign-in page may show', () => {
    expect(mayBeShownBeforeSignIn('/org/images/logo.svg')).toBe(true)
    expect(mayBeShownBeforeSignIn('/people/u1/images/me.webp')).toBe(false)
    expect(mayBeShownBeforeSignIn('/org/images/../x')).toBe(false)
  })
})
