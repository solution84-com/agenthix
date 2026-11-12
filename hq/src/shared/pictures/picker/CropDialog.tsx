/**
 * The crop frame on its own, for the steps that choose one picture outside the picker (setup's organisation step,
 * onboarding's *You*): the picker's upload frame in a small dialog, and a confirm that cuts and compresses what is in
 * the frame (`cropAndCompress`, the same as Save in the picker) and hands over the data URL.
 */
import { useEffect, useRef, useState } from 'react'
import { Button, Modal, useAttention } from '@agenthix/ui/primitives'
import type { PictureKind } from '../recipe'
import { cropAndCompress } from '../upload/cropAndCompress'
import { UploadPane } from './UploadPane'
import type { UploadDraft } from './pickerState'

export type CropDialogProps = {
  file: File
  kind: PictureKind
  /** Refuse a picture whose shorter side is under this many pixels. */
  minSide?: number
  onCancel: () => void
  /** The cropped, compressed picture as a data URL; the dialog closes after it. */
  onConfirm: (dataUrl: string) => void | Promise<void>
}

export default function CropDialog({ file, kind, minSide, onCancel, onConfirm }: CropDialogProps) {
  const [upload, setUpload] = useState<UploadDraft>(() => ({ file, url: URL.createObjectURL(file), crop: null, area: null }))
  const [working, setWorking] = useState(false)
  const { show, dialog } = useAttention()
  const urls = useRef(new Set<string>([upload.url]))
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url) }, [])

  const confirm = async () => {
    setWorking(true)
    try {
      const dataUrl = await cropAndCompress(upload.file, kind, { crop: upload.crop, minSide })
      await onConfirm(dataUrl)
    } catch (err) {
      show({ title: 'That picture cannot be used', text: err instanceof Error ? err.message : 'Choose another.' })
      setWorking(false)
    }
  }

  return (
    <Modal open onClose={onCancel} title={kind === 'avatar' ? 'Crop the picture' : 'Crop the cover'} closeLabel="Close" maxWidth="max-w-lg">
      <UploadPane
        kind={kind} upload={upload} picker={false}
        onUpload={next => { urls.current.add(next.url); setUpload(next) }}
        onCrop={(crop, area) => setUpload(u => ({ ...u, crop, area }))}
        onProblem={words => show({ title: 'That picture cannot be used', text: words })}
      />
      <div className="mt-5 flex justify-end gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={working}>Cancel</Button>
        <Button onClick={() => void confirm()} disabled={working}>{working ? 'Working…' : 'Use this picture'}</Button>
      </div>
      {dialog}
    </Modal>
  )
}
