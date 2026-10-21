import { useState } from 'react'
import { Link } from 'react-router'
import { logLineText, type LogLine } from '@agenthix/core'
import { copyText } from '../../shared/copyText'
import { LEVEL_LABEL, lineTime } from './diagnosticsWords'

const LEVEL_CLASS = { error: 'text-danger', warn: 'text-warning', info: 'text-text-muted' } as const

function runAddress(line: LogLine): string | null {
  const runId = line.fields?.runId
  if (typeof runId !== 'string' || !runId) return null
  // The Runs screen opens a run only with its session; without one there is nothing to link to.
  const session = line.fields?.sessionId
  return typeof session === 'string' && session ? `/runs/${runId}?session=${session}` : null
}

/** One log line; opening it shows it in full. */
export function LogLineRow({ line }: { line: LogLine }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<boolean | 'failed'>(false)
  const run = runAddress(line)

  async function copy() {
    setCopied((await copyText(logLineText(line, { multiline: true }))) ? true : 'failed')
  }

  return (
    <li className="py-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="block w-full cursor-pointer text-left"
      >
        <span className="flex flex-wrap items-baseline gap-x-3 text-small">
          <span className="font-mono text-micro text-text-muted">{lineTime(line.at)}</span>
          <span className={`font-medium ${LEVEL_CLASS[line.level]}`}>{LEVEL_LABEL[line.level]}</span>
          <span className="font-mono text-micro text-text-muted">{line.source}</span>
        </span>
        <span className={`block break-words text-small text-text-primary ${open ? '' : 'line-clamp-2'}`}>{line.message}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-surface-2 p-3">
          {line.fields && (
            <pre className="mb-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-micro text-text-secondary">
              {JSON.stringify(line.fields, null, 2)}
            </pre>
          )}
          <div className="flex gap-3 text-small">
            {run && <Link to={run} className="font-medium text-accent hover:text-accent-hover">Open the run</Link>}
            <button type="button" onClick={copy} className="cursor-pointer font-medium text-accent hover:text-accent-hover">
              {copied === 'failed' ? 'Could not copy: select the text' : copied ? 'Copied' : 'Copy this line'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
