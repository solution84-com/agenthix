import { useState } from 'react'
import { AppWindow, ExternalLink, Loader2 } from 'lucide-react'
import { useAction, startGithubAppRegistration } from 'wasp/client/operations'
import { Button, FormField, Input, CARD_CHOSEN } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'

/** Registering the App (G1): one per HQ, tied to its address. GitHub creates it and sends the person back here. */
export function AppRegistration() {
  const start = useAction(startGithubAppRegistration)
  const [owner, setOwner] = useState<'organisation' | 'personal'>('organisation')
  const [org, setOrg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const register = async () => {
    setBusy(true)
    setError(null)
    try {
      const { url } = await start(owner === 'personal' ? { owner } : { owner, org: org.trim() })
      window.location.assign(url)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border-subtle bg-surface-1 p-5" aria-label="Register the GitHub App">
      <div className="flex items-start gap-3">
        <AppWindow size={18} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
        <div>
          <h2 className="text-body font-medium text-text-primary">No GitHub App registered</h2>
          <p className="mt-0.5 text-small text-text-muted">
            Register the App once. GitHub creates it with Agenthix's starting permissions and sends you back here, where you install it on your GitHub accounts. GitHub's page suggests "Agenthix for" your organisation's name, which is what clients see when they install it; names are unique on GitHub, so if it's taken, change it there.
          </p>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-small font-medium text-text-primary">Who owns the App on GitHub</legend>
        <label className={`block cursor-pointer rounded-lg border p-3 ${owner === 'organisation' ? CARD_CHOSEN : 'border-border hover:border-border-strong'}`}>
          <input type="radio" name="app-owner" className="accent-accent mr-2" checked={owner === 'organisation'} onChange={() => setOwner('organisation')} />
          <span className="text-small font-medium text-text-primary">An organisation</span>
          <span className="ml-2 text-small text-text-muted">Recommended: its owners manage the App, whoever set it up</span>
        </label>
        {owner === 'organisation' && (
          <FormField label="GitHub organisation" htmlFor="github-org" hint="The name in its address, github.com/<name>. You must be one of its owners; HQ checks the name before sending you to GitHub.">
            <Input id="github-org" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="my-org" autoComplete="off" className="max-w-xs" />
          </FormField>
        )}
        <label className={`block cursor-pointer rounded-lg border p-3 ${owner === 'personal' ? CARD_CHOSEN : 'border-border hover:border-border-strong'}`}>
          <input type="radio" name="app-owner" className="accent-accent mr-2" checked={owner === 'personal'} onChange={() => setOwner('personal')} />
          <span className="text-small font-medium text-text-primary">My personal account</span>
          <span className="ml-2 text-small text-text-muted">Whoever is signed in to GitHub owns it</span>
        </label>
      </fieldset>
      <ShowAttention text={error} title="The App was not registered" onClose={() => setError(null)} />
      <Button onClick={() => void register()} disabled={busy || (owner === 'organisation' && !org.trim())}>
        Register the GitHub App {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ExternalLink size={13} aria-hidden />}
      </Button>
    </section>
  )
}
