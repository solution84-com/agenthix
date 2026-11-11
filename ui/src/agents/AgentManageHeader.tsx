import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { Loader2, Camera } from 'lucide-react'
import { InlineEdit, ValueRefused } from '../primitives/InlineEdit'
import { Modal } from '../primitives/Modal'
import { INITIALS_MARK } from '../primitives/Avatar'
import { getInitials, presetSrc } from './helpers'
import { useAttentionWhen } from '../attention/useAttentionWhen'

export interface AgentManageHeaderActions {
  /** Left out for anyone who may not change the images. */
  uploadAgentImage?: (input: { agentId: string; type: 'avatar' | 'cover'; dataUrl: string }) => Promise<{ url: string }>
  applyAgentPreset?: (input: { agentId: string; imageType: 'avatar' | 'cover'; filename: string }) => Promise<{ url: string }>
  fetchPresets?: (type: 'avatars' | 'covers') => Promise<string[]>
  saveName: (name: string) => Promise<void>
  saveRole: (role: string) => Promise<void>
}

export interface AgentManageHeaderProps {
  agent: { id: string; name: string; handle: string; role: string | null; avatarUrl: string | null; coverUrl: string | null }
  actions: AgentManageHeaderActions
  /** Beside the handle: "the organisation's · Open its place in Agents ›". */
  subline?: ReactNode
  /** The right-hand end: Export and the ⋯ menu. */
  menu?: ReactNode
}

const IMAGE_ERROR = 'Could not use that image. Try another one. Nothing was changed.'

/**
 * The top of an agent's settings page (every screen reviewed spec §3): its cover with Change cover, its avatar with
 * Change, and its name and role edited in place.
 */
