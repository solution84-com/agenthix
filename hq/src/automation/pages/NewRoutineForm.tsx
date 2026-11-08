import { useState } from 'react'
import { useQuery, getAgents } from 'wasp/client/operations'
import { describeSchedule, nextCronTime, routineScheduleProblem } from '@agenthix/core'
import { Button, FormField, Input, NativeSelect, Textarea } from '@agenthix/ui/primitives'

export type RoutineFormValue = { title: string; agentId: string | null; instructions: string; cron: string; timezone: string }

const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/**
 * The fields a routine is made with, kept plain until the Routines screens replace them: a name, an agent, the
 * instructions, and the schedule as a cron rule and a timezone, read back in words with its next time.
 */
export function NewRoutineForm({ submitLabel, onCancel, onSubmit }: {
  submitLabel: string
  onCancel: () => void
  onSubmit: (value: RoutineFormValue) => Promise<void>
}) {
  const { data: agents } = useQuery(getAgents)
  const [value, setValue] = useState<RoutineFormValue>({ title: '', agentId: null, instructions: '', cron: '0 9 * * 1-5', timezone: localZone() })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const problem = routineScheduleProblem(value.cron, value.timezone)
  const next = problem ? null : nextCronTime(value.cron, value.timezone, new Date())
  const set = (patch: Partial<RoutineFormValue>) => setValue(v => ({ ...v, ...patch }))

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onSubmit(value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Nothing was changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit() }}>
      <FormField label="Name" htmlFor="routine-title">
        <Input id="routine-title" value={value.title} placeholder="e.g. Weekly link check" onChange={e => set({ title: e.target.value })} />
      </FormField>
      <FormField label="Agent" htmlFor="routine-agent">
        <NativeSelect id="routine-agent" value={value.agentId ?? ''} onChange={e => set({ agentId: e.target.value || null })}>
          <option value="">Choose</option>
          {(agents ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </NativeSelect>
      </FormField>
      <FormField label="Instructions" htmlFor="routine-instructions" hint="What should the agent do each time? Write it as you would ask it in a conversation.">
        <Textarea id="routine-instructions" rows={5} value={value.instructions} onChange={e => set({ instructions: e.target.value })} />
      </FormField>
      <FormField label="Cron expression" htmlFor="routine-cron" hint="Five fields: minute, hour, day of month, month, day of week." error={problem ?? undefined}>
        <Input id="routine-cron" className="font-mono" value={value.cron} onChange={e => set({ cron: e.target.value })} />
      </FormField>
      <FormField label="Timezone" htmlFor="routine-timezone">
        <Input id="routine-timezone" value={value.timezone} onChange={e => set({ timezone: e.target.value })} />
      </FormField>
      {!problem && (
        <p className="text-small text-text-secondary">
          {describeSchedule(value.cron, value.timezone)}{next ? ` · next ${next.toLocaleString()}` : ''}
        </p>
      )}
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy || !!problem || !value.title.trim()}>{submitLabel}</Button>
      </div>
    </form>
  )
}
