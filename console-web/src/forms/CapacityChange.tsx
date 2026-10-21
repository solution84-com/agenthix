import { useState } from 'react'
import { FormField, Input } from '@agenthix/ui/primitives'
import { Notice, parseWhen } from '../components'
import type { FleetHost } from '../pages/dashboard/types'
import { memoryGbOf } from '../pages/site/words'
import { formOf, parseCapacityForm, type CapacityErrors, type CapacityForm } from './capacityForm'
import { useDraft } from './drafts'
import { MaintenanceEnding } from './MaintenanceEnding'
import { useChangeCommand, useWhenChoice } from './useChangeCommand'

/** *Change capacity* (board *Editing capacity; protections as a fact*): the four ceilings, sent as `capacity.set`. */
export function CapacityChange({ host, pollMs }: { host: FleetHost; pollMs?: number }) {
  const ceilings = host.figures?.ceilings ?? null
  if (!ceilings) return <Notice>Waiting for {host.machineName}'s first figures; its limits show here once it has sent them.</Notice>
  return <CapacityFields host={host} start={formOf(ceilings)} pollMs={pollMs} />
}

function CapacityFields({ host, start, pollMs }: { host: FleetHost; start: CapacityForm; pollMs?: number }) {
  // The form starts from the machine's ceilings once, and is the person's after that.
  const [form, setForm] = useDraft<CapacityForm>('capacity', start)
  const [errors, setErrors] = useState<CapacityErrors>({})
  const [when, setWhen] = useWhenChoice()
  const [whenError, setWhenError] = useState<string | undefined>()
  const { run, send } = useChangeCommand(host.fingerprint, pollMs)
  const total = host.figures?.resources.memory.totalBytes ?? null
  const set = (key: keyof CapacityForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseCapacityForm(form, total)
    setErrors(parsed.ok ? {} : parsed.errors)
    const time = parseWhen(when, new Date())
    setWhenError(time.ok ? undefined : time.error)
    if (parsed.ok && time.ok) send({ op: 'capacity.set', ceilings: parsed.ceilings }, time.at)
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Change capacity">
      <p className="mb-3 text-small text-text-secondary">The ceilings this site gives each agent run on {host.machineName}. HQ or a project may only lower them; a run gets the smaller.</p>
      <p className="mb-2 text-small font-semibold text-text-primary">Each run gets at most</p>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Memory (GB)" htmlFor="cap-memory" error={errors.memoryGb}>
          <Input id="cap-memory" inputMode="decimal" value={form.memoryGb} onChange={set('memoryGb')} />
        </FormField>
        <FormField label="Processors" htmlFor="cap-cpus" error={errors.cpus}>
          <Input id="cap-cpus" inputMode="decimal" value={form.cpus} onChange={set('cpus')} />
        </FormField>
        <FormField label="Processes" htmlFor="cap-processes" error={errors.processes}>
          <Input id="cap-processes" inputMode="numeric" value={form.processes} onChange={set('processes')} />
        </FormField>
        <FormField label="Runs at once" htmlFor="cap-at-once" error={errors.atOnce} hint={total ? `the machine has ${memoryGbOf(total)} GB memory` : undefined}>
          <Input id="cap-at-once" inputMode="numeric" value={form.atOnce} onChange={set('atOnce')} />
        </FormField>
      </div>
      <p className="my-3 text-small text-text-muted">Protections are not set here: they belong to the machine.</p>
      <MaintenanceEnding idPrefix="cap-when" machineName={host.machineName} when={when} onWhen={setWhen} whenError={whenError} run={run}
        refusedTitle="Not saved" nowHint="Now: new runs get these limits at once; runs already going keep theirs."
        done={{ title: 'Saved.', text: 'New runs get these limits.' }} />
    </form>
  )
}
