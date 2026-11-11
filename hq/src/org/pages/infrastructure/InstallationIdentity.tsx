import { useEffect, useState } from 'react'
import { useQuery, useAction, getSiteConfig, updateSiteConfig } from 'wasp/client/operations'
import { FIELD, Button } from '@agenthix/ui/primitives'
import { useAttentionWhen } from '@agenthix/ui/attention'

const FIELD_CLASS = `w-full rounded-lg ${FIELD} px-4 py-2.5 text-body`

/** This installation's name and description. */
export function InstallationIdentity() {
  const { data: config } = useQuery(getSiteConfig)
  const save = useAction(updateSiteConfig)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const errorDialog = useAttentionWhen(error)

  useEffect(() => {
    if (config) { setName(config.name); setDescription(config.description) }
  }, [config])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await save({ name, description })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div>
        <label htmlFor="installation-name" className="block text-text-muted text-small mb-1">Name</label>
        <input id="installation-name" value={name} onChange={e => setName(e.target.value)} required className={FIELD_CLASS} />
      </div>
      <div>
        <label htmlFor="installation-description" className="block text-text-muted text-small mb-1">Description</label>
        <textarea id="installation-description" value={description} onChange={e => setDescription(e.target.value)} rows={3} className={`${FIELD_CLASS} resize-none`} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit">
          Save
        </Button>
        {errorDialog}
      </div>
    </form>
  )
}
