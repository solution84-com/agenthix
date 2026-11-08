import { Square } from 'lucide-react'
import { Button, Modal } from '@agenthix/ui/primitives'
import { RunAvatar } from '@agenthix/ui/tasks'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import type { WorkroomAgent } from './workroomTypes'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function titles(a: WorkroomAgent): string {
  return [...a.now.map(r => r.title ?? 'a reply'), ...a.line.map(t => t.title)].join('; ')
}

/**
 * Stop every run… asks once (the Workroom design, N4): the count, the agents and what happens to their tasks — the
 * running ones stop after their current step and keep what they did, the waiting ones go back to Not started. Its
 * one filled button is the stop. `whose` names the runs on Workrooms, where only the viewer's own are stopped.
 */
export function StopEveryRunDialog({ where, agents, onCancel, onStop, busy, whose = 'every' }: {
  where: string
  agents: WorkroomAgent[]
  onCancel: () => void
  onStop: () => void
  busy: boolean
  whose?: 'every' | 'yours'
}) {
  const at = agents.filter(a => a.now.length + a.line.length > 0)
  const running = at.reduce((n, a) => n + a.now.length, 0)
  const waiting = at.reduce((n, a) => n + a.line.length, 0)
  const total = running + waiting
  return (
    <Modal open onClose={onCancel} title={whose === 'yours' ? 'Stop every run of yours?' : `Stop every run in ${where}?`} maxWidth="max-w-xl" closeLabel="Close">
      <p className="text-body text-text-secondary">
        Stops <b className="font-semibold text-text-primary">{plural(total, 'run')}</b>, the {running} running and the {waiting} that wait for someone:
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {at.map((a, i) => (
          <li key={`${a.agentId}-${i}`} className="flex min-w-0 items-center gap-2">
            <RunAvatar name={a.name} state={a.ring}>
              <AuthedAgentAvatar name={a.name} avatarUrl={a.avatarUrl} size="sm" />
            </RunAvatar>
            <b className="shrink-0 font-medium text-text-primary">{a.name}</b>
            <span className="min-w-0 truncate text-small text-text-secondary" title={titles(a)}>{titles(a)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-body text-text-secondary">
        Each stops after its current step; its task keeps what it did.
        {waiting > 0 && <> The <b className="font-semibold text-text-primary">{plural(waiting, 'waiting task')}</b> {waiting === 1 ? 'is' : 'are'} taken out of line and go back to <b className="font-semibold text-text-primary">Not started</b>.</>}
        {' '}Nothing more starts until someone starts it.
      </p>
      <div className="mt-4 flex justify-end gap-2 border-t border-border-subtle pt-4 max-sm:[&>*]:flex-1 max-sm:[&>*]:justify-center">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="danger" disabled={busy || total === 0} leadingIcon={<Square size={14} aria-hidden className="fill-current" />} onClick={onStop}>
          Stop {plural(total, 'run')}
        </Button>
      </div>
    </Modal>
  )
}
