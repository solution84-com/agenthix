import { useEffect, useRef, useState } from 'react'
import { useAction, addAiProvider } from 'wasp/client/operations'
import { AI_PROVIDER_VENDOR_INFO, type AiProviderVendor } from '@agenthix/core'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'
import { useFeature } from '../../features/useFeature'
import { CloudConnectPanel } from './CloudConnectPanel'
import { KeyGuideBox } from './KeyGuideBox'
import { VendorChoices } from './VendorChoices'

/** A vendor with a custom address may run without a key; every other vendor needs one. */
export function keyIsRequired(vendor: AiProviderVendor): boolean {
  return !AI_PROVIDER_VENDOR_INFO[vendor].hasAddress
}

export interface AddProviderFormProps {
  /** Vendors the organisation already has: each is added once. */
  existingVendors: readonly AiProviderVendor[]
  onAdded: () => void
  onCancel: () => void
  /** Told the heading of the view shown, so the dialog's title is the one heading. */
  onTitle?: (title: string) => void
  /** Whether the form says every admin is told of the change; setup, where the person is the only admin, leaves it out. */
  adminNotice?: boolean
}

const FIELD = 'bg-surface-1!'
const ERROR_ID = 'provider-key-error'

/**
 * The add-a-provider flow: the vendors (with Agenthix Cloud), then the key or address, checked with the vendor before
 * it is saved. It is the whole of the pop-up, shared by setup's AI step and Manage › Providers.
 */
export function AddProviderForm({ existingVendors, onAdded, onCancel, onTitle, adminNotice = true }: AddProviderFormProps) {
  const add = useAction(addAiProvider)
  const inworldModels = useFeature('inworldLanguageModels')
  const [cloud, setCloud] = useState(false)
  const [vendor, setVendor] = useState<AiProviderVendor | null>(null)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Each view takes focus: the first vendor in the list, the Name field in a form, the first control of the Cloud panel.
  useEffect(() => {
    const el = root.current?.querySelector<HTMLElement>('[data-initial-focus], button:not([disabled])')
    el?.focus()
  }, [vendor, cloud])
  useEffect(() => {
    onTitle?.(vendor ? `Add ${AI_PROVIDER_VENDOR_INFO[vendor].label}` : cloud ? 'Connect Agenthix Cloud' : 'Add a provider')
  }, [vendor, cloud, onTitle])

  const back = () => {
    setError('')
    setKey('')
    if (vendor) setVendor(null)
    else if (cloud) setCloud(false)
    else onCancel()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vendor) return
    setSaving(true)
    setError('')
    try {
      const info = AI_PROVIDER_VENDOR_INFO[vendor]
      await add({ vendor, key, ...(name.trim() ? { name: name.trim() } : {}), ...(info.hasAddress ? { baseUrl: baseUrl.trim() } : {}) })
      setKey('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the provider')
    } finally {
      setSaving(false)
    }
  }

  const isOn = (flag: string) => flag === 'inworldLanguageModels' && inworldModels
  const info = vendor ? AI_PROVIDER_VENDOR_INFO[vendor] : null

  let view
  if (cloud) {
    view = (
      <div className="space-y-3">
        <CloudConnectPanel onConnected={onAdded} />
        <div className="flex justify-end"><Button type="button" variant="ghost" onClick={back}>Back</Button></div>
      </div>
    )
  } else if (!vendor || !info) {
    view = (
      <div className="space-y-2">
        <VendorChoices existingVendors={existingVendors} isOn={isOn} onPick={v => { setVendor(v); setName('') }} onPickCloud={() => setCloud(true)} />
        <div className="flex justify-end pt-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
      </div>
    )
  } else {
    const keyHint = `${keyIsRequired(vendor) ? '' : 'Optional: leave it empty for a server that needs no key. '}${vendor === 'inworld' ? `This one key covers ${inworldModels ? 'models, ' : ''}hearing people and speaking for agents. ` : ''}Checked with ${info.hasAddress ? 'this server' : info.label} when you save. Stored in HQ, encrypted, and never shown again.`
    view = (
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <KeyGuideBox vendor={vendor} />
        <FormField label="Name" htmlFor="provider-name" hint="What admins see on the provider’s line.">
          <Input id="provider-name" data-initial-focus className={FIELD} value={name} onChange={e => setName(e.target.value)} placeholder={info.label} />
        </FormField>
        {info.hasAddress && (
          <FormField label="Address" htmlFor="provider-address" hint="Prompts are sent here, so use an address the agents can reach: host.docker.internal, not localhost, for a server on this machine.">
            <Input id="provider-address" className={FIELD} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://models.example.org/v1" required />
          </FormField>
        )}
        <FormField label="API key" htmlFor="provider-key" hint={keyHint}>
          <Input id="provider-key" className={FIELD} type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} required={keyIsRequired(vendor)}
            aria-invalid={error ? true : undefined} aria-describedby={error ? ERROR_ID : undefined} />
        </FormField>
        {error && <p id={ERROR_ID} role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-small text-danger">{error}</p>}
        {adminNotice && <p className="text-small text-text-muted">Every organisation admin is told, and the change is recorded.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={back}>Back</Button>
          <Button type="submit" disabled={saving || (keyIsRequired(vendor) && !key.trim()) || (info.hasAddress && !baseUrl.trim())}>{saving ? 'Checking…' : 'Save'}</Button>
        </div>
      </form>
    )
  }
  return <div ref={root}>{view}</div>
}

export interface AddProviderDialogProps extends Omit<AddProviderFormProps, 'onCancel'> {
  open: boolean
  onClose: () => void
}

export function AddProviderDialog({ open, onClose, onAdded, ...rest }: AddProviderDialogProps) {
  const [title, setTitle] = useState('Add a provider')
  // A fresh form each time the dialog opens: nothing typed survives a close.
  const [round, setRound] = useState(0)
  useEffect(() => { if (open) setRound(r => r + 1) }, [open])
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <AddProviderForm key={round} {...rest} onTitle={setTitle} onCancel={onClose} onAdded={() => { onAdded(); onClose() }} />
    </Modal>
  )
}
