import { useEffect, useState } from 'react'
import { useAction, useQuery, applyAgentTemplate, getAgentTemplates } from 'wasp/client/operations'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'

/** Add to agents: the library's agent becomes the organisation's own copy under a handle. */
export function AddAgentDialog({ templateId, onClose }: { templateId: string | null; onClose: () => void }) {
  const { data: templates } = useQuery(getAgentTemplates, undefined, { enabled: templateId !== null })
  const apply = useAction(applyAgentTemplate)
  const template = templates?.find(t => t.id === templateId)
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<string | null>(null)

  useEffect(() => { setHandle(template?.handle ?? ''); setError(''); setMade(null) }, [template?.id, template?.handle])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!template) return
    setBusy(true)
    setError('')
    try { setMade((await apply({ slug: template.slug, handle: handle.trim() })).handle) } catch (err) { setError(err instanceof Error ? err.message : 'Could not add the agent') } finally { setBusy(false) }
  }

  return (
    <Modal open={templateId !== null} onClose={onClose} title={template ? `Add ${template.name} to agents` : 'Add to agents'}>
      {made ? (
        <div className="space-y-4">
          <p className="text-body text-text-primary">Agent <span className="font-mono">@{made}</span> was added to the organisation's agents.</p>
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <form onSubmit={e => void submit(e)} className="space-y-4">
          <p className="text-small text-text-secondary">This makes the organisation's own copy. Choose the handle it is known by.</p>
          <FormField label="Handle" htmlFor="library-agent-handle"><Input id="library-agent-handle" value={handle} onChange={e => setHandle(e.target.value)} required /></FormField>
          {error && <p role="alert" className="text-small text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !handle.trim() || !template}>{busy ? 'Adding…' : 'Add to agents'}</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
