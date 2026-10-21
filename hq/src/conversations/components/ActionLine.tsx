import { Link } from 'react-router'
import type { ActionBody } from '../../shared/conversations/protocol'
import { showInTool } from '../toolLink'

/** A tool call that changed something, as one quiet line; *Show in …* opens the tool with the item marked. */
export function ActionLine({ body, placePath }: { body: ActionBody; placePath?: string }) {
  const link = showInTool(body.target, placePath)
  return (
    <p data-testid="action-line" className="text-center text-micro text-text-muted">
      {body.text}
      {link && (
        <>
          <span aria-hidden> · </span>
          <Link to={link.href} className="font-medium text-accent hover:underline max-lg:inline-flex max-lg:min-h-10 max-lg:items-center">
            {link.label}
          </Link>
        </>
      )}
    </p>
  )
}
