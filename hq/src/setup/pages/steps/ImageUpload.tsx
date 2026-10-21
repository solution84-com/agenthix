import { useRef } from 'react'
import { AuthedImg } from '../../../shared/components/AuthedImg'

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
  onChoose: (file: File) => void
  onRemove: () => void
}

/** An optional image on setup's second step: a dashed prompt until one is uploaded, then its thumbnail with Change and Remove. */
export function ImageUpload({ label, noun, hint, src, wide, busy, onChoose, onRemove }: Props) {
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
          <button type="button" onClick={pick} disabled={busy} className="text-small font-medium text-accent hover:text-accent-hover disabled:opacity-40">Change</button>
          <button type="button" onClick={onRemove} disabled={busy} className="text-small font-medium text-text-muted hover:text-text-primary disabled:opacity-40">Remove</button>
        </div>
      ) : (
        <button type="button" onClick={pick} disabled={busy} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-left hover:bg-surface-hover">
          <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-h2 text-text-muted">＋</span>
          <span className="text-small text-text-secondary">
            {busy ? 'Uploading…' : `Upload ${noun}`}
            <span className="block text-text-muted">{hint}</span>
          </span>
        </button>
      )}
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={`Choose ${noun}`} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onChoose(f) }} />
    </div>
  )
}
