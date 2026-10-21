import { useEffect, useRef, useState } from 'react'
import type { HostResults } from '@agenthix/core'
import { FormField, Input } from '@agenthix/ui/primitives'
import { Notice, parseWhen } from '../components'
import type { FleetHost } from '../pages/dashboard/types'
import { useDraft } from './drafts'
import { MaintenanceEnding } from './MaintenanceEnding'
import { forgetHqUpgrade, hqUpgradeArrived, noteHqUpgrade, useHqUpgrade } from './hqUpgrade'
import { useChangeCommand, useWhenChoice } from './useChangeCommand'

const VERSION = /^\d+\.\d+\.\d+$/

/** The version to send, or the sentence beside the field. */
export function parseVersion(typed: string, running: string | null): { ok: true; version: string } | { ok: false; error: string } {
  const v = typed.trim()
  if (!VERSION.test(v)) return { ok: false, error: 'Give the version as three numbers, such as 0.3.0.' }
  if (v === running) return { ok: false, error: `It runs ${v} already.` }
  return { ok: true, version: v }
}

/**
 * *Upgrade* (spec §11, §14): HQ with its own site on HQ's machine, or a site, to a published version. The machine
 * checks the version is published and newer, takes a backup first, and rolls back if it does not come up healthy.
 */
export function UpgradeChange({ host, pollMs }: { host: FleetHost; pollMs?: number }) {
  const target = host.hqMachine ? 'hq' : 'site'
  const running = host.figures?.installs.find(i => i.target === target)?.version ?? null
  const what = target === 'hq' ? 'HQ' : host.machineName
  const [typed, setTyped] = useDraft('version', '')
  const [error, setError] = useState<string | undefined>()
  const [when, setWhen] = useWhenChoice()
  const [whenError, setWhenError] = useState<string | undefined>()
  const { run, send } = useChangeCommand(host.fingerprint, pollMs)
  // HQ restarts on the new version, and the Fleet Console reaches its machine through HQ: the answer to an upgrade of
  // HQ asked now may never come back. Going quiet once asked, or answering on the new version, is that answer.
  const hqAsked = useHqUpgrade()
  const askedOnline = useRef(false)
  const following = target === 'hq' && run.phase === 'working' && hqAsked !== null
  const [landed, setLanded] = useState<string | null>(null)
  const arrivedNow = following && hqUpgradeArrived(hqAsked, host)
  const arrived = landed !== null && run.phase === 'working'
  const restarting = following && !arrivedNow && askedOnline.current && !host.online
  useEffect(() => {
    if (arrivedNow && hqAsked) setLanded(hqAsked.version)
    if (target === 'hq' && (run.phase === 'done' || run.phase === 'refused' || arrivedNow)) forgetHqUpgrade()
  }, [target, run.phase, arrivedNow, hqAsked])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = parseVersion(typed, running)
    setError(v.ok ? undefined : v.error)
    const time = parseWhen(when, new Date())
    setWhenError(time.ok ? undefined : time.error)
    if (!v.ok || !time.ok) return
    if (target === 'hq' && time.at === null) {
      askedOnline.current = host.online
      noteHqUpgrade(v.version)
    }
    send({ op: 'upgrade', target, version: v.version }, time.at)
  }
  const result = run.phase === 'done' ? run.result as HostResults['upgrade'] : arrived && landed ? { version: landed, rolledBack: false } : null

  return (
    <form onSubmit={submit} noValidate aria-label="Upgrade">
      <p className="mb-3 text-small text-text-secondary">
        {what} runs {running ?? 'a version not reported yet'}.{target === 'hq' ? ' HQ\'s own site upgrades with it.' : ''} The machine takes a backup first, and rolls back to what runs now if the new version does not come up healthy.
      </p>
      <FormField label="Upgrade to version" htmlFor="upgrade-version" error={error} hint="The machine checks it is published and newer than what runs.">
        <Input id="upgrade-version" value={typed} placeholder="0.3.0" autoComplete="off" onChange={e => setTyped(e.target.value)} />
      </FormField>
      <div className="mt-3" />
      <MaintenanceEnding idPrefix="upgrade-when" machineName={host.machineName} when={when} onWhen={setWhen} whenError={whenError} run={arrived ? { phase: 'done' } : run}
        refusedTitle="Not upgraded" nowHint={`Now: a backup is taken, then ${what} starts on the new version.`}
        done={{
          title: result?.rolledBack ? 'Rolled back.' : 'Upgraded.',
          tone: result?.rolledBack ? 'warning' : 'healthy',
          text: result?.rolledBack ? `The new version did not come up healthy, so ${what} runs what it ran before.` : `${what} runs ${result?.version ?? 'the new version'}.`,
        }} />
      {restarting && (
        <div className="mt-3">
          <Notice title={`HQ is restarting on ${hqAsked?.version ?? 'the new version'}.`}>
            It comes back by itself. While it restarts nobody can sign in, and {host.machineName} cannot answer here, since its answers come through HQ. If the new version does not come up healthy, it rolls back to {running ?? 'what ran before'}. HQ's page follows it.
          </Notice>
        </div>
      )}
    </form>
  )
}
