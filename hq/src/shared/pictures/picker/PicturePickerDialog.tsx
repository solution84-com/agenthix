/**
 * The picker's dialog (boards/picker.html, boards/picker-gallery.html): Avatar and Cover tabs, each Generate or
 * Upload, its own preview with Surprise me, Mirror, Start again and Remove, and Save, which applies both tabs, or
 * Cancel, which changes nothing. A failed Save is the attention dialog with Try again, the picker still open with its
 * choices.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { Button, Modal, SegmentedControl, useAttention } from '@agenthix/ui/primitives'
import { randomRecipe } from '../pictures'
import { freshSeed, intBetween, seededRng } from '../random'
import type { PictureContext, PictureRecipe } from '../recipe'
import { findStyle, stylesFor } from '../styles'
import { COVER_SEED_MAX } from '../styles/cover'
import { AvatarGallery } from './AvatarGallery'
import { AvatarTuning } from './AvatarTuning'
import { CoverControls } from './CoverControls'
import { PreviewCard } from './PreviewCard'
import { UploadPane } from './UploadPane'
import { canMirror, changesOf, pickerReducer, removeOf, shownOf, type PickerState } from './pickerState'
import { changesToSend, saveFailureWords } from './pickerSave'
import { savedOf, usePickerOpen } from './usePickerOpen'
import type { PicturePickerProps } from './types'

export default function PicturePickerDialog({ subject, saved, initialTab = 'avatar', onClose, save }: PicturePickerProps) {
  const { ctx, opened } = usePickerOpen(subject, saved, initialTab)
  return (
    <Modal open onClose={onClose} title={`${subject.name}'s picture`} closeLabel="Close" maxWidth="max-w-3xl">
      {opened
        ? <PickerBody ctx={ctx} opened={opened} subject={subject} saved={saved} onClose={onClose} save={save} />
        : <p className="py-16 text-center text-body text-text-muted">Loading…</p>}
    </Modal>
  )
}

function PickerBody({ ctx, opened, subject, saved, onClose, save }: { ctx: PictureContext; opened: PickerState } & Omit<PicturePickerProps, 'initialTab'>) {
  const [state, dispatch] = useReducer(pickerReducer, opened)
  const [saving, setSaving] = useState(false)
  const { show, dialog } = useAttention()
  const savedPictures = savedOf(saved)
  const tab = state[state.tab]
  const kind = state.tab
  const remove = removeOf(state, subject.kind, savedPictures[kind])
  const round = subject.kind === 'agent' || subject.kind === 'person'
  const looks = stylesFor('avatar', ctx)

  // The object URLs of chosen files are let go when the picker closes.
  const urls = useRef(new Set<string>())
  for (const t of [state.avatar, state.cover]) if (t.upload) urls.current.add(t.upload.url)
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url) }, [])

  const setDraft = (recipe: PictureRecipe) => dispatch({ type: 'draft', recipe })
  const surprise = async () => {
    const style = kind === 'cover' ? 'patterns' : tab.draft?.style ?? looks[0]?.id
    if (style) setDraft(await randomRecipe(style, freshSeed(), ctx))
  }
  const anotherPattern = () => {
    if (tab.draft) setDraft({ ...tab.draft, choices: { ...tab.draft.choices, seed: intBetween(seededRng(freshSeed()), 0, COVER_SEED_MAX) } })
  }

  const onSave = async () => {
    setSaving(true)
    try {
      const changes = await changesToSend(changesOf(state, savedPictures))
      if (changes.avatar || changes.cover) await save(changes)
      onClose()
    } catch (err) {
      show({ title: 'The picture was not saved', text: saveFailureWords(err), retry: () => void onSave() })
    } finally {
      setSaving(false)
    }
  }

  const generating = tab.source === 'generate'
  return (
    <div>
      <div className="-mt-2 mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl kind="tabs" label="Picture" value={state.tab} onChange={t => dispatch({ type: 'tab', tab: t })}
          options={[{ value: 'avatar', label: 'Avatar' }, { value: 'cover', label: 'Cover' }]} />
        <SegmentedControl label={`The ${kind} is`} value={tab.source} onChange={source => dispatch({ type: 'source', source })}
          options={[{ value: 'generate', label: 'Generate' }, { value: 'upload', label: 'Upload' }]} />
      </div>

      <div className="grid max-h-[calc(100vh-15rem)] gap-5 overflow-y-auto sm:grid-cols-[200px_minmax(0,1fr)]">
        <PreviewCard ctx={ctx} role={subject.role} tab={kind} round={round}
          avatar={shownOf(state.avatar, savedPictures.avatar)} cover={shownOf(state.cover, savedPictures.cover)}>
          {generating && <Button size="sm" variant="secondary" onClick={() => void surprise()}>Surprise me</Button>}
          {generating && kind === 'avatar' && <Button size="sm" variant="secondary" disabled={!canMirror(tab.draft)} onClick={() => dispatch({ type: 'mirror' })}>Mirror</Button>}
          {generating && kind === 'cover' && <Button size="sm" variant="secondary" disabled={!tab.draft} onClick={anotherPattern}>Another of this pattern</Button>}
          <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'startAgain' })}>Start again</Button>
          {remove.enabled
            ? <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'remove', subject: subject.kind })}>{remove.label}</Button>
            : <Button size="sm" variant="secondary" refusal={{ reason: remove.why, title: 'Nothing to remove' }}>{remove.label}</Button>}
        </PreviewCard>

        <div className="min-w-0">
          {!generating && (
            <UploadPane
              kind={kind} upload={tab.upload}
              onUpload={upload => dispatch({ type: 'upload', upload })}
              onCrop={(crop, area) => dispatch({ type: 'crop', crop, area })}
              onProblem={words => show({ title: 'That picture cannot be used', text: words })}
            />
          )}
          {generating && kind === 'cover' && tab.draft && <CoverControls ctx={ctx} draft={tab.draft} onChange={setDraft} />}
          {generating && kind === 'avatar' && (state.view === 'tune' && tab.draft && findStyle(tab.draft.style)
            ? <AvatarTuning ctx={ctx} draft={tab.draft} onChange={setDraft} onBack={looks.length > 1 ? () => dispatch({ type: 'view', view: 'gallery' }) : undefined} />
            : <AvatarGallery
                ctx={ctx} draft={tab.draft} round={round}
                chosenStyle={tab.touched ? tab.draft?.style ?? null : savedPictures.avatar.recipe?.style ?? null}
                savedStyle={savedPictures.avatar.recipe?.style ?? null}
                onChoose={recipe => {
                  if (recipe !== tab.draft || !savedPictures.avatar.recipe) setDraft(recipe)
                  dispatch({ type: 'view', view: 'tune' })
                }}
              />)}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={() => void onSave()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
      {dialog}
    </div>
  )
}
