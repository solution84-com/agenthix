import { useState } from 'react'
import { useQuery, getGitHubInstallLink } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { copyText } from '../../shared/copyText'

/** The link and the note to send a client's GitHub organisation owner (G1, part 3). */
export function InstallLinkDialog({ onClose }: { onClose: () => void }) {
  const { data, error } = useQuery(getGitHubInstallLink)
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (what: string, text: string) => {
    setCopied((await copyText(text)) ? what : null)
  }
  return (
    <Modal open onClose={onClose} title="Install link for a client" maxWidth="max-w-lg">
      <div className="space-y-3" data-testid="install-link-dialog">
        {error && <p role="alert" className="text-small text-danger">{(error as Error).message}</p>}
        {!data && !error && <p className="text-small text-text-muted">Loading…</p>}
        {data && (
          <>
            <p className="text-small text-text-secondary">
              Send this to an owner of your client's GitHub organisation. They install the App on their side; you then allow it here and choose the projects that use it.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-2 px-3 py-2 text-small">{data.url}</code>
              <Button variant="secondary" size="sm" onClick={() => void copy('link', data.url)}>{copied === 'link' ? 'Copied' : 'Copy'}</Button>
            </div>
            <div>
              <h3 className="text-small font-semibold text-text-primary">A note to send with it</h3>
              <p className="whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 text-small text-text-secondary">{data.note}</p>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          {data && <Button variant="secondary" onClick={() => void copy('note', data.note)}>{copied === 'note' ? 'Copied' : 'Copy the note'}</Button>}
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}
