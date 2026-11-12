/**
 * What the picker holds while someone chooses (generated avatars and covers spec, *The picker*): for each tab, whether
 * it generates or uploads, the look being made, a chosen file and its crop, and a removal. Nothing changes until Save,
 * which sends `changesOf`; Cancel drops it all. Pure, so every rule of the dialog is tested here.
 */
import type { PictureKind, PictureRecipe, SubjectKind } from '../recipe'
import type { CropRect } from '../upload/sizing'

export type PickerTab = PictureKind
export type PictureSource = 'generate' | 'upload'

/** Where the frame sits on a picture, as percentages of its width and height (for the preview). */
export type CropArea = CropRect

/** A file chosen in Upload: its address in the browser (an object URL), and the frame placed on it. */
export interface UploadDraft {
  file: File
  url: string
  /** The frame in the picture's own pixels, for the cut; null until it has been placed. */
  crop: CropRect | null
  area: CropArea | null
}

/** A picture as it is saved now. A url without a recipe is an upload. */
export interface SavedPicture {
  url: string | null
  recipe: PictureRecipe | null
}

export interface TabState {
  source: PictureSource
  /** The generated look shown in Generate; the saved one, or a fresh default, until someone changes it. */
  draft: PictureRecipe | null
  /** The draft differs from what is saved, so Save sends it. */
  touched: boolean
  upload: UploadDraft | null
  /** Back to initials: a person's avatar only. */
  removed: boolean
}

export interface PickerState {
  tab: PickerTab
  /** The Avatar tab's two views: the gallery of looks, or one look's fine-tuning. */
  view: 'gallery' | 'tune'
  avatar: TabState
  cover: TabState
  /** Each tab as it opened, for Start again. */
  opened: { avatar: TabState; cover: TabState }
}

/** What the preview shows for a tab. */
export type Shown =
  | { type: 'saved'; url: string }
  | { type: 'recipe'; recipe: PictureRecipe }
  | { type: 'upload'; url: string; area: CropArea | null }
  | { type: 'none' }

/** One picture's change on Save; an upload is still the file, cropped and compressed when Save is pressed. */
export type PictureEdit = { recipe: PictureRecipe } | { upload: UploadDraft } | { remove: true }

export const isUpload = (saved: SavedPicture): boolean => saved.url !== null && saved.recipe === null

function openedTab(saved: SavedPicture, fallback: PictureRecipe | null): TabState {
  return { source: isUpload(saved) ? 'upload' : 'generate', draft: saved.recipe ?? fallback, touched: false, upload: null, removed: false }
}

/**
 * The picker as it opens: each tab on what is saved; a tab with no generated look gets `fallback` (the subject's
 * default) as its draft, so Remove upload has a generated picture to go back to.
 */
export function openPicker(
  saved: { avatar: SavedPicture; cover: SavedPicture },
  fallback: { avatar: PictureRecipe | null; cover: PictureRecipe | null },
  tab: PickerTab = 'avatar',
  fineTuneOnly = false,
): PickerState {
  const avatar = openedTab(saved.avatar, fallback.avatar)
  const cover = openedTab(saved.cover, fallback.cover)
  return { tab, view: fineTuneOnly ? 'tune' : 'gallery', avatar, cover, opened: { avatar, cover } }
}

export function shownOf(tab: TabState, saved: SavedPicture): Shown {
  if (tab.removed) return { type: 'none' }
  if (tab.source === 'upload' && tab.upload) return { type: 'upload', url: tab.upload.url, area: tab.upload.area }
  if (tab.source === 'generate' && tab.draft && (tab.touched || !saved.url)) return { type: 'recipe', recipe: tab.draft }
  return saved.url ? { type: 'saved', url: saved.url } : { type: 'none' }
}

export function changeOf(tab: TabState, saved: SavedPicture): PictureEdit | null {
  if (tab.removed) return saved.url ? { remove: true } : null
  if (tab.source === 'upload') return tab.upload ? { upload: tab.upload } : null
  // A picture with no file yet (a new agent's) is the draft the preview shows.
  return tab.draft && (tab.touched || !saved.url) ? { recipe: tab.draft } : null
}

/** What Save sends: only the pictures that changed. */
export function changesOf(state: PickerState, saved: { avatar: SavedPicture; cover: SavedPicture }): { avatar?: PictureEdit; cover?: PictureEdit } {
  const avatar = changeOf(state.avatar, saved.avatar)
  const cover = changeOf(state.cover, saved.cover)
  return { ...(avatar ? { avatar } : {}), ...(cover ? { cover } : {}) }
}

/** Remove, as the spec's table has it: its label, whether there is anything to remove, and why not. */
export function removeOf(state: PickerState, subject: SubjectKind, saved: SavedPicture): { label: string; enabled: boolean; why: string } {
  const tab = state[state.tab]
  const shown = shownOf(tab, saved)
  if (state.tab === 'avatar' && subject === 'person') {
    return { label: 'Remove picture', enabled: shown.type !== 'none', why: 'No picture: their initials are shown.' }
  }
  const uploaded = shown.type === 'upload' || (shown.type === 'saved' && isUpload(saved))
  return {
    label: 'Remove upload',
    enabled: uploaded,
    why: `A generated ${state.tab} is always there; there is nothing to remove.`,
  }
}

export type PickerAction =
  | { type: 'tab'; tab: PickerTab }
  | { type: 'view'; view: PickerState['view'] }
  | { type: 'source'; source: PictureSource }
  | { type: 'draft'; recipe: PictureRecipe }
  | { type: 'upload'; upload: UploadDraft | null }
  | { type: 'crop'; crop: CropRect; area: CropArea }
  | { type: 'mirror' }
  | { type: 'remove'; subject: SubjectKind }
  | { type: 'startAgain' }

function onTab(state: PickerState, change: (tab: TabState) => TabState): PickerState {
  return { ...state, [state.tab]: change(state[state.tab]) }
}

/** Whether a look can be mirrored: its style keeps a `flip` choice. */
export const canMirror = (recipe: PictureRecipe | null): boolean => recipe !== null && typeof recipe.choices.flip === 'boolean'

export function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case 'tab':
      return { ...state, tab: action.tab }
    case 'view':
      return { ...state, view: action.view }
    case 'source':
      return onTab(state, t => ({ ...t, source: action.source }))
    case 'draft':
      return onTab(state, t => ({ ...t, source: 'generate', draft: action.recipe, touched: true, removed: false }))
    case 'upload':
      return onTab(state, t => ({ ...t, source: 'upload', upload: action.upload, removed: action.upload ? false : t.removed }))
    case 'crop':
      return onTab(state, t => (t.upload ? { ...t, upload: { ...t.upload, crop: action.crop, area: action.area } } : t))
    case 'mirror':
      return onTab(state, t => (canMirror(t.draft) && t.draft
        ? { ...t, source: 'generate', touched: true, removed: false, draft: { ...t.draft, choices: { ...t.draft.choices, flip: !t.draft.choices.flip } } }
        : t))
    case 'remove':
      if (state.tab === 'avatar' && action.subject === 'person') {
        return onTab(state, t => ({ ...t, upload: null, touched: false, removed: true }))
      }
      // Back to the generated picture: the draft (the saved look, or the subject's default) becomes what Save sends.
      // Over a saved generated picture only the chosen file goes; over a saved upload, the draft must be sent.
      return onTab(state, t => ({
        ...t, source: 'generate', upload: null,
        touched: t.draft !== null && (t.touched || state.opened[state.tab].source === 'upload'),
      }))
    case 'startAgain':
      return onTab(state, () => state.opened[state.tab])
  }
}
