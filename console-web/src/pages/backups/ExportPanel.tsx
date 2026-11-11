import { useEffect, useRef, useState } from 'react'
import { Button, copyText, COPY_FAILED_WORDS } from '@agenthix/ui/primitives'
import { Card, KeyValueRow, Notice, Say } from '../../components'
import { whenIs } from '../dashboard/words'
import type { FleetHost } from '../dashboard/types'
import { makeExport, type MadeExport } from './commands'
import { carriesHq, keyFileName, keyFileText, sizeWords } from './words'
import { useExportDownload, type DownloadView } from './download'

type KeepAs = 'show' | 'file'
type Phase =
  | { phase: 'choose' }
  | { phase: 'working'; step: 'taking' | 'sealing' }
  | { phase: 'key'; made: MadeExport }
  | { phase: 'refused'; message: string; backupTaken: boolean }

/** Hands the key to the browser as a small file. The key goes nowhere else: it is made into a file here, in memory. */
function saveKeyFile(name: string, text: string): boolean {
  if (typeof URL.createObjectURL !== 'function') return false
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // Some browsers start the save after the click returns; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/** *Export a backup…* (board *Exporting a backup*): how to keep the key, the export made, the key once. */
export function ExportPanel({ host, now, onClose, pollMs }: { host: FleetHost; now: Date; onClose: () => void; pollMs?: number }) {
  const [keepAs, setKeepAs] = useState<KeepAs>('show')
  const [phase, setPhase] = useState<Phase>({ phase: 'choose' })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const start = () => {
    setPhase({ phase: 'working', step: 'taking' })
    void makeExport(host.fingerprint, step => alive.current && setPhase({ phase: 'working', step }), pollMs, () => alive.current).then(outcome => {
      if (!outcome) return
      setPhase(outcome.ok ? { phase: 'key', made: outcome.made } : { phase: 'refused', message: outcome.message, backupTaken: outcome.backupTaken })
    })
  }

  if (phase.phase === 'key') return <KeyOnce host={host} made={phase.made} keepAs={keepAs} now={now} onDone={onClose} pollMs={pollMs} />

  return (
    <Card className="max-w-2xl">
      <section aria-label="Export a backup">
        <h2 className="mb-1 text-h3 font-semibold text-text-primary">Export a backup</h2>
        <p className="mb-3 text-small text-text-secondary">
          An export is a copy you take away — to a disk, another provider, anywhere you like. It is sealed with a key made for this export alone.
        </p>
        <KeyValueRow label={`Backup, for ${host.siteName}`}>A backup taken now, for this export · {carriesHq(host) ? 'HQ and the site' : "the site's database and workspaces"}</KeyValueRow>
        <fieldset className="my-3" disabled={phase.phase === 'working'}>
          <legend className="mb-1.5 text-small font-semibold text-text-primary">How you keep its key</legend>
          <label className="mb-1.5 flex gap-2 text-small text-text-primary">
            <input type="radio" name="keepAs" checked={keepAs === 'show'} onChange={() => setKeepAs('show')} />
            <span><b className="font-semibold">Show the key once</b> — you copy it somewhere safe: a password manager, paper in a drawer.</span>
          </label>
          <label className="flex gap-2 text-small text-text-primary">
            <input type="radio" name="keepAs" checked={keepAs === 'file'} onChange={() => setKeepAs('file')} />
            <span><b className="font-semibold">Save the key as a small file</b> — keep it apart from the export.</span>
          </label>
        </fieldset>
        <Say warn lead="Without its key, this export is useless.">
          Nobody can open it without the key — there is no other copy of the key anywhere, and nobody can recover it for you.
        </Say>
        <p className="mt-2 text-small text-text-secondary">Every fleet admin and organisation admin is told that you made this export.</p>
        {phase.phase === 'refused' && (
          <Notice kind="alert" title="No export was made">
            {phase.message}{phase.backupTaken ? ` The backup taken for it stays on ${host.machineName} with its other backups.` : ''}
          </Notice>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={phase.phase === 'working'}>Cancel</Button>
          <Button variant="primary" onClick={start} disabled={host.online && phase.phase === 'working'}
            refusal={host.online ? undefined : { reason: `${host.machineName} is not answering, so no export can be made now.` }}>
            {phase.phase === 'working' ? (phase.step === 'taking' ? `Taking a sealed backup on ${host.machineName}…` : 'Sealing it with a key made for this export…')
              : phase.phase === 'refused' ? 'Try again' : 'Make the export'}
          </Button>
        </div>
      </section>
    </Card>
  )
}

function downloadWords(view: DownloadView & { phase: 'sending' }): string {
  return view.sizeBytes ? `Downloading… ${sizeWords(view.sentBytes)} of ${sizeWords(view.sizeBytes)}.` : 'Downloading…'
}

export function KeyOnce({ host, made, keepAs, now, onDone, pollMs }: {
  host: FleetHost; made: MadeExport; keepAs: KeepAs; now: Date; onDone: () => void; pollMs?: number
}) {
  const [stored, setStored] = useState(false)
  // Copying and saving the key say nothing when they work (the button turns to "Copied"); a failure is told.
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // A file that could not be saved leaves the key unseen, so it is shown after all.
  const [showAnyway, setShowAnyway] = useState(false)
  const download = useExportDownload(host.fingerprint, made.exportId, pollMs)
  const view = download.view
  const fileName = keyFileName(host.siteName, made.night)
  const copy = async () => {
    const ok = await copyText(made.key)
    setCopied(ok)
    setFailure(ok ? null : COPY_FAILED_WORDS)
  }
  const save = () => {
    let saved = false
    try { saved = saveKeyFile(fileName, keyFileText(made.key, host.siteName, made.exportId)) } catch { saved = false }
    setShowAnyway(!saved)
    setFailure(saved ? null : 'This browser could not save the file. The key is shown below: copy it.')
  }
  const shown = keepAs === 'show' || showAnyway
  return (
    <Card className="max-w-2xl">
      <section aria-label="The key for this export">
        <h2 className="mb-1 text-h3 font-semibold text-text-primary">The key for this export</h2>
        <p className="mb-3 text-small text-text-secondary">
          {keepAs === 'show' ? 'Shown once. Copy it now — it cannot be shown again.' : `Save it now as ${fileName} — it cannot be made again.`}
        </p>
        {shown && (
          <code aria-label="The key" className="mb-2 block break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-body text-text-primary">{made.key}</code>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {keepAs === 'file' && <Button variant="secondary" onClick={save}>Save the key file</Button>}
          {shown && <Button variant="secondary" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy the key'}</Button>}
          {failure && <Notice kind="alert" title="The key was not saved">{failure}</Notice>}
        </div>
        <label className="mb-3 flex gap-2 text-small text-text-primary">
          <input type="checkbox" checked={stored} onChange={e => setStored(e.target.checked)} />
          I have stored the key somewhere safe, apart from the export
        </label>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="break-all font-mono text-small font-semibold text-text-primary">{made.exportId}</div>
            <div className="text-micro text-text-muted">{sizeWords(made.sizeBytes)} · sealed · from {whenIs(made.takenAt, now)}</div>
          </div>
          <Button variant="primary" onClick={download.start} disabled={!stored || view.phase === 'sending'}>
            {view.phase === 'sending' ? downloadWords(view) : view.phase === 'done' ? 'Downloaded' : view.phase === 'failed' ? 'Download again' : 'Download the export'}
          </Button>
        </div>
        {!stored && <p className="mb-2 text-micro text-text-muted">The download unlocks once the box above is ticked.</p>}
        {view.phase === 'failed' && <Notice kind="alert" title="Not downloaded">{view.message}</Notice>}
        <p className="mt-2 text-small text-text-secondary">
          Keep the file and its key apart: whoever holds both can open it. Once downloaded, it is removed from {host.machineName};
          if nobody downloads it, {host.machineName} removes it a day after it was made.
        </p>
        <p className="mt-2 text-small text-text-secondary">Fleet admins and organisation admins have been told.</p>
        <div className="mt-4 flex justify-end">
          <Button variant={view.phase === 'done' ? 'primary' : 'secondary'} onClick={onDone} disabled={!stored}>Done</Button>
        </div>
        {!stored && <p className="mt-1 text-right text-micro text-text-muted">Done unlocks once the box above is ticked.</p>}
        {stored && view.phase !== 'done' && (
          <p className="mt-1 text-right text-micro text-text-muted">Not downloaded yet: once you leave this page, it cannot be downloaded from here.</p>
        )}
      </section>
    </Card>
  )
}
