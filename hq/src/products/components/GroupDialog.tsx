import { useEffect, useState } from 'react'
import { useAction, createProduct, updateProduct, createProgram, updateProgram } from 'wasp/client/operations'
import { Button, FormField, Input, Modal, NativeSelect, Textarea } from '@agenthix/ui/primitives'
import { WORDS, type Group, type GroupKind } from './groupKinds'

/** A product or programme made, or its name, description (a programme's goal) and status changed. Organisation admins only; the server refuses anyone else. */
export function GroupDialog({ kind, open, group, onClose, onSaved }: {
  kind: GroupKind
  open: boolean
  group?: Group
  onClose: () => void
  onSaved: (slug: string) => void
}) {
  const words = WORDS[kind]
  const createProductFn = useAction(createProduct)
  const updateProductFn = useAction(updateProduct)
  const createProgramFn = useAction(createProgram)
  const updateProgramFn = useAction(updateProgram)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<string>(words.statuses[0][0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(group?.name ?? ''); setDescription(group?.description ?? ''); setStatus(group?.status ?? words.statuses[0][0]); setError('')
  }, [open, group, words])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const text = description.trim()
      let slug: string
      if (kind === 'product') {
        slug = group
          ? (await updateProductFn({ productId: group.id, name: name.trim(), description: text || null, status: status as 'active' | 'sunset' })).slug
          : (await createProductFn({ name: name.trim(), description: text || undefined, status: status as 'active' | 'sunset' })).slug
      } else {
        slug = group
          ? (await updateProgramFn({ programId: group.id, name: name.trim(), description: text || null, status: status as 'planning' | 'active' | 'archived' })).slug
          : (await createProgramFn({ name: name.trim(), description: text || undefined, status: status as 'planning' | 'active' | 'archived' })).slug
      }
      onSaved(slug)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save the ${words.one}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={group ? `Edit the ${words.one}` : `New ${words.one}`}>
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <FormField label="Name" htmlFor="group-name"><Input id="group-name" value={name} onChange={e => setName(e.target.value)} required /></FormField>
        <FormField label={words.describe} htmlFor="group-description"><Textarea id="group-description" rows={2} value={description} onChange={e => setDescription(e.target.value)} /></FormField>
        <FormField label="Status" htmlFor="group-status">
          <NativeSelect id="group-status" value={status} onChange={e => setStatus(e.target.value)}>
            {words.statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </NativeSelect>
        </FormField>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : group ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  )
}