export function AgentManageHeader({ agent, actions, subline, menu }: AgentManageHeaderProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [uploadingImage, setUploadingImage] = useState<'avatar' | 'cover' | null>(null)
  const [avatarPresets, setAvatarPresets] = useState<string[]>([])
  const [coverPresets, setCoverPresets] = useState<string[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const imageErrorDialog = useAttentionWhen(imageError, { kind: 'alert' })
  const coverInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // A host that fetches the image through an authenticated client hands this null first and the real value
  // later, so this re-runs on the value itself and not only on `agent.id`.
  useEffect(() => {
    setAvatarUrl(agent.avatarUrl ?? null)
    setCoverUrl(agent.coverUrl ?? null)
  }, [agent.id, agent.avatarUrl, agent.coverUrl])

  useEffect(() => {
    if (actions.fetchPresets) {
      actions.fetchPresets('avatars').then(setAvatarPresets).catch(() => { })
      actions.fetchPresets('covers').then(setCoverPresets).catch(() => { })
    }
  }, [actions.fetchPresets])

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    if (!actions.uploadAgentImage) return
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const maxW = type === 'avatar' ? 256 : 1200
    const maxH = type === 'avatar' ? 256 : 400

    setImageError(null)
    const source = URL.createObjectURL(file)
    const dataUrl = await new Promise<string | null>((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.onerror = () => resolve(null)
      img.src = source
    }).finally(() => URL.revokeObjectURL(source))
    if (!dataUrl) { setImageError(IMAGE_ERROR); return }

    setUploadingImage(type)
    try {
      const { url } = await actions.uploadAgentImage({ agentId: agent.id, type, dataUrl })
      if (type === 'avatar') setAvatarUrl(url)
      else setCoverUrl(url)
    } catch {
      setImageError(IMAGE_ERROR)
    } finally {
      setUploadingImage(null)
    }
  }, [agent.id, actions.uploadAgentImage])

  const handlePlatformAvatar = useCallback(async (filename: string) => {
    if (!actions.applyAgentPreset) return
    setShowAvatarPicker(false)
    setImageError(null)
    setUploadingImage('avatar')
    try {
      const { url } = await actions.applyAgentPreset({ agentId: agent.id, imageType: 'avatar', filename })
      setAvatarUrl(url)
    } catch {
      setImageError(IMAGE_ERROR)
    } finally {
      setUploadingImage(null)
    }
  }, [agent.id, actions.applyAgentPreset])

  const handlePlatformCover = useCallback(async (filename: string) => {
    if (!actions.applyAgentPreset) return
    setShowCoverPicker(false)
    setImageError(null)
    setUploadingImage('cover')
    try {
      const { url } = await actions.applyAgentPreset({ agentId: agent.id, imageType: 'cover', filename })
      setCoverUrl(url)
    } catch {
      setImageError(IMAGE_ERROR)
    } finally {
      setUploadingImage(null)
    }
  }, [agent.id, actions.applyAgentPreset])

  const canManageImages = !!(actions.uploadAgentImage || actions.applyAgentPreset)

  return (
    <div className="relative">
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleImageUpload(e, 'cover')} />
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleImageUpload(e, 'avatar')} />

      <div className="relative h-40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/60 via-accent/40 to-transparent" />
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {canManageImages && (
          <button
            type="button"
            onClick={() => setShowCoverPicker(true)}
            className="absolute right-4 top-4 flex items-center gap-2 rounded-lg bg-scrim px-3 py-1.5 text-body font-medium text-text-primary"
          >
            <Camera className="h-4 w-4" />
            {uploadingImage === 'cover' ? 'Uploading…' : 'Change cover'}
          </button>
        )}
      </div>

      <div className="relative z-10 -mt-10 flex items-end gap-5 px-6 pb-4">
        <div className="relative h-20 w-20 shrink-0">
          <div className={`absolute inset-0 flex items-center justify-center rounded-full ring-4 ring-surface-0 ${INITIALS_MARK}`}>
            <span className="text-h1">{getInitials(agent.name)}</span>
          </div>
          {avatarUrl && (
            <img src={avatarUrl} alt="" className="absolute inset-0 h-20 w-20 rounded-full object-cover ring-4 ring-surface-0" />
          )}
          {uploadingImage === 'avatar' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-scrim">
              <Loader2 className="h-5 w-5 animate-spin text-text-primary" />
            </div>
          )}
          {canManageImages && (
            <button
              type="button"
              onClick={() => setShowAvatarPicker(true)}
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface-1 px-2 py-0.5 text-micro font-medium text-text-secondary hover:text-text-primary"
            >
              Change
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <InlineEdit value={agent.name} onSave={async name => {
            if (!name.trim()) throw new ValueRefused('An agent needs a name. Nothing was changed.')
            await actions.saveName(name)
          }} textClassName="!px-0 !py-0 text-h1 font-medium" placeholder="Name" />
          <InlineEdit value={agent.role ?? ''} onSave={actions.saveRole} textClassName="!px-0 !py-0 text-body text-text-secondary" placeholder="Add a role" />
          <div className="mt-1 text-small text-text-muted">
            <span className="font-mono">@{agent.handle}</span>
            {subline && <span> · {subline}</span>}
          </div>
        </div>
        {menu && <div className="flex shrink-0 items-center gap-2 pb-1">{menu}</div>}
      </div>

      {imageErrorDialog}

      <Modal open={showAvatarPicker} onClose={() => setShowAvatarPicker(false)} title="Choose avatar" maxWidth="max-w-xs">
        <div className="grid grid-cols-4 gap-3 mb-4">
          {avatarPresets.map((filename) => (
            <button
              key={filename}
              type="button"
              onClick={() => handlePlatformAvatar(filename)}
              className="w-full aspect-square rounded-xl overflow-hidden cursor-pointer transition-shadow ring-2 ring-transparent hover:ring-border-strong"
            >
              <img src={presetSrc('avatars', filename)} alt={filename} className="w-full h-full object-cover" />
            </button>
          ))}
          {avatarPresets.length === 0 && (
            <p className="col-span-4 text-center text-text-muted text-small py-4">No ready-made avatars are available.</p>
          )}
        </div>
        {actions.uploadAgentImage && (
          <button
            type="button"
            onClick={() => { setShowAvatarPicker(false); avatarInputRef.current?.click() }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:border-border text-body font-medium transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" /> Upload photo
          </button>
        )}
      </Modal>

      <Modal open={showCoverPicker} onClose={() => setShowCoverPicker(false)} title="Choose cover" maxWidth="max-w-lg">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {coverPresets.map((filename) => (
            <button
              key={filename}
              type="button"
              onClick={() => handlePlatformCover(filename)}
              className="w-full rounded-xl overflow-hidden cursor-pointer transition-shadow ring-2 ring-transparent hover:ring-border-strong"
            >
              <img src={presetSrc('covers', filename)} alt={filename} className="w-full h-16 object-cover" />
              <div className="text-micro text-text-muted font-medium uppercase tracking-wide py-1">{filename.replace(/\.[^.]+$/, '').replace(/^cover-/, '')}</div>
            </button>
          ))}
          {coverPresets.length === 0 && (
            <p className="col-span-2 text-center text-text-muted text-small py-4">No ready-made covers are available.</p>
          )}
        </div>
        {actions.uploadAgentImage && (
          <button
            type="button"
            onClick={() => { setShowCoverPicker(false); coverInputRef.current?.click() }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:border-border text-body font-medium transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" /> Upload photo
          </button>
        )}
      </Modal>
    </div>
  )
}
