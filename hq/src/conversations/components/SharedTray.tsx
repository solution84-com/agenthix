import { FileText, Loader2, X } from 'lucide-react'
import type { SharedFiles, TrayItem } from '../hooks/useSharedFiles'

/** The model is known to read text only: said as soon as a picture is added, before sending, with one switch. */
export type TextOnlyWarning = { modelLabel: string; agentName: string; switchTo: { label: string; onSwitch: () => void } | null }

function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Item({ item, onRemove }: { item: TrayItem; onRemove: () => void }) {
  const name = item.file.name || 'File'
  const ring = item.state === 'failed' ? 'ring-1 ring-danger' : ''
  return (
    <li className="relative shrink-0" data-testid="shared-item" data-state={item.state}>
      {item.preview ? (
        <img src={item.preview} alt={name} className={`size-14 rounded-lg border border-border-subtle object-cover ${ring}`} />
      ) : (
        <span className={`flex h-14 max-w-48 items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-2.5 ${ring}`}>
          <FileText size={16} aria-hidden className="shrink-0 text-text-muted" />
          <span className="min-w-0">
            <span className="block truncate text-small text-text-primary">{name}</span>
            <span className="block text-micro text-text-muted">{sizeWords(item.file.size)}</span>
          </span>
        </span>
      )}
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
        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-surface-1 text-text-secondary hover:text-text-primary disabled:opacity-50 max-lg:size-7"
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
  if (shared.items.length === 0 && !shared.notice) return null
  return (
    <div className="px-1.5 pb-1" data-testid="shared-tray">
      {shared.items.length > 0 && (
        <ul aria-label="Added to the message" className="flex gap-2 overflow-x-auto px-1 pb-1 pt-2">
          {shared.items.map(item => <Item key={item.id} item={item} onRemove={() => shared.remove(item.id)} />)}
        </ul>
      )}
      {textOnly && shared.hasImage && (
        <p role="status" data-testid="text-only-warning" className="flex flex-wrap items-center gap-x-2 px-1 pt-1 text-small text-text-secondary">
          <span>{textOnly.modelLabel} can't see images. {textOnly.agentName} will get the file, not what is in it.</span>
          {textOnly.switchTo && (
            <button type="button" onClick={textOnly.switchTo.onSwitch} className="font-medium text-accent hover:underline max-lg:min-h-10">
              Use {textOnly.switchTo.label}
            </button>
          )}
        </p>
      )}
      {failed?.error && <p role="alert" className="px-1 pt-1 text-small text-danger">{failed.error}</p>}
      {shared.notice && <p role="alert" className="px-1 pt-1 text-small text-danger">{shared.notice}</p>}
    </div>
  )
}
