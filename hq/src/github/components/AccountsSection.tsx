import { useMemo, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useQuery, useAction, getProjects, getOrgPeople, ignoreGitHubAccount } from 'wasp/client/operations'
import type { GitHubPermissions } from '@agenthix/core'
import { Button, StatePill } from '@agenthix/ui/primitives'
import { ErrorLine } from '../../workflows/components/ErrorLine'
import { AllowDialog } from './AllowDialog'
import { InstallLinkDialog } from './InstallLinkDialog'
import { acceptance, accountKind, agoWords, cannotCreateWords, POLL_WORDS, reachWords, ruleWords, type AccountRow } from './githubWords'
import { useAccountPolling } from './useAccountPolling'

export type AccountsData = {
  slug: string
  appPermissions: GitHubPermissions | null
  accounts: (AccountRow & { decidedAt: Date | string | null; acceptedPermissions: GitHubPermissions | null })[]
  poll: { everyMs: number; forMs: number }
}

/** GitHub accounts (G1, parts 2–4): the ones that want to connect, the table, and how to install the App somewhere. */
export function AccountsSection({ data, onChanged }: { data: AccountsData; onChanged: () => void }) {
  const { data: projects } = useQuery(getProjects)
  const { data: people } = useQuery(getOrgPeople)
  const ignore = useAction(ignoreGitHubAccount)
  const [dialog, setDialog] = useState<{ account: AccountRow; mode: 'allow' | 'change' } | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const known = useMemo(() => data.accounts.map((a) => a.installationId), [data.accounts])
  const { waiting, start } = useAccountPolling(data.poll, known, onChanged)

  const projectNames = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])
  const personNames = useMemo(() => new Map((people?.people ?? []).map((r) => [r.person.userId, r.person.name])), [people])
  const wants = data.accounts.filter((a) => a.state === 'WANTS_TO_CONNECT')
  const allowed = data.accounts.filter((a) => a.state === 'ALLOWED')
  const ignored = data.accounts.filter((a) => a.state === 'IGNORED')
  const installUrl = `https://github.com/apps/${encodeURIComponent(data.slug)}/installations/new`

  const doIgnore = async (a: AccountRow) => {
    setError(null)
    try { await ignore({ id: a.id }); onChanged() } catch (e) { setError(e) }
  }

  return (
    <section aria-label="GitHub accounts" className="space-y-4">
      <div>
        <h2 className="text-h3 font-semibold text-text-primary">2 · GitHub accounts</h2>
        <p className="text-small text-text-muted">
          The GitHub organisations, or people's GitHub accounts, where the App has been installed on GitHub. A workspace connects its repository in one of them.
        </p>
      </div>
      <ErrorLine error={error} />
      {waiting && <p role="status" className="flex items-center gap-2 text-small text-text-muted"><Loader2 size={12} className="animate-spin" aria-hidden />{POLL_WORDS}</p>}

      {wants.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3" data-testid="wants-to-connect">
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-text-primary">{a.login} wants to connect</p>
            <p className="text-small text-text-secondary">
              An owner of the GitHub {accountKind(a.type)} {a.login} installed your App on GitHub. HQ won't use it until you allow it.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void doIgnore(a)}>Ignore</Button>
          <Button size="sm" onClick={() => setDialog({ account: a, mode: 'allow' })}>Allow</Button>
        </div>
      ))}

      {allowed.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border-subtle">
          <table className="w-full text-left text-small" data-testid="accounts-table">
            <thead className="bg-surface-2 text-micro uppercase tracking-wide text-text-muted">
              <tr><th className="px-3 py-2">GitHub account</th><th className="px-3 py-2">Repositories the App can reach</th><th className="px-3 py-2">Permissions</th><th className="px-3 py-2">Which projects can connect</th></tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {allowed.map((a) => <AccountTableRow key={a.id} a={a} app={data.appPermissions} projectNames={projectNames} personNames={personNames} onChange={() => setDialog({ account: a, mode: 'change' })} onIgnore={() => void doIgnore(a)} />)}
            </tbody>
          </table>
        </div>
      )}
      {allowed.length === 0 && wants.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-3 text-small text-text-muted">The App isn't installed anywhere yet. Install it on one of your GitHub accounts below.</p>}
      {ignored.length > 0 && (
        <p className="text-small text-text-muted">
          Ignored: {ignored.map((a, i) => (
            <span key={a.id}>{i > 0 && ', '}{a.login} <button type="button" className="text-accent hover:underline" onClick={() => setDialog({ account: a, mode: 'allow' })}>Allow</button></span>
          ))}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <a href={installUrl} target="_blank" rel="noopener noreferrer" onClick={start}
          className="inline-flex items-center gap-1.5 rounded-button border border-border bg-button-secondary px-4 py-2 text-body font-button text-text-primary hover:bg-surface-hover">
          Install on one of your GitHub accounts <ExternalLink size={12} aria-hidden />
        </a>
        <Button variant="secondary" onClick={() => { setLinkOpen(true); start() }}>Get an install link for a client</Button>
      </div>

      {dialog && <AllowDialog account={dialog.account} mode={dialog.mode} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged() }} />}
      {linkOpen && <InstallLinkDialog onClose={() => setLinkOpen(false)} />}
    </section>
  )
}

function AccountTableRow({ a, app, projectNames, personNames, onChange, onIgnore }: {
  a: AccountsData['accounts'][number]
  app: GitHubPermissions | null
  projectNames: Map<string, string>
  personNames: Map<string, string>
  onChange: () => void
  onIgnore: () => void
}) {
  const accepted = acceptance(app, a.acceptedPermissions)
  const cannot = cannotCreateWords(a)
  return (
    <tr className="align-top" data-testid="account-row">
      <td className="px-3 py-2"><span className="font-semibold text-text-primary">{a.login}</span> <span className="text-text-muted">{accountKind(a.type)}</span></td>
      <td className="px-3 py-2">
        <div>{reachWords(a)}</div>
        {cannot && <div className="text-text-muted">{cannot}{a.reach.selection === 'selected' && a.type === 'Organization' && <> · set Repository access to All repositories in the App's settings for {a.login} on GitHub</>}</div>}
      </td>
      <td className="px-3 py-2">
        {accepted.unknown ? <StatePill>Not known yet</StatePill>
          : accepted.current ? <StatePill tone="healthy">Current</StatePill>
            : <><StatePill tone="warning">Not yet accepted</StatePill><div className="text-text-muted">{accepted.missing.join(', ')}. Until {a.login} accepts on GitHub, its projects keep the older list.</div></>}
      </td>
      <td className="px-3 py-2">
        <div>{ruleWords(a, projectNames, personNames)}</div>
        <div className="mt-1 flex gap-3">
          <button type="button" className="text-accent hover:underline" onClick={onChange} aria-label={`Change which projects can connect to ${a.login}`}>Change</button>
          <button type="button" className="text-text-muted hover:text-danger hover:underline" onClick={onIgnore} aria-label={`Stop using ${a.login}`}>Ignore</button>
        </div>
        {a.decidedAt && <div className="text-micro text-text-muted">Allowed {agoWords(a.decidedAt)}</div>}
      </td>
    </tr>
  )
}
