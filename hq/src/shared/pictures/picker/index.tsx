/**
 * The picture picker (generated avatars and covers spec, *The picker*): one dialog for an agent's, a person's, a
 * team's and the organisation's avatar and cover. Its code, the style registry and each style's drawing are loaded only
 * when it opens, so no other screen's bundle grows.
 */
import { Component, lazy, Suspense, type ReactNode } from 'react'
import { ShowAttention } from '@agenthix/ui/attention'
import type { CropDialogProps } from './CropDialog'
import type { PictureChanges, PicturePickerProps } from './types'

export type { PickerPictures, PickerSubject, PictureChanges, PicturePickerProps } from './types'

const PicturePickerDialog = lazy(() => import('./PicturePickerDialog'))

/** A picker whose code could not be fetched (HQ restarted on a new build, the connection dropped) says so once. */
class LoadFailure extends Component<{ onClose: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <ShowAttention kind="alert" title="The picker did not open" text="Its code did not load. Reload the page, then try again." onClose={this.props.onClose} />
  }
}

export function PicturePicker({ open, ...props }: PicturePickerProps & { open: boolean }) {
  if (!open) return null
  return (
    <LoadFailure onClose={props.onClose}>
      <Suspense fallback={null}>
        <PicturePickerDialog {...props} />
      </Suspense>
    </LoadFailure>
  )
}

const CropDialogLazy = lazy(() => import('./CropDialog'))

/** The crop frame alone, for a step that chooses one picture outside the picker. */
export function CropUpload({ file, ...props }: { file: File | null } & Omit<CropDialogProps, 'file'>) {
  if (!file) return null
  return (
    <LoadFailure onClose={props.onCancel}>
      <Suspense fallback={null}>
        <CropDialogLazy file={file} {...props} />
      </Suspense>
    </LoadFailure>
  )
}

const NewAgentPicturesLazy = lazy(() => import('./NewAgentPictures'))

/** The create-agent dialog's pictures with Change, loaded with the picker's code. */
export function NewAgentPictures(props: { name: string; value: PictureChanges | null; onChange: (changes: PictureChanges) => void }) {
  return (
    <LoadFailure onClose={() => {}}>
      <Suspense fallback={<div className="h-14" />}>
        <NewAgentPicturesLazy {...props} />
      </Suspense>
    </LoadFailure>
  )
}
