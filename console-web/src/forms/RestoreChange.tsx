import { useEffect, useRef, useState } from 'react'
import type { BackupListed } from '@agenthix/core'
import { FormField, Input } from '@agenthix/ui/primitives'
import { DropDown, laterHint, Notice, parseWhen } from '../components'
import { postAndFollow } from '../api/command'
import { useSearchParam } from '../router'
import type { FleetHost } from '../pages/dashboard/types'
import { locationWords, nightLabel, nightName, useNights, whereWords } from '../pages/backups/nights'
import { useDraft, useDraftsAlive } from './drafts'
import { MaintenanceEnding } from './MaintenanceEnding'
import { useWhenChoice, type ChangeRun } from './useChangeCommand'

/** The words of what a restore does, in order, for HQ with its own site or for a site alone. */
export function restoreSteps(hq: boolean, machineName: string, night: string | null): string[] {
  const thing = hq ? 'HQ and its own site' : `The site ${machineName}`
  const to = night ? `the night of ${nightName(night)}` : 'that night'
  return [
    `What is there now is backed up first, so this restore can be undone: that backup is listed here afterwards.`,
    `${thing} ${hq ? 'are' : 'is'} stopped, restored to ${to}, and started again.`,
    hq
      ? 'Anything done in HQ since that night is lost: accounts, projects, runs and settings go back to how they were.'
      : 'Anything done on the site since that night is lost: its runs and the files in its workspaces go back to how they were.',
    `Done at a time, members whose work it affects see a notice from when it is planned; done now, they are not told before. ${hq ? 'Once HQ is back, it takes back the workspaces its sites still hold and tells its organisation admins about the rest.' : 'Once the site is back, HQ tells its organisation admins what was lost.'}`,
  ]
}

export const sameName = (typed: string, name: string): boolean => typed.trim().toLowerCase() === name.toLowerCase()

const LOCATION_NOW = "A copy in the backup location is restored now, with its key: the key is never kept for later. To restore at a time, choose a night kept on the machine."

/**
 * *Restore a backup* (spec §12, §14): a night the machine lists, HQ with its own site on HQ's machine or a site alone,
 * after what is there now is backed up. Reached from *Plan maintenance* and from *Restore…* beside a night on the
 * machine's backups (`?night=<id>`). The machine's name is typed to confirm; a copy only in the backup location needs
 * the location's key, sealed to the machine and never kept.
 */
