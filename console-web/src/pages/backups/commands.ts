/**
 * *Take a backup now* and *Export a backup…*, each through the command route (spec §6's closed set). An export is of
 * a backup the machine holds, named by its id; an export here seals a backup taken for it there and then. Its key exists once, in the machine's sealed answer: it is held in
 * the screen's memory only, and the server hands it over on the first read (console/src/http/commandRuns.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackupSummary, HostResults } from '@agenthix/core'
import { runCommand } from '../../api/command'
import { exportRequest, takeRequest } from './words'

export type TakeState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'done'; backup: BackupSummary }
  | { phase: 'refused'; message: string }

/** *Take a backup now* on one machine; a refusal carries the host service's own words. */
export function useTakeBackup(fingerprint: string, pollMs?: number, onDone?: () => void): { state: TakeState; take: () => void; reset: () => void } {
  const [state, setState] = useState<TakeState>({ phase: 'idle' })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const take = useCallback(() => {
    setState({ phase: 'working' })
    void runCommand(fingerprint, takeRequest(), pollMs, () => alive.current).then(outcome => {
      if (!outcome) return
      if (!outcome.ok) return setState({ phase: 'refused', message: outcome.message })
      setState({ phase: 'done', backup: (outcome.result.result as HostResults['backup.take']).backup })
      onDone?.()
    })
  }, [fingerprint, pollMs, onDone])
  const reset = useCallback(() => setState({ phase: 'idle' }), [])
  return { state, take, reset }
}

export type MadeExport = { key: string; exportId: string; sizeBytes: number; night: string; takenAt: string }

export type ExportOutcome =
  | { ok: true; made: MadeExport }
  /** `backupTaken`: the backup made for the export was taken and stays on the machine as any other. */
  | { ok: false; message: string; backupTaken: boolean }

/** Takes a backup, then exports it with a key made for that export. Null when the screen went away meanwhile. */
export async function makeExport(
  fingerprint: string, onStep: (step: 'taking' | 'sealing') => void, pollMs?: number, stillWanted: () => boolean = () => true,
): Promise<ExportOutcome | null> {
  onStep('taking')
  const taken = await runCommand(fingerprint, takeRequest(), pollMs, stillWanted)
  if (!taken) return null
  if (!taken.ok) return { ok: false, message: taken.message, backupTaken: false }
  const backup = (taken.result.result as HostResults['backup.take']).backup
  onStep('sealing')
  let request
  try {
    request = exportRequest(backup.id)
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), backupTaken: true }
  }
  const exported = await runCommand(fingerprint, request, pollMs, stillWanted)
  if (!exported) return null
  if (!exported.ok) return { ok: false, message: exported.message, backupTaken: true }
  const r = exported.result.result as HostResults['backup.export']
  if (!r.key) return { ok: false, message: 'The export was made, but its key did not reach this screen, so the export cannot be opened. Make another.', backupTaken: true }
  return { ok: true, made: { key: r.key, exportId: r.exportId, sizeBytes: r.sizeBytes, night: backup.night, takenAt: backup.takenAt } }
}
