import { useRef, useState, type ReactNode } from 'react'
import { Camera } from 'lucide-react'
import { AuthedImg } from '../../shared/components/AuthedImg'
import { AgentCover } from '../../agents/pages/AgentCover'
import { PICTURE_SIZE, resizeImage } from './resizeImage'

export type IdentityImage = 'avatar' | 'cover'

export interface IdentityHeroProps {
  name: string
  /** Under the name: "@acmecorp · on Agenthix since March 2026". */
  subline?: ReactNode
  avatarUrl: string | null
  coverUrl: string | null
  /** Left out for anyone who may not change the identity: no Edit, no Change cover. */
  onUploadImage?: (type: IdentityImage, dataUrl: string) => Promise<void>
  onRemoveImage?: (type: IdentityImage) => Promise<void>
  /** The buttons at the right of the name: Edit, Add to a project, ⋯. */
  actions?: ReactNode
  /** Under the name, inside the hero: vision and mission. */
  children?: ReactNode
}

const BUTTON = 'rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-small font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-40'

/**
 * An identity's top (every screen reviewed spec §3, Organisation: an identity always has a hero): its cover, a large
 * picture, its name and a line under it. The organisation and a team both open with it; an agent's place has the same.
 */
export function IdentityHero({ name, subline, avatarUrl, coverUrl, onUploadImage, onRemoveImage, actions, children }: IdentityHeroProps) {
  const coverInput = useRef<HTMLInputElement>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<IdentityImage | null>(null)
  const [error, setError] = useState('')

  const choose = async (type: IdentityImage, file: File | undefined) => {
    if (!file || !onUploadImage) return
    setError('')
    setBusy(type)
    try {
      const [w, h] = PICTURE_SIZE[type]
      await onUploadImage(type, await resizeImage(file, w, h))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the picture')
    } finally {
      setBusy(null)
    }
  }
  const remove = async (type: IdentityImage) => {
    if (!onRemoveImage) return
    setError('')
    setBusy(type)
    try { await onRemoveImage(type) } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove the picture') } finally { setBusy(null) }
  }

  return (
    <div data-testid="identity-hero">
      <div className="relative h-36 overflow-hidden sm:h-44">
        <AgentCover coverUrl={coverUrl} />
        {onUploadImage && (
          <div className="absolute right-4 top-4 flex items-center gap-2">
            {coverUrl && onRemoveImage && (
              <button type="button" disabled={busy !== null} onClick={() => void remove('cover')} className={BUTTON}>Remove cover</button>
            )}
            <button type="button" disabled={busy !== null} onClick={() => coverInput.current?.click()} className={`${BUTTON} flex items-center gap-1.5`}>
              <Camera size={14} aria-hidden /> {busy === 'cover' ? 'Uploading…' : 'Change cover'}
            </button>
            <input ref={coverInput} type="file" accept="image/*" hidden aria-label="Choose a cover" onChange={e => { void choose('cover', e.target.files?.[0]); e.target.value = '' }} />
          </div>
        )}
      </div>

      <div className="relative -mt-10 flex flex-wrap items-end gap-x-4 gap-y-2 px-4 lg:px-10">
        <div className="relative shrink-0">
          <span className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-surface-2 text-display font-semibold text-accent ring-4 ring-surface-0 sm:h-24 sm:w-24">
            {name.trim().charAt(0).toUpperCase() || '?'}
            <AuthedImg src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </span>
          {onUploadImage && (
            <>
              <button type="button" disabled={busy !== null} onClick={() => avatarInput.current?.click()}
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-surface-1 px-2 py-0.5 text-micro font-medium text-text-secondary hover:text-text-primary disabled:opacity-40">
                {busy === 'avatar' ? 'Uploading…' : 'Change'}
              </button>
              <input ref={avatarInput} type="file" accept="image/*" hidden aria-label="Choose a picture" onChange={e => { void choose('avatar', e.target.files?.[0]); e.target.value = '' }} />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1 basis-48 pb-1 pt-10 sm:pt-12">
          <h1 className="truncate text-h1 font-semibold text-text-primary">{name}</h1>
          {subline && <div className="truncate text-small text-text-muted">{subline}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pb-1 pt-10 sm:pt-12">{actions}</div>}
      </div>
      {error && <p role="alert" className="px-4 pt-2 text-small text-danger lg:px-10">{error}</p>}
      {children && <div className="px-4 pt-3 lg:px-10">{children}</div>}
    </div>
  )
}
