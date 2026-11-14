import { createContext, useContext, type ReactNode } from 'react'

const FailureServerContext = createContext<string | null>(null)

/**
 * Who the screens' requests go to ("HQ", "the Fleet Console"), set once at an app's root, so a failure handed to the
 * attention dialog or a nudge (`useAttentionWhen`, `ShowAttention`) is said in words by `failureWords`, never as a
 * request's address or a status line.
 */
export function FailureServer({ name, children }: { name: string; children: ReactNode }) {
  return <FailureServerContext.Provider value={name}>{children}</FailureServerContext.Provider>
}

/** The server named by the nearest `FailureServer`, or null outside one. */
export function useFailureServer(): string | null {
  return useContext(FailureServerContext)
}
