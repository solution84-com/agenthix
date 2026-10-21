import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyText } from '../../shared/copyText'

/**
 * Under the agent's words once its turn has ended, never while it streams: *Copy*. Read aloud waits for a way to
 * speak one message; voice today speaks only the reply being written.
 */
export function ReplyActions({ text }: { text: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <div className="flex items-center gap-3 text-micro text-text-muted" data-testid="reply-actions">
      <button
        type="button"
        onClick={() => void copyText(text).then(setCopied)}
        className="inline-flex items-center gap-1 hover:text-text-primary max-lg:min-h-10"
      >
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
        {copied ? 'Copied' : copied === false ? 'Could not copy' : 'Copy'}
      </button>
    </div>
  )
}