export function RestoreChange({ host, pollMs = 1500 }: { host: FleetHost; pollMs?: number }) {
  const hq = host.hqMachine
  const nights = useNights(host.fingerprint)
  const asked = useSearchParam('night')
  const [chosenId, setChosen] = useDraft<string | null>('night', asked)
  // *Restore…* beside another night, with the panel already open, chooses that one.
  useEffect(() => { if (asked) setChosen(asked) }, [asked, setChosen])
  const [typed, setTyped] = useState('')
  const [key, setKey] = useState('')
  const [errors, setErrors] = useState<{ night?: string; key?: string; typed?: string; when?: string }>({})
  const [when, setWhen] = useWhenChoice()
  const [run, setRun] = useDraft<ChangeRun>('run', { phase: 'idle' })
  const alive = useDraftsAlive()
  const askedOnline = useRef(false)
  const [askedNow, setAskedNow] = useState(false)

  const list = nights.phase === 'ready' ? nights.list.backups : []
  const chosen: BackupListed | null = list.find(b => b.id === chosenId) ?? null
  const fromLocation = chosen !== null && !chosen.onMachine
  useEffect(() => { if (run.phase === 'done' || run.phase === 'scheduled') nights.refresh() }, [run.phase, nights.refresh])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const time = fromLocation ? { ok: true as const, at: null } : parseWhen(when, new Date())
    const next = {
      night: chosen ? undefined : 'Choose the night to go back to.',
      key: fromLocation && !key.trim() ? "Type the backup location's key." : undefined,
      typed: sameName(typed, host.machineName) ? undefined : `Type ${host.machineName} to confirm.`,
      when: time.ok ? undefined : time.error,
    }
    setErrors(next)
    if (!chosen || next.key || next.typed || !time.ok) return
    askedOnline.current = host.online
    setAskedNow(time.at === null)
    setRun({ phase: 'working' })
    const body = { backupId: chosen.id, from: fromLocation ? 'location' : 'machine', ...(fromLocation ? { key: key.trim() } : {}), confirmName: typed.trim(), at: time.at }
    setKey('')
    setTyped('')
    void postAndFollow(`/hosts/${host.fingerprint}/restore`, body, pollMs, alive).then(outcome => {
      if (!outcome) return
      if (!outcome.ok) return setRun({ phase: 'refused', message: outcome.message })
      setRun(time.at ? { phase: 'scheduled', at: time.at } : { phase: 'done', result: outcome.result.result })
    })
  }

  // HQ stops while it is restored, and the Fleet Console reaches HQ's machine through HQ: going quiet once asked is it.
  const quiet = hq && askedNow && run.phase === 'working' && askedOnline.current && !host.online
  const thing = hq ? 'HQ' : host.machineName

  return (
    <form onSubmit={submit} noValidate aria-label="Restore a backup">
      <div className="mb-3 flex flex-col gap-3">
        {nights.phase === 'loading' && <p role="status" className="text-small text-text-secondary">Asking {host.machineName} which nights it holds…</p>}
        {nights.phase === 'failed' && (
          <Notice kind="alert" title="The nights could not be listed" retry={nights.refresh}>{nights.message}</Notice>
        )}
        {nights.phase === 'ready' && (
          <>
            <DropDown label="Night" placeholder="Choose the night to go back to" value={chosen?.id ?? null} onChange={id => { setChosen(id); setErrors({}) }}
              refusal={list.length === 0 ? { reason: `${host.machineName} holds no backup it can restore yet. It backs up each night at its backup time.` } : undefined}
              options={list.map(b => ({ key: b.id, label: nightLabel(b), hint: whereWords(b, host.machineName) }))} />
            {errors.night && <p className="text-small text-danger">{errors.night}</p>}
            {locationWords(nights.list, host.machineName) && <p className="text-small text-text-secondary">{locationWords(nights.list, host.machineName)}</p>}
          </>
        )}
        <ol aria-label="What happens" className="flex list-decimal flex-col gap-1.5 pl-5 text-small text-text-primary">
          {restoreSteps(hq, host.machineName, chosen?.night ?? null).map(s => <li key={s}>{s}</li>)}
        </ol>
        {fromLocation && (
          <FormField label="The backup location's key" htmlFor="restore-key" error={errors.key}
            hint={`The key shown when the backup location was set. It is sealed to ${host.machineName} for this restore and kept nowhere.`}>
            <Input id="restore-key" type="password" value={key} autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" onChange={e => setKey(e.target.value)} />
          </FormField>
        )}
        <FormField label={`Type ${host.machineName} to confirm`} htmlFor="restore-confirm" error={errors.typed}>
          <Input id="restore-confirm" value={typed} autoComplete="off" spellCheck={false} placeholder={host.machineName} onChange={e => setTyped(e.target.value)} />
        </FormField>
      </div>
      <MaintenanceEnding idPrefix="restore-when" laterHint={laterHint(host.figures?.backups.nightlyAt)} machineName={host.machineName} when={when} onWhen={setWhen} whenError={errors.when}
        run={run} danger refusedTitle="Not restored" nowOnly={fromLocation ? LOCATION_NOW : undefined}
        nowHint={`Now: what is there is backed up, then ${thing} is restored to that night. Members are not told before.`}
        done={{ title: 'Restored.', text: `${thing} is back to the night of ${chosen ? nightName(chosen.night) : 'the night chosen'}, and running. The state just before it is kept as a backup taken before a restore.` }} />
    </form>
  )
}
