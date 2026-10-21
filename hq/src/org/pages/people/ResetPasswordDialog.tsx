import { useState } from 'react'
import { useAction, createPasswordResetLink } from 'wasp/client/operations'
import { Modal, Button } from '@agenthix/ui/primitives'
import { BRANDING } from '@agenthix/core'
import { COPY_FAILED_WORDS } from '../../../shared/copyText'
import { useCopy } from '../../../shared/hooks/useCopy'

type Made = { link: string; worksOnlyHere: boolean }

/**
 * Organisation › People › a person › ⋯ › Reset password (getting-in spec, Getting
 * back in): a one-time link good for an hour, shown once, for the admin to send.
 * No one learns the new password. Making a link ends any earlier one, so it is
 * made on the button, not on opening.
 */
export function ResetPasswordDialog({ person, open, onClose }: { person: { userId: string; name: string }; open: boolean; onClose: () => void }) {
  const make = useAction(createPasswordResetLink)
  const [made, setMade] = useState<Made | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copier = useCopy()

  function close() {
    setMade(null); setError(null)
    onClose()
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const r = await make({ userId: person.userId })
      setMade({ link: r.link, worksOnlyHere: r.addressWorksOnlyHere })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (made) await copier.copy(made.link)
  }

  return (
    <Modal open={open} onClose={close} title={`Reset ${person.name}'s password`} maxWidth="max-w-xl">
      {!made ? (
        <>
          <p className="mb-4 text-body text-text-secondary">
            Make a one-time link to send {person.name}. It works once, for the next hour, and any earlier link for them stops working. {person.name}'s other sign-ins end when they set a new password.
          </p>
          {error && <p role="alert" className="mb-3 text-small text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void create()}>{busy ? 'Making…' : 'Make link'}</Button>
            <Button variant="secondary" onClick={close}>Cancel</Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-body text-text-secondary">Send {person.name} this link. It works once, for the next hour, and is not shown again.</p>
          <div className="select-all break-all rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-small text-text-secondary">{made.link}</div>
          {made.worksOnlyHere && (
            <p role="status" className="mt-1.5 rounded-lg border border-warning/60 px-3 py-2 text-small text-text-secondary">
              <b className="font-medium text-text-primary">This link works only on this computer.</b> Set HQ's address in Infrastructure › HQ.
            </p>
          )}
          <p className="mt-1.5 text-small text-text-muted">{BRANDING.displayName} sends no email: copy it and send it yourself. No one, including you, learns the new password.</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void copy()}>{copier.state === 'copied' ? 'Copied' : 'Copy link'}</Button>
            <Button variant="secondary" onClick={close}>Done</Button>
          </div>
          {copier.state === 'failed' && <p role="alert" className="mt-2 text-small text-danger">{COPY_FAILED_WORDS}</p>}
        </>
      )}
    </Modal>
  )
}
