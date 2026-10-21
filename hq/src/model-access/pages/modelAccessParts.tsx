import { useState, type ReactNode } from 'react'

export type ModelAccessOwnerType = 'org' | 'project' | 'user'

export interface BlockProps {
  ownerType: ModelAccessOwnerType
  ownerId: string
}

export const CARD = 'bg-surface-1 border border-border rounded-xl p-6 space-y-4'
export const BUTTON = 'bg-accent hover:bg-accent/90 disabled:opacity-50 text-on-accent px-4 py-2 rounded-lg text-body font-medium transition-colors cursor-pointer'
export const INPUT = 'flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent'
export const CANCEL = 'border border-border bg-surface-1 hover:bg-surface-hover text-text-secondary px-4 py-2 rounded-lg text-body font-medium transition-colors cursor-pointer'
export const REMOVE = 'text-body text-danger disabled:opacity-50 cursor-pointer'

/** Runs one save/remove at a time and keeps the server's refusal to show. */
export function useCredentialCall() {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function run(work: () => Promise<unknown>): Promise<boolean> {
    setProblem(null)
    setBusy(true)
    try {
      await work()
      return true
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, problem, run }
}

export function CardHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-h3 font-semibold text-text-primary">{title}</h3>
      <p className="text-small text-text-secondary mt-0.5">{children}</p>
    </div>
  )
}

export function CancelButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className={CANCEL}>Cancel</button>
}
