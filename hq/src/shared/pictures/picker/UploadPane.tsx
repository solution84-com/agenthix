/**
 * Upload, in either tab (the spec's *Upload: crop, then a small file*): a drop area saying what works best, then the
 * picture under a frame of the shape it will be shown in — a circle for an avatar, a 3 : 1 band for a cover. Drag to
 * move it; zoom with the slider, the wheel or a pinch; the arrow keys move it and + and − zoom; Reset fits it again.
 * The cut and the compression happen on Save (`cropAndCompress`).
 */
import { useCallback, useId, useRef, useState, type DragEvent, type HTMLAttributes, type KeyboardEvent } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Button, FOCUS_RING } from '@agenthix/ui/primitives'
import type { PictureKind } from '../recipe'
import { FRAME_ASPECT } from '../upload/sizing'
import { imageFileProblem, openedSize } from '../upload/cropAndCompress'
import type { UploadDraft } from './pickerState'
import { pressFailureWords } from '../../failureWords'

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1

const HINT: Record<PictureKind, string> = {
  avatar: 'A square picture works best: it is shown in a circle.',
  cover: 'A wide picture works best, about 3 : 1: it is shown as a band.',
}

/** How far one arrow key moves the picture, in pixels: a photo is moved in a few presses, not hundreds. */
const KEYBOARD_STEP = 16

export function UploadPane({ kind, upload, onUpload, onCrop, onProblem, picker = true }: {
  kind: PictureKind
  /** In the picker, a line says what Save and Generate do; setup's and onboarding's crop has neither. */
  picker?: boolean
  upload: UploadDraft | null
  onUpload: (upload: UploadDraft) => void
  onCrop: (crop: Area, area: Area) => void
  /** A file that cannot be used: the picker says why. */
  onProblem: (words: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const zoomId = useId()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)

  const take = useCallback(async (file: File | undefined) => {
    if (!file) return
    const problem = imageFileProblem(file)
    if (problem) { onProblem(problem); return }
    try {
      await openedSize(file)
    } catch (err) {
      onProblem(pressFailureWords(err))
      return
    }
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    onUpload({ file, url: URL.createObjectURL(file), crop: null, area: null })
  }, [onUpload, onProblem])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void take(e.dataTransfer.files?.[0])
  }
  const onKeys = (e: KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2))) }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2))) }
  }
  const what = kind === 'avatar' ? 'avatar' : 'cover'
  const input = (
    <input ref={inputRef} type="file" accept="image/*,.heic,.heif" hidden aria-label={`Choose a picture for the ${what}`} onChange={e => { void take(e.target.files?.[0]); e.target.value = '' }} />
  )

  if (!upload) {
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed px-6 py-10 text-center text-body text-text-secondary ${dragging ? 'border-border-strong bg-surface-hover' : 'border-border'}`}
      >
        Drop a picture for the {what} here, or{' '}
        <button type="button" onClick={() => inputRef.current?.click()} className={`rounded text-link underline ${FOCUS_RING}`}>choose a file</button>
        <span className="mt-1 block text-small text-text-muted">{HINT[kind]} Only the part in the frame is sent.</span>
        {input}
      </div>
    )
  }

  return (
    <div>
      <div
        onKeyDown={onKeys} data-testid="crop-frame"
        // A press on the frame gives it the keys, as Tab does.
        onPointerDown={e => (e.currentTarget.querySelector('[data-testid="cropper"]') as HTMLElement | null)?.focus()}
        className={`relative w-full overflow-hidden rounded-xl bg-surface-3 ${kind === 'avatar' ? 'h-64' : 'h-48'}`}
      >
        <Cropper
          image={upload.url}
          crop={crop} zoom={zoom} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}
          aspect={FRAME_ASPECT[kind]}
          cropShape={kind === 'avatar' ? 'round' : 'rect'}
          showGrid={false} keyboardStep={KEYBOARD_STEP}
          onCropChange={setCrop} onZoomChange={setZoom}
          onCropComplete={(area, pixels) => onCrop(pixels, area)}
          cropperProps={{ 'aria-label': `The ${what}'s frame: drag or use the arrow keys to move the picture, + and − to zoom` } as HTMLAttributes<HTMLDivElement>}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <label htmlFor={zoomId} className="text-small text-text-muted">Zoom</label>
        <input
          id={zoomId} type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={ZOOM_STEP} value={zoom}
          onChange={e => setZoom(Number(e.target.value))} className={`min-w-0 flex-1 accent-accent ${FOCUS_RING}`}
        />
        <Button size="sm" variant="secondary" onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1) }}>Reset</Button>
      </div>
      <button type="button" onClick={() => inputRef.current?.click()} className={`mt-3 rounded text-small font-medium text-link hover:underline ${FOCUS_RING}`}>
        Choose another
      </button>
      {input}
      {picker && <p className="mt-2 text-small text-text-muted">Save replaces the {what} with this one. Generate brings back the generated one.</p>}
    </div>
  )
}
