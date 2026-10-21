import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

/**
 * The ⋯ menu of an agent's settings page: Stop its runs, and Delete. The built-in agent cannot be deleted
 * (the server refuses it too, `kernelGuards.ts`), so its menu has no Delete at all.
 */
export function ManageMenu({ isKernel, onStop, onDelete }: { isKernel: boolean; onStop: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const item = 'block w-full px-3 py-2 text-left text-body hover:bg-surface-hover'
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="rounded-lg border border-border p-1.5 text-text-secondary hover:bg-surface-hover"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-lg">
          <button type="button" role="menuitem" className={`${item} text-text-primary`} onClick={() => { setOpen(false); onStop() }}>Stop its runs</button>
          {!isKernel && (
            <button type="button" role="menuitem" className={`${item} text-danger`} onClick={() => { setOpen(false); onDelete() }}>Delete</button>
          )}
        </div>
      )}
    </div>
  )
}
