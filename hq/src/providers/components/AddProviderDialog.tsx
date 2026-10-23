import { useEffect, useState } from 'react'
import { useAction, addAiProvider } from 'wasp/client/operations'
import { AI_PROVIDER_VENDORS, AI_PROVIDER_VENDOR_INFO, type AiProviderType, type AiProviderVendor } from '@agenthix/core'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'
import { TYPE_CHOICES } from './providerWords'

const VENDOR_LINES: Record<AiProviderVendor, string> = {
  anthropic: 'Claude models, by API key',
  openai: 'GPT models',
  google: 'Gemini models',
  openrouter: 'Many models, free ones included',
  openai_compatible: 'Any OpenAI-compatible server',
  assemblyai: 'STT: hearing people',
  inworld: 'TTS: agents’ voices',
  cloud: '',
}

/** The vendors an admin can still add for a type: Agenthix Cloud is connected, not keyed, and a vendor is added once. */
export function addableVendors(type: AiProviderType, existing: readonly AiProviderVendor[]): AiProviderVendor[] {
  return AI_PROVIDER_VENDORS.filter(v => v !== 'cloud' && !existing.includes(v) && (AI_PROVIDER_VENDOR_INFO[v].types as readonly string[]).includes(type))
}

export interface AddProviderFormProps {
  /** Vendors the organisation already has: each is added once. */
  existingVendors: readonly AiProviderVendor[]
  onAdded: () => void
  onCancel: () => void
  /** Start at this type's vendors, skipping the choice of type. */
  type?: AiProviderType
  /** Shows Agenthix Cloud beside the types: it is connected with a code, not keyed, so choosing it leaves this form. */
  onChooseCloud?: () => void
}

/**
 * The add-a-provider flow: its type, then its vendor, then the key or address, checked with the vendor before it is
 * saved. It is the whole of the dialog, so setup's models and voice step draws the same form inline.
 */
export function AddProviderForm({ existingVendors, onAdded, onCancel, type: startType, onChooseCloud }: AddProviderFormProps) {
  const add = useAction(addAiProvider)
  const [type, setType] = useState<AiProviderType | null>(startType ?? null)
  const [vendor, setVendor] = useState<AiProviderVendor | null>(null)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const back = () => {
    setError('')
    setKey('')
    if (vendor) setVendor(null)
    else if (!startType) setType(null)
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

  if (!type) {
    return (
      <div className="space-y-2">
        <p className="text-small text-text-secondary">{onChooseCloud ? 'What does the provider do, or is it Agenthix Cloud?' : 'What does the provider do?'}</p>
        {TYPE_CHOICES.map(c => (
          <button key={c.type} type="button" onClick={() => setType(c.type)} className="block w-full rounded-xl border border-border-subtle bg-card p-3 text-left hover:border-accent">
            <span className="block text-body font-semibold text-text-primary">{c.title}</span>
            <span className="block text-small text-text-secondary">{c.line}</span>
          </button>
        ))}
        {onChooseCloud && (
          <button type="button" onClick={onChooseCloud} className="block w-full rounded-xl border border-border-subtle bg-card p-3 text-left hover:border-accent">
            <span className="block text-body font-semibold text-text-primary">Agenthix Cloud</span>
            <span className="block text-small text-text-secondary">Models and voice, no keys. Billed by Agenthix. You approve it with a short code.</span>
          </button>
        )}
        <div className="flex justify-end pt-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
      </div>
    )
  }

  if (!vendor) {
    const vendors = addableVendors(type, existingVendors)
    return (
      <div className="space-y-2">
        <p className="text-small text-text-secondary">Which vendor?</p>
        {vendors.length === 0 && <p className="text-small text-text-muted">Every vendor of this type is already added.</p>}
        {vendors.map(v => (
          <button key={v} type="button" onClick={() => { setVendor(v); setName('') }} className="block w-full rounded-xl border border-border-subtle bg-card p-3 text-left hover:border-accent">
            <span className="block text-body font-semibold text-text-primary">{AI_PROVIDER_VENDOR_INFO[v].label}</span>
            <span className="block text-small text-text-secondary">{VENDOR_LINES[v]}</span>
          </button>
        ))}
        <div className="flex justify-end pt-2"><Button type="button" variant="ghost" onClick={back}>{startType ? 'Cancel' : 'Back'}</Button></div>
      </div>
    )
  }

  const info = AI_PROVIDER_VENDOR_INFO[vendor]
  return (
    <form onSubmit={e => void submit(e)} className="space-y-4">
      <h3 className="text-body font-semibold text-text-primary">Add {info.label}</h3>
      <FormField label="Name" htmlFor="provider-name" hint="What admins see. Useful beside a second key of the same vendor.">
        <Input id="provider-name" value={name} onChange={e => setName(e.target.value)} placeholder={info.label} />
      </FormField>
      {info.hasAddress && (
        <FormField label="Address" htmlFor="provider-address" hint="Prompts are sent to this address, so every organisation admin sees it on the provider’s line.">
          <Input id="provider-address" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://models.example.org/v1" required />
        </FormField>
      )}
      <FormField label="API key" htmlFor="provider-key" hint={`Checked with ${info.label} when you save. Stored in HQ, encrypted, and never shown again.`} error={error}>
        <Input id="provider-key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} required />
      </FormField>
      <p className="text-small text-text-muted">Every organisation admin is told, and the change is recorded.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={back}>Back</Button>
        <Button type="submit" disabled={saving || !key.trim() || (info.hasAddress && !baseUrl.trim())}>{saving ? 'Checking…' : 'Save'}</Button>
      </div>
    </form>
  )
}

export interface AddProviderDialogProps extends Omit<AddProviderFormProps, 'onCancel'> {
  open: boolean
  onClose: () => void
}

export function AddProviderDialog({ open, onClose, onAdded, ...rest }: AddProviderDialogProps) {
  // A fresh form each time the dialog opens: nothing typed survives a close.
  const [round, setRound] = useState(0)
  useEffect(() => { if (open) setRound(r => r + 1) }, [open])
  return (
    <Modal open={open} onClose={onClose} title="Add provider">
      <AddProviderForm key={round} {...rest} onCancel={onClose} onAdded={() => { onAdded(); onClose() }} />
    </Modal>
  )
}
