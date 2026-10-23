import { useState } from 'react'
import { buildSupportBundle } from 'wasp/client/operations'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'
import type { SupportBundle } from '../supportBundle'
import { FleetAdminOnly } from './FleetAdminOnly'
import { BUTTON } from './styles'
import { base64ToBytes, bytesText, errorMessage, saveFile } from './diagnosticsWords'
import { BRANDING } from '@agenthix/core'

const FIELD = 'rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-small text-text-primary'

const GOES_IN = [
  ['Versions', 'HQ, each site, its protocol, its agent image'],
  ['Settings that are set', 'The name of each setting and whether it is set. Never a value'],
  ['Health', "HQ, and each site's last report"],
  ['Recent errors', 'The last 7 days, as on Logs and diagnostics'],
] as const

const NEVER = [
  ['What people wrote and what agents replied', 'No message text, task descriptions, or tool call inputs and outputs'],
  ['Files', "No project files, workspaces or people's files"],
  ['Secrets', 'No keys, tokens, passwords or model logins, even where a log line held one'],
  ['Who', 'People, projects and agents are named person-1, project-2, agent-3, the same throughout'],
] as const

function Item({ mark, title, line }: { mark: string; title: string; line: string }) {
  return (
    <li className="flex gap-3 py-2">
      <span className="w-4 shrink-0 text-text-muted" aria-hidden>{mark}</span>
      <div>
        <div className="text-body font-medium text-text-primary">{title}</div>
        <div className="text-small text-text-muted">{line}</div>
      </div>
    </li>
  )
}

/** Organisation › Infrastructure › Logs and diagnostics › Support bundle. */
export function BundlePage() {
  return (
    <OrgAdminPage
      area="infrastructure"
      title="Support bundle"
      trail={[{ label: 'Logs and diagnostics', href: '/admin/infrastructure/diagnostics' }]}
      wide
    >
      <OrgAdminHeading title="Support bundle">One file to attach when you ask someone for help. {BRANDING.displayName} sends it nowhere: you decide who gets it.</OrgAdminHeading>
      <FleetAdminOnly what="The support bundle"><BundleBody /></FleetAdminOnly>
    </OrgAdminPage>
  )
}

function BundleBody() {
  const [logs, setLogs] = useState<'24h' | '7d'>('24h')
  const [levels, setLevels] = useState<'all' | 'problems'>('all')
  const [bundle, setBundle] = useState<SupportBundle | null>(null)
  const [busy, setBusy] = useState(false)
  const [seeing, setSeeing] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // Built when asked, with the choices above; changing a choice drops the one on screen.
  async function build(then: 'see' | 'download') {
    setBusy(true)
    setNote(null)
    try {
      const made = await buildSupportBundle({ logs, levels })
      setBundle(made)
      if (then === 'see') setSeeing(true)
      else saveFile(made.fileName, base64ToBytes(made.zipBase64), 'application/zip')
    } catch (err) {
      setNote(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const choose = <T,>(set: (v: T) => void) => (v: T) => { set(v); setBundle(null); setSeeing(false) }

  return (
    <div className="space-y-8">
      <section aria-label="What goes in">
        <h2 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">What goes in</h2>
        <ul className="divide-y divide-border-subtle border-y border-border-subtle">
          {GOES_IN.map(([t, l]) => <Item key={t} mark="✓" title={t} line={l} />)}
          <li className="flex gap-3 py-2">
            <span className="w-4 shrink-0 text-text-muted" aria-hidden>✓</span>
            <div>
              <div className="text-body font-medium text-text-primary">Logs</div>
              <div className="mb-1 text-small text-text-muted">From HQ and each connected site</div>
              <div className="flex flex-wrap gap-2">
                <select aria-label="Logs from" className={FIELD} value={logs} onChange={e => choose(setLogs)(e.target.value as '24h' | '7d')}>
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                </select>
                <select aria-label="Levels" className={FIELD} value={levels} onChange={e => choose(setLevels)(e.target.value as 'all' | 'problems')}>
                  <option value="all">Errors, warnings and information</option>
                  <option value="problems">Errors and warnings</option>
                </select>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section aria-label="Never in it">
        <h2 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Never in it</h2>
        <ul className="divide-y divide-border-subtle border-y border-border-subtle">
          {NEVER.map(([t, l]) => <Item key={t} mark="–" title={t} line={l} />)}
        </ul>
      </section>

      <section aria-label="The file" className="rounded-xl border border-border bg-surface-1 p-4">
        {bundle ? (
          <>
            <p className="font-mono text-small text-text-primary">{bundle.fileName}</p>
            <p className="mb-3 text-small text-text-muted">About {bytesText(bundle.sizeBytes)} · {bundle.covers}</p>
          </>
        ) : (
          <p className="mb-3 text-small text-text-muted">It is made when you open or download it, from what HQ and its sites hold now.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} disabled={busy} onClick={() => (bundle ? setSeeing(!seeing) : build('see'))}>
            {seeing ? 'Hide what is in it' : 'See what is in it'}
          </button>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => (bundle ? saveFile(bundle.fileName, base64ToBytes(bundle.zipBase64), 'application/zip') : build('download'))}>
            {busy ? 'Making it…' : 'Download'}
          </button>
        </div>
        {note && <p role="alert" className="mt-3 text-small text-danger">{note}</p>}
      </section>

      {bundle && seeing && (
        <section aria-label="What is in it" className="space-y-4">
          {bundle.files.map(file => (
            <details key={file.path} className="rounded-lg border border-border bg-surface-1">
              <summary className="cursor-pointer px-3 py-2 font-mono text-small text-text-primary">{file.path}</summary>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-border p-3 font-mono text-micro text-text-secondary">{file.text}</pre>
            </details>
          ))}
        </section>
      )}
    </div>
  )
}
