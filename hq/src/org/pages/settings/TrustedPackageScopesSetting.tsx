import { useEffect, useState } from 'react'
import { useQuery, useAction, getTrustedPackageScopes, setTrustedPackageScopes } from 'wasp/client/operations'
import { FILES_BUTTON } from '@agenthix/ui/projects'
import { FIELD } from '@agenthix/ui/primitives'
import { useAttentionWhen } from '@agenthix/ui/attention'

const FIELD_CLASS = `w-full rounded-lg ${FIELD} px-3 py-2 font-mono text-small`

/** The scopes as typed: separated by commas, spaces or new lines. */
export const scopesOf = (text: string): string[] => text.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)

/**
 * Organisation › Settings, Trusted package scopes (live preview spec section 4, *The app*): the organisation's own npm
 * scopes, whose packages run their install scripts in a live preview without the checks a public package must pass.
 */
export function TrustedPackageScopesSetting() {
  const { data } = useQuery(getTrustedPackageScopes)
  const save = useAction(setTrustedPackageScopes)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setText(data.scopes.join('\n')) }, [data])
  if (!data) return null

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const { scopes } = await save({ scopes: scopesOf(text) })
      setText(scopes.join('\n'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that. Nothing was changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Trusted package scopes" className="mb-6">
      <h2 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Trusted package scopes</h2>
      <p className="mb-2 text-small text-text-secondary">
        In a live preview, a package's install script is blocked unless the package is well known and widely used, or a
        person says yes in HQ. Packages in the npm scopes listed here, your organisation's own, run theirs without that
        check. List only scopes your organisation publishes, one per line, such as @fernhill.
      </p>
      <form onSubmit={e => { e.preventDefault(); void submit() }} className="space-y-2">
        <textarea aria-label="Trusted npm scopes" value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="@fernhill" className={FIELD_CLASS} />
        <button type="submit" disabled={busy} className={FILES_BUTTON}>Save scopes</button>
      </form>
      {errorDialog}
    </section>
  )
}
