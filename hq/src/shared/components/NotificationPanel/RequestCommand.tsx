import { useState } from 'react'

/** A command longer than this shows its first lines, faded, until it is expanded. */
export const COMMAND_PREVIEW_LINES = 6

/**
 * One thing a tool request wants to run, as code. A long script shows its
 * first six lines with a fade and "Show the full script (N lines)".
 */
export function RequestCommand({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const lines = text.split('\n')
  const capped = !expanded && lines.length > COMMAND_PREVIEW_LINES
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2">
      <div className="relative">
        <pre className="overflow-x-auto whitespace-pre px-3 py-2 font-mono text-micro text-text-primary">
          {capped ? lines.slice(0, COMMAND_PREVIEW_LINES).join('\n') : text}
        </pre>
        {capped && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-2 to-transparent" />}
      </div>
      {capped && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full border-t border-border-subtle px-3 py-1.5 text-left text-micro text-accent hover:bg-surface-hover"
        >
          Show the full script ({lines.length} lines)
        </button>
      )}
    </div>
  )
}
