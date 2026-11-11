import { useRef, useState } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { copyText, COPY_FAILED_WORDS } from '../../shared/copyText'
import { BRANDING } from '@agenthix/core'
import { ShowAttention } from '@agenthix/ui/attention'

interface Props {
  name: string
  token: string
  mcpUrl: string
  onDone: () => void
}

/** A new connection's token, shown this once — hq keeps only its hash. */
export function NewConnectionToken({ name, token, mcpUrl, onDone }: Props) {
  const [copied, setCopied] = useState<'token' | 'url' | 'command' | 'failed' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const command = `claude mcp add --transport http ${BRANDING.cliCommand} ${mcpUrl} --header "Authorization: Bearer ${token}"`

  async function copy(what: 'token' | 'url' | 'command', value: string) {
    const ok = await copyText(value)
    setCopied(ok ? what : 'failed')
    if (timer.current) clearTimeout(timer.current)
    if (ok) timer.current = setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-text-primary font-medium">“{name}” is ready</h2>
        <p className="text-warning text-small font-medium mt-1">
          Copy the token now. It is not shown again — if you lose it, revoke this connection and create another.
        </p>
      </div>

      <ShowAttention kind="alert" text={copied === 'failed' ? COPY_FAILED_WORDS : null} title="Nothing was copied" onClose={() => setCopied(null)} />
      <Field label="Token" value={token} copied={copied === 'token'} onCopy={() => copy('token', token)} />
      <Field label="Address" value={mcpUrl} copied={copied === 'url'} onCopy={() => copy('url', mcpUrl)} />
      <Field
        label="Add it to Claude Code"
        value={command}
        copied={copied === 'command'}
        onCopy={() => copy('command', command)}
      />

      <div className="flex justify-end">
        <Button variant="secondary" onClick={onDone}>I have copied it</Button>
      </div>
    </div>
  )
}

function Field({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <p className="text-small text-text-muted mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-field border border-field-border rounded-lg px-3 py-2">
        <code className="flex-1 text-small font-mono text-text-primary break-all">{value}</code>
        <Button variant="ghost" size="sm" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
    </div>
  )
}
