import { useEffect, useState } from 'react'
import { useAction, createTeam, updateTeam } from 'wasp/client/operations'
import { Button, FormField, Input, Modal, Textarea } from '@agenthix/ui/primitives'
import { useAttentionWhen } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../../shared/failureWords'

/** New team, or a team's name and purpose changed. People and agents are added on the team's own page. */
export function TeamDialog({ open, team, onClose, onSaved }: {
  open: boolean
  team?: { id: string; name: string; purpose: string }
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const create = useAction(createTeam)
  const update = useAction(updateTeam)
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error, { kind: 'alert' })

  useEffect(() => {
    if (open) { setName(team?.name ?? ''); setPurpose(team?.purpose ?? ''); setError('') }
  }, [open, team])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (team) {
        await update({ id: team.id, name, purpose })
        onSaved(team.id)
      } else {
        onSaved((await create({ name, purpose })).id)
      }
      onClose()
    } catch (err) {
      setError(pressFailureWords(err, 'Could not save the team'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={team ? 'Edit the team' : 'New team'}>
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <FormField label="Name" htmlFor="team-name"><Input id="team-name" value={name} onChange={e => setName(e.target.value)} placeholder="Marketing" required /></FormField>
        <FormField label="Purpose" htmlFor="team-purpose" hint="What the team is for.">
          <Textarea id="team-purpose" rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} />
        </FormField>
        {errorDialog}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : team ? 'Save' : 'Create team'}</Button>
        </div>
      </form>
    </Modal>
  )
}
