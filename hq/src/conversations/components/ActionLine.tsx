import { useState } from 'react'
import { Link } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { ActionBody } from '../../shared/conversations/protocol'
import { MemoryDialog } from '../../memory/screen/pages/MemoryDialog'
import { showInTool } from '../toolLink'

const LINK = `rounded font-medium text-link hover:underline max-lg:inline-flex max-lg:min-h-10 max-lg:items-center ${FOCUS_RING}`

/** A tool call that changed something, as one quiet line; *Show in …* opens the tool with the item marked. */
export function ActionLine({ body, placePath }: { body: ActionBody; placePath?: string }) {
  const memoryId = body.target?.kind === 'memory' ? body.target.params?.item : undefined
  if (memoryId) return <RememberedLine text={body.text} memoryId={memoryId} />
  const link = showInTool(body.target, placePath)
  return (
    <p data-testid="action-line" className="text-center text-micro text-text-muted">
      {body.text}
      {link && (
        <>
          <span aria-hidden> · </span>
          <Link to={link.href} className={LINK}>{link.label}</Link>
        </>
      )}
    </p>
  )
}

/**
 * "✓ Kernel remembered this", for a memory the person asked for (ADR-0188): Show opens the memory's dialog in place,
 * over the chat however it is laid out, to promote or forget it.
 */
function RememberedLine({ text, memoryId }: { text: string; memoryId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <p data-testid="action-line" className="text-center text-micro text-text-muted">
      <span aria-hidden>✓ </span>
      {text}
      <span aria-hidden> · </span>
      <button type="button" onClick={() => setOpen(true)} className={`cursor-pointer ${LINK}`}>Show</button>
      <MemoryDialog itemId={open ? memoryId : null} onClose={() => setOpen(false)} fromOutside />
    </p>
  )
}
