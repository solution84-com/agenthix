/**
 * A machine's nights (spec §12): what its host service lists with `backup.list`, read through the Fleet Console's
 * `GET /api/hosts/:fp/backups`, and their words. Only what a backup's header says to anyone, its size and where it
 * is: never a folder or a key.
 */
import { useCallback, useEffect, useState } from 'react'
import type { BackupListed, HostResults } from '@agenthix/core'
import { api } from '../../api/client'
import { sizeWords } from './words'

export type NightsState =
  | { phase: 'loading' }
  | { phase: 'ready'; list: HostResults['backup.list'] }
  | { phase: 'failed'; message: string }

/** The machine's nights, read once when asked and again with `refresh`; nothing while `enabled` is false. */
export function useNights(fingerprint: string, enabled = true): NightsState & { refresh: () => void } {
  const [state, setState] = useState<NightsState>({ phase: 'loading' })
  const [asked, setAsked] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let live = true
    setState({ phase: 'loading' })
    api<HostResults['backup.list']>(`/hosts/${fingerprint}/backups`)
      .then(list => { if (live) setState({ phase: 'ready', list }) })
      .catch(err => { if (live) setState({ phase: 'failed', message: err instanceof Error ? err.message : String(err) }) })
    return () => { live = false }
  }, [fingerprint, enabled, asked])
  const refresh = useCallback(() => setAsked(n => n + 1), [])
  return { ...state, refresh }
}

const KIND: Record<BackupListed['kind'], string> = {
  nightly: 'Nightly', now: 'Taken by hand', beforeRestore: 'Taken before a restore', beforeUpgrade: 'Taken before an upgrade',
}

/** `Mon 12 Oct 2026`: the night a backup belongs to, a day in the machine's own calendar. */
export function nightName(night: string): string {
  const [y, m, d] = night.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const clock = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Where it is, in words: the machine's own copy opens with its key; a copy in the backup location only with the person's. */
export function whereWords(b: BackupListed, machineName: string): string {
  if (b.onMachine && b.inLocation) return `On ${machineName} and in the backup location`
  return b.onMachine ? `On ${machineName} only` : 'In the backup location only'
}

/** One night in a line: `Nightly · taken 13 Oct, 02:00 · 52 MB`. */
export function nightLine(b: BackupListed): string {
  return `${KIND[b.kind]} · taken ${clock(b.takenAt)} · ${sizeWords(b.sizeBytes)}`
}

/** For the drop-down: `Mon 12 Oct 2026 · Nightly`. */
export const nightLabel = (b: BackupListed): string => `${nightName(b.night)} · ${KIND[b.kind]}`

/** Why the list may be short: the backup location could not be read just now. */
export function locationWords(list: HostResults['backup.list'], machineName: string): string | null {
  if (list.location === 'unreadable') return `The backup location could not be read from ${machineName} just now, so only the nights kept on ${machineName} are listed.`
  return null
}
