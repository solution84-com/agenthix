import { useState } from 'react'
import { BRANDING, type HostRequest } from '@agenthix/core'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'
import { NOW_CHOICE, Notice, parseWhen, Say, ScheduleWhen, type WhenChoice } from '../../components'
import { navigate } from '../../router'
import { Steps } from '../add/JoinParts'
import { whenIs } from '../dashboard/words'
import { commandWords, erasedAddress, GRACE_DAYS, hostOf, type CommandRun } from './hqWords'

/**
 * *Erase HQ on hq-box?* (board *Suspend, resume and erase*, spec §15): the final export offered, at once or on a date
 * with notice, what happens and what is kept for how long, and HQ's address typed in.
 */
export function EraseModal({ open, machineName, address, locationSet, run, onErase, onClose }: {
  open: boolean
  machineName: string
  /** HQ's address as HQ gave it; without it the erase cannot be confirmed here. */
  address: string | null
  locationSet: boolean
  run: { action: 'erase' | 'eraseLater'; run: CommandRun }
  onErase: (request: HostRequest, scheduled: boolean) => void
  onClose: () => void
}) {
  const [when, setWhen] = useState<WhenChoice>(NOW_CHOICE)
  const [typed, setTyped] = useState('')
  const [atError, setAtError] = useState<string | undefined>()
  const confirmed = address ? erasedAddress(typed, address) : null
  const said = run.run.phase === 'refused' ? commandWords(run.action, run.run) : null
  const later = when.mode === 'later'
  const shownAt = later && when.at && !Number.isNaN(new Date(when.at).getTime()) ? whenIs(new Date(when.at).toISOString(), new Date()) : 'the date you choose'

  const erase = () => {
    if (!confirmed) return
    const t = parseWhen(when, new Date())
    if (!t.ok) return setAtError(t.error)
    setAtError(undefined)
    const change = { op: 'erase', target: 'hq', confirmAddress: confirmed } as const
    onErase(t.at ? { op: 'schedule', at: t.at, change } : change, t.at !== null)
  }

  return (
    <Modal open={open} onClose={onClose} title={`Erase HQ on ${machineName}?`} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-3 text-body text-text-primary">
        <Say lead="Take a final export first?">It is the only copy that outlives the grace period, and only you hold its key.</Say>
        <div><Button variant="secondary" type="button" onClick={() => navigate('/backups')}>Export a backup first…</Button></div>

        <ScheduleWhen value={when} onChange={setWhen} error={atError} idPrefix="erase-when" nowHint="HQ stops answering as soon as you confirm." />
        {later ? (
          <Say lead="What everyone in HQ sees until then:">This HQ will be erased on {shownAt} by a fleet admin. Export what you need, or ask them to cancel.</Say>
        ) : (
          <Say warn lead="People who use this HQ won't see a notice unless you give notice.">
            We recommend choosing a date. Without one they find out only when HQ stops answering.
          </Say>
        )}

        <Steps steps={[
          { label: 'A final sealed backup is taken', state: 'todo' },
          { label: `HQ's running data is removed from ${machineName}`, detail: 'Nobody can sign in. Sites lose their HQ; their workspaces stay on their own machines.', state: 'todo' },
          {
            label: `For ${GRACE_DAYS} days from then, it can come back`,
            detail: `The final backup${locationSet ? ' and its copy in the backup location are' : ' is'} kept; restoring brings HQ back. Every fleet admin and organisation admin is told.`,
            state: 'todo',
          },
        ]} />

        {address ? (
          <FormField label="Type HQ's address to confirm" htmlFor="erase-confirm">
            <Input id="erase-confirm" value={typed} placeholder={`Type ${hostOf(address)}`} autoComplete="off" onChange={e => setTyped(e.target.value)} />
          </FormField>
        ) : null}
        {said && <Notice title={said.title}>{said.text}</Notice>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button variant="danger" type="button" disabled={address ? !confirmed || run.run.phase === 'working' : undefined} onClick={erase}
          refusal={address ? undefined : {
            reason: 'HQ has not said its address, so the erase cannot be confirmed here.',
            detail: <>HQ has not said its address, so the erase cannot be confirmed here. On {machineName}, run <code className="font-mono">{BRANDING.cliCommand} hq erase</code>.</>,
          }}>
          {later ? 'Schedule the erase' : 'Erase HQ now'}
        </Button>
      </div>
    </Modal>
  )
}
