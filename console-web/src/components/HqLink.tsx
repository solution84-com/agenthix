import type { ReactNode } from 'react'

/**
 * A link into HQ at the address HQ gave, opened in a new tab: the Fleet Console's page is not handed to it
 * (`noopener`), nor is where the person came from (`noreferrer`). Drawn as a secondary button.
 */
export function HqLink({ address, path = '', children }: { address: string; path?: string; children: ReactNode }) {
  return (
    <a
      href={`${address}${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 rounded-button border border-border bg-button-secondary px-2.5 py-1 font-button text-micro text-text-primary transition-colors hover:bg-surface-hover"
    >
      {children}
    </a>
  )
}
