import { useState } from 'react'
import { removePersonPicture, setMyTimezone, uploadPersonPicture } from 'wasp/client/operations'
import { PersonFace } from '../../../org/pages/people/PersonFace'
import { pictureToDataUrl } from '../../../org/pages/people/pictureUpload'
import { imageFileProblem } from '../../../org/components/resizeImage'
import { FormError, Heading } from '../../../auth/pages/parts/authUi'
import { ImageUpload } from '../../../setup/pages/steps/ImageUpload'
import type { OnboardingData } from '../../queries'
import { AsideCard, AsideLabel, OnboardingFrame, StepButtons } from './OnboardingFrame'
import { browserZone, zoneOptions } from './zones'

const SELECT = 'w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-body text-text-primary focus:border-accent focus:outline-none'

/** Onboarding's second step: the person's picture and time zone (filled in from the browser), beside how they will appear to others. */
export function YouStep({ data, onBack, onNext }: { data: OnboardingData; onBack: () => void; onNext: () => void }) {
  const { me } = data
  const browser = browserZone()
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl)
  const [zone, setZone] = useState(me.timezone ?? browser)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const name = me.displayName ?? me.username ?? ''

  async function choose(file: File) {
    const problem = imageFileProblem(file)
    if (problem) { setError(problem); return }
    setError('')
    setUploading(true)
    try {
      const { url } = await uploadPersonPicture({ userId: me.id, dataUrl: await pictureToDataUrl(file) })
      setAvatarUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that picture')
    } finally {
      setUploading(false)
    }
  }

  async function remove() {
    setError('')
    try {
      await removePersonPicture({ userId: me.id })
      setAvatarUrl(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove it. Try again.')
    }
  }

  async function next(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      // The browser's zone is already kept for them; only a different choice is theirs to save.
      if (zone !== (me.timezone ?? browser)) await setMyTimezone({ timezone: zone })
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const aside = (
    <div>
      <AsideLabel>How others will see you</AsideLabel>
      <AsideCard title="People">
        <div className="flex items-center gap-2.5">
          <PersonFace person={{ userId: me.id, name, avatarUrl }} />
          <span className="flex-1 text-body text-text-primary">{name}<span className="block text-small text-text-muted">{zone}</span></span>
          <span className="text-small text-text-muted">{data.role === 'ADMIN' ? 'Admin' : 'Member'}</span>
        </div>
      </AsideCard>
      <p className="text-small text-text-muted">As on a project's members. Updates as you change it.</p>
    </div>
  )

  return (
    <OnboardingFrame identity={data.identity} step="you" needsModel={data.needsModel} aside={aside}>
      <Heading title="You" lead={`How you will appear to others at ${data.orgName}.`} />
      <form onSubmit={next}>
        {error && <FormError>{error}</FormError>}
        <ImageUpload label="Picture" noun="a picture of you" hint="Square, at least 256×256. PNG, JPG or WebP, up to 10 MB." src={avatarUrl} busy={uploading} onChoose={f => void choose(f)} onRemove={() => void remove()} />
        <div className="mb-3.5">
          <label htmlFor="onboarding-zone" className="mb-1.5 flex justify-between text-small font-medium text-text-muted"><span>Time zone</span><span className="font-normal">{zone === browser ? 'from your browser' : 'your choice'}</span></label>
          <select id="onboarding-zone" value={zone} onChange={e => setZone(e.target.value)} className={SELECT}>
            {zoneOptions(zone).map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <StepButtons onBack={onBack} next="submit" nextLabel={saving ? 'Saving…' : 'Continue'} busy={saving || uploading} />
      </form>
    </OnboardingFrame>
  )
}
