import { FileText, Loader2, X } from 'lucide-react'
import { DISABLED, FOCUS_RING, Tooltip, useRefusal, type Refusal } from '@agenthix/ui/primitives'
import type { SharedFiles, TrayItem } from '../hooks/useSharedFiles'
import { ShowAttention } from '@agenthix/ui/attention'

/** The model is known to read text only: said as soon as a picture is added, before sending, with one switch. */
export type TextOnlyWarning = { modelLabel: string; agentName: string; switchTo: { label: string; onSwitch: () => void } | null }

/** A picture the model cannot read: the chip is greyed, and a press says so and offers a model that can. */
function imageRefusal(w: TextOnlyWarning): Refusal {
  return {
    reason: `${w.modelLabel} can't see images`,
    title: `${w.modelLabel} can't see images`,
    detail: `${w.modelLabel} can't see images. ${w.agentName} will get the file, not what is in it.`,
    actions: w.switchTo ? [{ label: `Use ${w.switchTo.label}`, onClick: w.switchTo.onSwitch, variant: 'primary' }] : undefined,
  }
}

function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Item({ item, onRemove, refusal }: { item: TrayItem; onRemove: () => void; refusal?: Refusal }) {
  const refused = useRefusal(refusal)
  const name = item.file.name || 'File'
  const ring = item.state === 'failed' ? 'ring-1 ring-danger' : ''
  return (
    <li className="relative shrink-0" data-testid="shared-item" data-state={item.state}>
      {item.preview ? (refused.tooltip ? (
        <Tooltip label={refused.tooltip} side="top" wrap>
          <button type="button" aria-label={`${name}: ${refused.tooltip}`} {...refused.props} className={`block rounded-lg ${DISABLED} ${FOCUS_RING}`}>
            <img src={item.preview} alt={name} className={`size-14 rounded-lg border border-border-subtle object-cover ${ring}`} />
          </button>
        </Tooltip>
      ) : (
        <img src={item.preview} alt={name} className={`size-14 rounded-lg border border-border-subtle object-cover ${ring}`} />
      )) : (
        <span className={`flex h-14 max-w-48 items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-2.5 ${ring}`}>
          <FileText size={16} aria-hidden className="shrink-0 text-text-muted" />
          <span className="min-w-0">
            <span className="block truncate text-small text-text-primary">{name}</span>
            <span className="block text-micro text-text-muted">{sizeWords(item.file.size)}</span>
          </span>
        </span>
      )}
      {refused.dialog}
      {item.state === 'keeping' && (
        <span role="status" aria-label={`Adding ${name}`} className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface-1/70">
          <Loader2 size={16} aria-hidden className="animate-spin text-text-secondary" />
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        title="Remove"
        onClick={onRemove}
        disabled={item.state === 'keeping'}
        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-surface-1 text-text-secondary not-disabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 max-lg:size-7"
      >
        <X size={12} aria-hidden />
      </button>
    </li>
  )
}

/**
 * What is added to the message box before sending, above what is typed: a thumbnail for a picture, a chip for a
 * file, each with ✕; why one could not be added; and, when the model is known to read text only, that it can't see
 * the picture, with a switch to one that can.
 */
export function SharedTray({ shared, textOnly }: { shared: SharedFiles; textOnly: TextOnlyWarning | null }) {
  const failed = shared.items.find(i => i.state === 'failed')
  const failures = (
    <>
      <ShowAttention kind="alert" text={failed?.error} title="A file could not be added" />
      <ShowAttention kind="alert" text={shared.notice} title="Those files were not added" />
    </>
  )
  if (shared.items.length === 0) return failures
  return (
    <div className="px-1.5 pb-1" data-testid="shared-tray">
      {failures}
      {shared.items.length > 0 && (
        <ul aria-label="Added to the message" className="flex gap-2 overflow-x-auto px-1 pb-1 pt-2">
          {shared.items.map(item => <Item key={item.id} item={item} onRemove={() => shared.remove(item.id)} refusal={textOnly && item.preview ? imageRefusal(textOnly) : undefined} />)}
        </ul>
      )}
    </div>
  )
}
