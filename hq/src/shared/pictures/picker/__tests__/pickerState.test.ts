import { describe, it, expect } from 'vitest'
import type { PictureRecipe } from '../../recipe'
import { changesOf, openPicker, pickerReducer, removeOf, shownOf, type PickerState, type SavedPicture, type UploadDraft } from '../pickerState'

const recipe = (style: string, extra: Record<string, unknown> = {}): PictureRecipe =>
  ({ v: 1, kind: style === 'patterns' ? 'cover' : 'avatar', style, styleVersion: 1, choices: { background: 'teal', flip: false, ...extra } })
const upload: UploadDraft = { file: new File(['x'], 'me.png', { type: 'image/png' }), url: 'blob:me', crop: null, area: null }

const generated: SavedPicture = { url: '/agents/a/images/1.webp', recipe: recipe('thumbs') }
const uploaded: SavedPicture = { url: '/agents/a/images/2.webp', recipe: null }
const noPicture: SavedPicture = { url: null, recipe: null }
const coverSaved: SavedPicture = { url: '/agents/a/images/3.webp', recipe: recipe('patterns') }

const run = (state: PickerState, ...actions: Parameters<typeof pickerReducer>[1][]) => actions.reduce(pickerReducer, state)

describe('the picker before Save', () => {
  it('opens on what is saved and sends nothing until something changes', () => {
    const saved = { avatar: generated, cover: coverSaved }
    const state = openPicker(saved, { avatar: null, cover: null })
    expect(state.avatar.source).toBe('generate')
    expect(shownOf(state.avatar, generated)).toEqual({ type: 'saved', url: generated.url })
    expect(changesOf(state, saved)).toEqual({})
  })

  it('opens an uploaded picture on Upload, and a tab with nothing on the default it would get', () => {
    const fallback = recipe('robots', { robot: 'support' })
    const state = openPicker({ avatar: uploaded, cover: noPicture }, { avatar: fallback, cover: recipe('patterns') })
    expect(state.avatar.source).toBe('upload')
    expect(state.avatar.draft).toEqual(fallback)
    // A picture with no file yet is the draft the preview shows, and Save sends it.
    expect(shownOf(state.cover, noPicture)).toMatchObject({ type: 'recipe' })
    expect(changesOf(state, { avatar: uploaded, cover: noPicture })).toEqual({ cover: { recipe: recipe('patterns') } })
  })

  it('applies both tabs on Save: a new look for the avatar and a file for the cover', () => {
    const saved = { avatar: generated, cover: coverSaved }
    const look = recipe('notionists')
    const state = run(openPicker(saved, { avatar: null, cover: null }), { type: 'draft', recipe: look }, { type: 'tab', tab: 'cover' }, { type: 'upload', upload })
    expect(shownOf(state.avatar, generated)).toEqual({ type: 'recipe', recipe: look })
    expect(changesOf(state, saved)).toEqual({ avatar: { recipe: look }, cover: { upload } })
  })

  it('mirrors a look that can be mirrored, and Start again goes back to the saved picture', () => {
    const saved = { avatar: generated, cover: coverSaved }
    const mirrored = run(openPicker(saved, { avatar: null, cover: null }), { type: 'mirror' })
    expect(mirrored.avatar.draft?.choices.flip).toBe(true)
    expect(changesOf(mirrored, saved).avatar).toBeDefined()
    expect(changesOf(run(mirrored, { type: 'startAgain' }), saved)).toEqual({})
    const initials = run(openPicker({ avatar: { url: 'x', recipe: recipe('initials', { flip: undefined }) }, cover: coverSaved }, { avatar: null, cover: null }), { type: 'mirror' })
    expect(initials.avatar.touched).toBe(false)
  })
})

describe('Remove, as the spec\'s table has it', () => {
  it("takes a person's avatar back to their initials", () => {
    const saved = { avatar: { url: '/people/p/images/1.webp', recipe: recipe('lorelei') }, cover: coverSaved }
    const state = openPicker(saved, { avatar: null, cover: null })
    expect(removeOf(state, 'person', saved.avatar)).toMatchObject({ label: 'Remove picture', enabled: true })
    const after = run(state, { type: 'remove', subject: 'person' })
    expect(shownOf(after.avatar, saved.avatar)).toEqual({ type: 'none' })
    expect(changesOf(after, saved)).toEqual({ avatar: { remove: true } })
    expect(removeOf(after, 'person', saved.avatar)).toMatchObject({ enabled: false, why: 'No picture: their initials are shown.' })
  })

  it("takes an agent's uploaded avatar back to a generated one, which Save sends", () => {
    const fallback = recipe('robots', { robot: 'support' })
    const saved = { avatar: uploaded, cover: coverSaved }
    const state = openPicker(saved, { avatar: fallback, cover: null })
    expect(removeOf(state, 'agent', uploaded)).toMatchObject({ label: 'Remove upload', enabled: true })
    const after = run(state, { type: 'remove', subject: 'agent' })
    expect(shownOf(after.avatar, uploaded)).toEqual({ type: 'recipe', recipe: fallback })
    expect(changesOf(after, saved)).toEqual({ avatar: { recipe: fallback } })
  })

  it('has nothing to remove on a generated cover or an agent\'s generated avatar, and says why', () => {
    const saved = { avatar: generated, cover: coverSaved }
    const state = openPicker(saved, { avatar: null, cover: null })
    expect(removeOf(state, 'agent', generated)).toEqual({ label: 'Remove upload', enabled: false, why: 'A generated avatar is always there; there is nothing to remove.' })
    expect(removeOf(run(state, { type: 'tab', tab: 'cover' }), 'team', coverSaved)).toMatchObject({ enabled: false, why: expect.stringMatching(/generated cover/) })
  })

  it('drops a chosen file over a generated cover without sending the saved look again', () => {
    const saved = { avatar: generated, cover: coverSaved }
    const state = run(openPicker(saved, { avatar: null, cover: null }, 'cover'), { type: 'upload', upload })
    expect(removeOf(state, 'org', coverSaved).enabled).toBe(true)
    expect(changesOf(run(state, { type: 'remove', subject: 'org' }), saved)).toEqual({})
  })
})
