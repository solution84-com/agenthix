import { useEffect, useState } from 'react'
import { useAction, replaceAiProviderKey, renameAiProvider } from 'wasp/client/operations'
import type { AiProviderSummary } from '@agenthix/core'
import { AI_PROVIDER_VENDOR_INFO } from '@agenthix/core'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'

type Props = { open: boolean; provider: AiProviderSummary; onClose: () => void }

/** A new key, checked before the old one is dropped. The old key is never shown, only its last four characters. */
export function ReplaceKeyDialog({ open, provider, onClose }: Props) {
  const replace = useAction(replaceAiProviderKey)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const vendor = AI_PROVIDER_VENDOR_INFO[provider.vendor].label
  useEffect(() => { if (open) { setKey(''); setError('') } }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await replace({ id: provider.id, key })
      setKey('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not replace the key')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Replace ${provider.name}’s key`}>
      <form onSubmit={e => void submit(e)} className="space-y-4">
        {provider.keyHint && <p className="text-small text-text-secondary">Now: key ending {'…'}{provider.keyHint}.</p>}
        <FormField label="New API key" htmlFor="replace-key" hint={`Checked with ${vendor} before the old one is dropped.`} error={error}>
          <Input id="replace-key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} required />
        </FormField>
        <p className="text-small text-text-muted">
          Nothing changes for anyone: every model via {provider.name} stays as it is. Runs already under way finish on the old key; everything after uses the new one. Revoke the old key at {vendor} once this is saved.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !key.trim()}>{saving ? 'Checking…' : 'Replace'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export function RenameDialog({ open, provider, onClose }: Props) {
  const rename = useAction(renameAiProvider)
  const [name, setName] = useState(provider.name)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setName(provider.name); setError('') } }, [open, provider.name])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await rename({ id: provider.id, name: name.trim() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Rename provider">
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <FormField label="Name" htmlFor="rename-provider" error={error}>
          <Input id="rename-provider" value={name} onChange={e => setName(e.target.value)} required />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim() || name.trim() === provider.name}>{saving ? 'Saving…' : 'Rename'}</Button>
        </div>
      </form>
    </Modal>
  )
}
