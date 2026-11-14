import { useEffect, useState } from 'react'
import { useAction, updateOrgIdentity } from 'wasp/client/operations'
import { Button, FormField, Input, Modal, Textarea } from '@agenthix/ui/primitives'
import { useAttentionWhen } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

type Identity = { name: string; handle: string | null; vision: string; mission: string }

/** Edit on the Organisation hero: name, @handle, vision and mission. Admins only; the server refuses anyone else. */
export function OrgIdentityDialog({ open, identity, onClose }: { open: boolean; identity: Identity; onClose: () => void }) {
  const save = useAction(updateOrgIdentity)
  const [name, setName] = useState(identity.name)
  const [handle, setHandle] = useState(identity.handle ?? '')
  const [vision, setVision] = useState(identity.vision)
  const [mission, setMission] = useState(identity.mission)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error, { kind: 'alert' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(identity.name); setHandle(identity.handle ?? ''); setVision(identity.vision); setMission(identity.mission); setError('')
  }, [open, identity])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await save({ name, handle: handle.trim() === '' ? null : handle, vision, mission })
      onClose()
    } catch (err) {
      setError(pressFailureWords(err, 'Could not save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit the organisation">
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <FormField label="Name" htmlFor="org-name"><Input id="org-name" value={name} onChange={e => setName(e.target.value)} required /></FormField>
        <FormField label="Handle" htmlFor="org-handle" hint="Lowercase letters, digits and hyphens. Shown as @handle.">
          <Input id="org-handle" value={handle} onChange={e => setHandle(e.target.value)} placeholder="acmecorp" />
        </FormField>
        <FormField label="Vision" htmlFor="org-vision" hint="Where the organisation is headed. Agents read it to understand the direction.">
          <Textarea id="org-vision" rows={2} value={vision} onChange={e => setVision(e.target.value)} />
        </FormField>
        <FormField label="Mission" htmlFor="org-mission" hint="What it does, and for whom.">
          <Textarea id="org-mission" rows={2} value={mission} onChange={e => setMission(e.target.value)} />
        </FormField>
        {errorDialog}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}
