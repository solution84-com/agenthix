import { useState } from 'react'

/** A node's children are drawn this many at a time, so a huge array never mounts thousands of rows at once. */
const PAGE = 200

const isBranch = (v: unknown): v is object => typeof v === 'object' && v !== null

export function describeJson(value: unknown): string {
  if (Array.isArray(value)) return `array, ${value.length.toLocaleString('en-GB')} ${value.length === 1 ? 'item' : 'items'}`
  if (isBranch(value)) {
    const n = Object.keys(value).length
    return `object, ${n.toLocaleString('en-GB')} ${n === 1 ? 'key' : 'keys'}`
  }
  return typeof value === 'string' ? 'string' : value === null ? 'null' : typeof value
}

function Leaf({ value }: { value: unknown }) {
  if (typeof value === 'string') return <span className="break-words text-syntax-string">{JSON.stringify(value)}</span>
  if (typeof value === 'number') return <span className="text-syntax-number">{String(value)}</span>
  return <span className="text-syntax-keyword">{String(value)}</span>
}

function summary(value: object): string {
  if (Array.isArray(value)) return `[${value.length}]`
  return `{${Object.keys(value).length}}`
}

function Node({ name, value, open: startOpen }: { name?: string; value: unknown; open: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const [shown, setShown] = useState(PAGE)
  const label = name === undefined ? null : <span className="text-syntax-attr">{name}: </span>
  if (!isBranch(value)) {
    return <div role="treeitem" aria-selected="false" className="py-0.5 pl-5">{label}<Leaf value={value} /></div>
  }
  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value)
  return (
    <div role="treeitem" aria-selected="false" aria-expanded={open}>
      <button
        type="button" onClick={() => setOpen(!open)} aria-label={`${name ?? 'root'} ${summary(value)}`}
        className="flex items-baseline gap-1.5 rounded-sm py-0.5 text-left hover:bg-selected"
      >
        <span aria-hidden className="w-3.5 text-text-muted">{open ? '▾' : '▸'}</span>
        <span>{label}<span className="text-text-muted">{summary(value)}</span></span>
      </button>
      {open && (
        <div role="group" className="ml-1.5 border-l border-border-subtle pl-3">
          {entries.slice(0, shown).map(([key, child]) => <Node key={key} name={key} value={child} open={false} />)}
          {entries.length > shown && (
            <button type="button" onClick={() => setShown(shown + PAGE)} className="py-0.5 pl-5 text-text-secondary hover:text-text-primary">
              Show {Math.min(PAGE, entries.length - shown).toLocaleString('en-GB')} more of {(entries.length - shown).toLocaleString('en-GB')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** JSON as a tree, folded below the first level. Every fold is a button, so the keyboard reaches it. Values are text. */
export function JsonTree({ value }: { value: unknown }) {
  return (
    <div role="tree" aria-label="JSON" className="font-mono text-small text-text-primary">
      <Node value={value} open />
    </div>
  )
}
