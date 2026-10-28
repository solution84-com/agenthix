import { describe, expect, it } from 'vitest'
import { publishBlock, saveStatus } from '../editorWords'

const saving = { dirty: false, saving: false, failed: null, moved: false, revision: 2 }
const publish = { mayPublish: true, place: false, dirty: false, saving: false, failed: null, moved: false, nothing: false, blocked: false, inUse: '1.0.0' }

describe('the draft saving itself, in words (finding 8)', () => {
  it('says Saving… while a change waits or is being saved, Saved once it is, and why it could not be', () => {
    expect(saveStatus({ ...saving, dirty: true })).toBe('Saving…')
    expect(saveStatus({ ...saving, saving: true })).toBe('Saving…')
    expect(saveStatus(saving)).toBe('Saved')
    expect(saveStatus({ ...saving, dirty: true, failed: 'The site is unreachable.' })).toBe('Couldn’t save: The site is unreachable.')
    expect(saveStatus({ ...saving, dirty: true, moved: true })).toMatch(/^Not saved: the draft changed/)
    expect(saveStatus({ ...saving, revision: null })).toBe('No changes yet')
  })
})

describe('Publish says why it can’t be used', () => {
  it('is available only with a saved change that passes the checks, by someone who may publish', () => {
    expect(publishBlock(publish)).toBeNull()
  })

  it('names who may publish when the person may not', () => {
    expect(publishBlock({ ...publish, mayPublish: false })).toBe('Publishing is for administrators and Library maintainers.')
    expect(publishBlock({ ...publish, mayPublish: false, place: true })).toBe('Publishing is for this place’s administrators.')
  })

  it('waits for a pending save, so it never publishes a revision the person did not see', () => {
    expect(publishBlock({ ...publish, dirty: true })).toMatch(/once they are saved/)
    expect(publishBlock({ ...publish, saving: true })).toMatch(/once they are saved/)
    expect(publishBlock({ ...publish, dirty: true, failed: 'x' })).toMatch(/isn’t saved/)
    expect(publishBlock({ ...publish, moved: true, dirty: true })).toMatch(/draft changed while you were editing/)
  })

  it('says nothing changed since the version in use, and that the checks fail', () => {
    expect(publishBlock({ ...publish, nothing: true })).toBe('Nothing has changed since version 1.0.0, the version in use.')
    expect(publishBlock({ ...publish, nothing: true, place: true, inUse: '3' })).toBe('Nothing has changed since version 3, the newest version.')
    expect(publishBlock({ ...publish, nothing: true, inUse: null })).toBe('There is nothing to publish yet.')
    expect(publishBlock({ ...publish, blocked: true })).toBe('Fix the problems the checks found first.')
  })
})
