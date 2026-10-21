import { useEffect, useState } from 'react'
import { BRANDING } from '@agenthix/core'
import { KeyValueRow, Notice, parseWhen } from '../components'
import type { FleetHost } from '../pages/dashboard/types'
import { useDraft } from './drafts'
import { noteHqSuspended } from './hqSuspend'
import { MaintenanceEnding } from './MaintenanceEnding'
import { useChangeCommand, useWhenChoice } from './useChangeCommand'

/**
 * *Suspend* HQ (board *Suspend, resume and erase*, spec §15): everything kept, now or at a time with notice. The Fleet
 * Console reaches HQ's machine through HQ, so once HQ stops, the answer cannot come back: the machine going quiet
 * after it was asked, having answered before, is that answer.
 */
export function SuspendChange({ host, pollMs }: { host: FleetHost; pollMs?: number }) {
  const { run, send } = useChangeCommand(host.fingerprint, pollMs)
  const [when, setWhen] = useWhenChoice()
  const [whenError, setWhenError] = useState<string | undefined>()
  const [asked, setAsked] = useDraft<{ at: string; online: boolean; now: boolean } | null>('asked', null)
  const wentQuiet = run.phase === 'working' && asked !== null && asked.online && !host.online
  const suspended = asked?.now === true && (run.phase === 'done' || wentQuiet)
  useEffect(() => { if (suspended && asked) noteHqSuspended(asked.at) }, [suspended, asked])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const time = parseWhen(when, new Date())
    setWhenError(time.ok ? undefined : time.error)
    if (!time.ok) return
    setAsked({ at: new Date().toISOString(), online: host.online, now: time.at === null })
    send({ op: 'suspend', target: 'hq' }, time.at)
  }
  return (
    <form onSubmit={submit} noValidate aria-label="Suspend HQ">
      <div className="mb-3 flex flex-col gap-3 text-body text-text-primary">
        <p>HQ stops. Nobody can sign in, sites wait for it, and no agent runs. Everything is kept — data, backups, credentials — and Resume, on HQ's page, starts it again as it was.</p>
        <div className="rounded-xl border border-border bg-card px-4 py-1">
          <KeyValueRow label="Members">see a notice, as for any planned interruption</KeyValueRow>
          <KeyValueRow label="Scheduled backups">none while suspended</KeyValueRow>
        </div>
      </div>
      <MaintenanceEnding idPrefix="suspend-when" machineName={host.machineName} when={when} onWhen={setWhen} whenError={whenError}
        run={wentQuiet ? { phase: 'done' } : run} danger refusedTitle="HQ was not suspended"
        nowHint="Now: runs pause after their current step, then HQ stops."
        done={{ title: 'HQ is suspended.', text: "Resume it from HQ's page." }} />
      {wentQuiet && (
        <div className="mt-3">
          <Notice>{host.machineName} stopped answering once HQ stopped, as it does: its answers come through HQ. If Resume gets no answer, run <code className="font-mono">{BRANDING.cliCommand} hq resume</code> on {host.machineName}.</Notice>
        </div>
      )}
    </form>
  )
}
