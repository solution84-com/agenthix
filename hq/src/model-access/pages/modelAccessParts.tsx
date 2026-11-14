import { useState, type ReactNode } from 'react'
import { Button, FIELD } from '@agenthix/ui/primitives'
import { pressFailureWords } from '../../shared/failureWords'

export type ModelAccessOwnerType = 'org' | 'project' | 'user'

export interface BlockProps {
  ownerType: ModelAccessOwnerType
  ownerId: string
}

export const CARD = 'bg-surface-1 border border-border rounded-xl p-6 space-y-4'
export const INPUT = `flex-1 rounded-lg ${FIELD} px-3 py-2 text-body`

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
      setProblem(pressFailureWords(err))
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
      <h3 className="text-h3 font-medium text-text-primary">{title}</h3>
      <p className="text-small text-text-secondary mt-0.5">{children}</p>
    </div>
  )
}

export function CancelButton({ onClick }: { onClick: () => void }) {
  return <Button type="button" variant="secondary" onClick={onClick}>Cancel</Button>
}
