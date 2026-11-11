import { useState } from 'react'
import { Button, Modal } from '@agenthix/ui/primitives'
import { useCloudAsk } from '../../cloud/api'
import { CloudAskNotice } from '../../cloud/CloudMark'
import { DEFAULT_MINUTES, LENGTHS, lengthLabel } from './words'

/** Turning remote access on, at the Fleet Console's machine: for how long, and the one thing to know first. */
export function TurnOnModal({ open, org, extend = false, onClose, onDone }: { open: boolean; org: string | null; extend?: boolean; onClose: () => void; onDone?: () => void }) {
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)
  const { ask, send, reset } = useCloudAsk()
  const close = () => { reset(); onClose() }
  return (
    <Modal open={open} onClose={close} title={extend ? 'Extend remote access by…' : 'Turn on remote access for…'}>
      <div role="radiogroup" aria-label="How long" className="flex flex-wrap gap-2">
        {LENGTHS.map(l => (
          <button
            key={l.minutes} type="button" role="radio" aria-checked={minutes === l.minutes} onClick={() => setMinutes(l.minutes)}
            className={`rounded-button border px-3 py-1.5 text-small ${minutes === l.minutes ? 'border-accent bg-accent-subtle font-semibold text-text-primary' : 'border-border bg-card text-text-secondary hover:bg-surface-hover'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-micro text-text-muted">2 hours unless you choose; 8 is the longest.</p>
      <p className="mt-3 text-small text-text-primary">
        <b className="font-semibold">Every fleet admin and organisation admin{org ? ` of ${org}` : ''} is told</b> now, and again for each session.
      </p>
      <p className="mt-3 rounded-lg border border-warning/35 bg-warning/7 px-3 py-2 text-small text-text-primary">
        <b className="font-semibold">One thing to know.</b> The address is under Cloud's domain. Cloud cannot read your sessions, but
        because it controls that domain it could in principle obtain a certificate for it and pose as this Fleet Console. That is
        why remote access is off unless someone at this machine turns it on, and why it ends by itself.
      </p>
      <div className="mt-3"><CloudAskNotice ask={ask} /></div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button disabled={ask.phase === 'working'} onClick={() => void send('POST', '/remote-access', { forMinutes: minutes }).then(answer => { if (answer !== null) { close(); onDone?.() } })}>
          {extend ? 'Extend' : 'Turn on'} for {lengthLabel(minutes)}
        </Button>
      </div>
    </Modal>
  )
}
