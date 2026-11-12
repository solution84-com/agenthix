import { useState } from 'react'
import { NativeSelect } from '@agenthix/ui/primitives'
import { removeOrgImage, saveSetupOrganisation, updateOrgIdentity, uploadOrgImage } from 'wasp/client/operations'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { ActionRow, Field, Heading, PRIMARY, SECONDARY, Steps } from '../../../auth/pages/parts/authUi'
import { CropUpload } from '../../../shared/pictures/picker'
import { imageFileProblem, openedSize } from '../../../shared/pictures/upload/cropAndCompress'
import { browserZone, zoneOptions } from '../../../onboarding/pages/steps/zones'
import { ImageUpload } from './ImageUpload'
import { SignInPreview } from './SignInPreview'
import { ShowAttention } from '@agenthix/ui/attention'

type Props = {
  initialName: string
  /** What is stored; when it is still the default, the browser's zone is offered. */
  initialTimeZone: string
  position: { step: number; total: number }
  /** The organisation's picture and cover already stored, if any (paths on hq's own address, shown through the signed-in image fetch). */
  avatarUrl: string | null
  coverUrl: string | null
  onNext: (now: { name: string; avatarUrl: string | null; coverUrl: string | null; timeZone: string }) => void
  onBack?: () => void
}

type Kind = 'avatar' | 'cover'
const MIN_PICTURE_SIDE = 256

/** Setup's second step: the organisation's name, picture and cover, beside the sign-in page they make. */
export function OrgStep({ initialName, initialTimeZone, position, avatarUrl, coverUrl, onNext, onBack }: Props) {
  const [name, setName] = useState(initialName)
  const [timeZone, setTimeZone] = useState(initialTimeZone === 'UTC' ? browserZone() : initialTimeZone)
  const [images, setImages] = useState<Record<Kind, string | null>>({ avatar: avatarUrl, cover: coverUrl })
  const [uploading, setUploading] = useState<Kind | null>(null)
  const [cropping, setCropping] = useState<{ type: Kind; file: File } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState<{ name?: string; avatar?: string; cover?: string }>({})

  async function choose(type: Kind, f: File) {
    const problem = imageFileProblem(f)
    if (problem) { setFieldError(f => ({ ...f, [type]: problem })); return }
    try {
      await openedSize(f)
    } catch (err) {
      setFieldError(f => ({ ...f, [type]: err instanceof Error ? err.message : 'That file could not be read as a picture.' }))
      return
    }
    setError('')
    setFieldError(f => ({ ...f, [type]: undefined }))
    setCropping({ type, file: f })
  }

  async function upload(type: Kind, dataUrl: string) {
    setCropping(null)
    setUploading(type)
    try {
      const { url } = await uploadOrgImage({ type, dataUrl })
      setImages(prev => ({ ...prev, [type]: url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not use that ${type === 'cover' ? 'cover' : 'picture'}`)
    } finally {
      setUploading(null)
    }
  }

  async function remove(type: Kind) {
    setError('')
    try {
      const { url } = await removeOrgImage({ type })
      setImages(prev => ({ ...prev, [type]: url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove it. Try again.')
    }
  }

  async function next(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setFieldError(f => ({ ...f, name: 'The organisation needs a name' })); return }
    setSaving(true)
    setError('')
    setFieldError(f => ({ ...f, name: undefined }))
    try {
      await updateOrgIdentity({ name: name.trim() })
      await saveSetupOrganisation({ timeZone })
      onNext({ name: name.trim(), avatarUrl: images.avatar, coverUrl: images.cover, timeZone })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthLayout setup side={<SignInPreview name={name} pictureSrc={images.avatar} coverSrc={images.cover} />}>
      <Steps step={position.step} total={position.total} name="Your organisation" />
      <Heading title="Your organisation" lead="What your people see when they sign in." />
      <form onSubmit={next}>
        <ShowAttention kind="alert" text={error} title="Your answers were not saved" />
        <Field id="org-name" label="Name" autoComplete="organization" autoFocus value={name} error={fieldError.name} onChange={e => setName(e.target.value)} />
        <ImageUpload label="Picture" noun="a logo or picture" hint="Square works best; you crop it next. Any picture your browser can open." src={images.avatar} busy={uploading === 'avatar'} error={fieldError.avatar} onChoose={f => void choose('avatar', f)} onRemove={() => void remove('avatar')} />
        <ImageUpload label="Cover" noun="a cover image" hint="Wide, about 3 : 1; you crop it next. Any picture your browser can open." src={images.cover} wide busy={uploading === 'cover'} error={fieldError.cover} onChoose={f => void choose('cover', f)} onRemove={() => void remove('cover')} />
        <div className="mb-3.5 mt-3">
          <label htmlFor="org-zone" className="mb-1.5 block text-small font-medium text-text-muted">Time zone</label>
          <NativeSelect id="org-zone" value={timeZone} onChange={e => setTimeZone(e.target.value)}>
            {zoneOptions(timeZone).map(z => <option key={z} value={z}>{z}</option>)}
          </NativeSelect>
        </div>
        <p className="mt-3 text-small text-text-muted">Vision, mission and @handle can be added later on the Organisation page.</p>
        <ActionRow>
          {onBack && <button type="button" onClick={onBack} className={SECONDARY}>Back</button>}
          <button type="submit" disabled={saving} className={`${PRIMARY} flex-1`}>{saving ? 'Saving…' : 'Continue'}</button>
        </ActionRow>
      </form>
      <CropUpload file={cropping?.file ?? null} kind={cropping?.type ?? 'avatar'} minSide={cropping?.type === 'avatar' ? MIN_PICTURE_SIDE : 0} onCancel={() => setCropping(null)} onConfirm={dataUrl => upload(cropping!.type, dataUrl)} />
    </AuthLayout>
  )
}
