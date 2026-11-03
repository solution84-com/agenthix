import { useEffect, useState } from 'react'
import { Lock, RotateCcw } from 'lucide-react'
import { useAction, useQuery, getMainVersions, restoreVersion } from 'wasp/client/operations'
import type { MainVersion } from '@agenthix/core'
import { FILES_BUTTON } from '@agenthix/ui/projects'
import type { MainVersionsView } from '../../branches/views'
import { useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { VIEWER_REASON, plural, restoreNotice, whenText } from '../words'
import type { WorkflowPlace } from '../../workflows/pages/workflowTypes'
import { DeployList } from './DeployList'

/**
 * Git with `main` chosen (spec part 3, *main's versions, and Restore*; *Deploying*): it is protected, its versions
 * newest first with *Restore* on each but the newest, and a quiet *Deploy…*. There is no merge here.
 */
export function MainGitPanel({ workspaceId, place, main, canAct, onChanged }: {
  workspaceId: string
  /** The workspace's place, whose approved workflows *Deploy…* lists. */
  place: WorkflowPlace
  main: { name: string; head: string; versionCount: number }
  canAct: boolean
  onChanged: () => void
}) {
  const [before, setBefore] = useState<string | null>(null)
  const [older, setOlder] = useState<MainVersion[]>([])
  const { data, error, refetch } = useQuery(getMainVersions, { workspaceId, before: null })
  const { data: more } = useQuery(getMainVersions, { workspaceId, before: before ?? '' }, { enabled: before !== null })
  useOnWorkspaceChange(refetch)
  const first = data as MainVersionsView | undefined
  const next = more as MainVersionsView | undefined
  useEffect(() => { if (next) setOlder(o => [...o, ...next.versions.filter(v => !o.some(x => x.commit === v.commit))]) }, [next])
  // A new version on main starts the list again from the newest.
  useEffect(() => { setBefore(null); setOlder([]) }, [main.head])
  const versions = [...(first?.versions ?? []), ...older]
  const hasMore = (before === null ? first?.hasMore : next?.hasMore) ?? false
  const [deploy, setDeploy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <div className="space-y-3 px-3 py-2 text-small" data-testid="main-git">
      <div className="space-y-1 text-text-secondary">
        <p className="flex items-center gap-1.5"><Lock size={13} aria-hidden /> Protected. Moves forward only, by merging a finished branch.</p>
        <p className="flex items-center gap-2">
          <span>At version {main.versionCount}</span>
          <button type="button" className="text-accent hover:underline" aria-expanded={deploy} onClick={() => setDeploy(d => !d)}>Deploy…</button>
        </p>
        {deploy && <DeployList place={place} workspaceId={workspaceId} />}
        {notice && <p role="status" className="text-text-secondary">{notice}</p>}
      </div>
      <section aria-label="Versions">
        <h3 className="flex items-center gap-2 font-semibold text-text-primary">
          Versions <span className="rounded-full bg-surface-2 px-1.5 text-micro">{main.versionCount}</span>
        </h3>
        {error && <p role="status" className="mt-1 text-text-muted">{error.message}</p>}
        {!first && !error && <p className="mt-1 text-text-muted">Loading…</p>}
        <ul className="mt-1">
          {versions.map((v, i) => (
            <VersionRow key={v.commit} workspaceId={workspaceId} version={v} newest={i === 0} expectedMain={main.head} canAct={canAct}
              onDone={words => { setNotice(words); onChanged() }} />
          ))}
        </ul>
        {hasMore && versions.length > 0 && (
          <button type="button" className="mt-1 text-accent hover:underline" onClick={() => setBefore(versions[versions.length - 1].commit)}>
            Show older versions
          </button>
        )}
        {!canAct && <p className="mt-2 text-micro text-text-muted">{VIEWER_REASON}</p>}
      </section>
    </div>
  )
}

function VersionRow({ workspaceId, version, newest, expectedMain, canAct, onDone }: {
  workspaceId: string
  version: MainVersion
  newest: boolean
  expectedMain: string
  canAct: boolean
  onDone: (words: string) => void
}) {
  const restore = useAction(restoreVersion)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      const result = await restore({ workspaceId, versionCommit: version.commit, expectedMain })
      onDone(restoreNotice(result, version.number))
    } catch (e) {
      onDone(e instanceof Error ? e.message : 'The restore did not go through. Nothing was changed.')
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }
  return (
    <li className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-surface-hover">
      <span className="w-8 shrink-0 font-mono text-text-muted">v{version.number}</span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-text-primary" title={version.subject}>{version.subject}{newest && <span className="text-micro text-success"> · now</span>}</p>
        <p className="text-micro text-text-muted">{version.author.name} · {plural(version.files, 'file')} · {whenText(version.at)}</p>
        {asking && (
          <div className="mt-1 space-y-1">
            <p className="text-micro text-text-secondary">main gets a new version with exactly the files of version {version.number}. Nothing is deleted from the history.</p>
            <div className="flex gap-2">
              <button type="button" className={FILES_BUTTON} disabled={busy} onClick={() => void go()}>Restore version {version.number}</button>
              <button type="button" className="text-micro text-text-secondary hover:underline" onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {canAct && !newest && !asking && (
        <button type="button" title="Puts main back as it was at this version, as a new version" onClick={() => setAsking(true)}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-micro text-text-secondary opacity-0 hover:bg-surface-1 focus:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
          <RotateCcw size={11} aria-hidden className="mr-1 inline" />Restore
        </button>
      )}
    </li>
  )
}
