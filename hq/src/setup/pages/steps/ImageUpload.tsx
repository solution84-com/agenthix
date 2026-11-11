import { useRef } from 'react'
import { AuthedImg } from '../../../shared/components/AuthedImg'
import { DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'

type Props = {
  label: string
  /** What an upload is called in the prompt, e.g. "a logo or picture". */
  noun: string
  hint: string
  /** The stored path of the image now set (hq's own address); null when there is none. */
  src: string | null
  /** The thumbnail is a wide strip (a cover) rather than a square (a picture). */
  wide?: boolean
  busy?: boolean
  /** The chosen file's own problem (wrong type or size), under the picture. */
  error?: string
  onChoose: (file: File) => void
  onRemove: () => void
}

/** An optional image on setup's second step: a dashed prompt until one is uploaded, then its thumbnail with Change and Remove. */
export function ImageUpload({ label, noun, hint, src, wide, busy, error, onChoose, onRemove }: Props) {
  const file = useRef<HTMLInputElement>(null)
  const pick = () => file.current?.click()
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex justify-between text-small font-medium text-text-muted"><span>{label}</span><span className="font-normal">optional</span></div>
      {src ? (
        <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
          <span className={`${wide ? 'w-24' : 'w-9'} relative h-9 shrink-0 overflow-hidden rounded-lg bg-surface-2`}>
            <AuthedImg src={src} alt={`Your ${label.toLowerCase()}`} className="absolute inset-0 h-full w-full object-cover" />
          </span>
          <span className="flex-1 text-small text-text-secondary">
            {busy ? 'Uploading…' : `${label} uploaded`}
            <span className="block text-text-muted">{hint}</span>
          </span>
          <button type="button" onClick={pick} disabled={busy} className={`rounded text-small font-medium text-link not-disabled:hover:underline ${DISABLED} ${FOCUS_RING}`}>Change</button>
          <button type="button" onClick={onRemove} disabled={busy} className={`text-small font-medium text-text-muted not-disabled:hover:text-text-primary ${DISABLED}`}>Remove</button>
        </div>
      ) : (
        <button type="button" onClick={pick} disabled={busy} className={`flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-left transition-colors not-disabled:hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING}`}>
          <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-h2 text-text-muted">＋</span>
          <span className="text-small text-text-secondary">
            {busy ? 'Uploading…' : `Upload ${noun}`}
            <span className="block text-text-muted">{hint}</span>
          </span>
        </button>
      )}
      {error && <p role="status" className="mt-1 text-small text-danger">{error}</p>}
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={`Choose ${noun}`} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onChoose(f) }} />
    </div>
  )
}
