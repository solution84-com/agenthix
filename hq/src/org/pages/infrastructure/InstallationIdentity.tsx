import { useEffect, useState } from 'react'
import { useQuery, useAction, getSiteConfig, updateSiteConfig } from 'wasp/client/operations'

const FIELD = 'w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-body text-text-primary focus:outline-none focus:border-accent transition-colors'

/** This installation's name and description. */
export function InstallationIdentity() {
  const { data: config } = useQuery(getSiteConfig)
  const save = useAction(updateSiteConfig)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (config) { setName(config.name); setDescription(config.description) }
  }, [config])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      await save({ name, description })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div>
        <label htmlFor="installation-name" className="block text-text-muted text-small mb-1">Name</label>
        <input id="installation-name" value={name} onChange={e => setName(e.target.value)} required className={FIELD} />
      </div>
      <div>
        <label htmlFor="installation-description" className="block text-text-muted text-small mb-1">Description</label>
        <textarea id="installation-description" value={description} onChange={e => setDescription(e.target.value)} rows={3} className={`${FIELD} resize-none`} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="bg-accent hover:bg-accent-hover text-on-accent px-5 py-2.5 rounded-lg text-body font-medium transition-colors cursor-pointer">
          Save
        </button>
        {saved && <span className="text-success text-body">Saved</span>}
        {error && <span className="text-danger text-body">{error}</span>}
      </div>
    </form>
  )
}
